import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { History, TrendingUp, TrendingDown, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";

export type RecordedSide = "buy" | "sell";
export type RecordedOrderType = "market" | "limit" | "stop" | "stop_limit";

export interface RecordedOrder {
  id: string;
  side: RecordedSide;
  symbol: string;
  quantity: number;
  orderType: RecordedOrderType;
  status: string;
  placedAt: number;
  // Broker order id captured at placement (when available) so live status
  // reconciliation can match precisely instead of guessing by symbol/side/time.
  brokerOrderId?: string;
  // When the status was last refreshed from the broker (undefined if never).
  updatedAt?: number;
}

interface AgentOrdersContextValue {
  orders: RecordedOrder[];
  recordOrder: (order: Omit<RecordedOrder, "id" | "placedAt" | "updatedAt">) => void;
  isRefreshing: boolean;
}

const AgentOrdersContext = createContext<AgentOrdersContextValue | null>(null);

const MAX_ORDERS = 20;
const STORAGE_PREFIX = "fincai:agent-orders:";

function storageKeyFor(userId?: string): string {
  return `${STORAGE_PREFIX}${userId ?? "anon"}`;
}

function loadOrders(userId?: string): RecordedOrder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKeyFor(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (o): o is RecordedOrder =>
          o &&
          typeof o.id === "string" &&
          (o.side === "buy" || o.side === "sell") &&
          typeof o.symbol === "string" &&
          typeof o.quantity === "number" &&
          typeof o.orderType === "string" &&
          typeof o.status === "string" &&
          typeof o.placedAt === "number",
      )
      .map((o) => ({
        ...o,
        brokerOrderId: typeof o.brokerOrderId === "string" ? o.brokerOrderId : undefined,
        updatedAt: typeof o.updatedAt === "number" ? o.updatedAt : undefined,
      }))
      .slice(0, MAX_ORDERS);
  } catch {
    return [];
  }
}

const POLL_INTERVAL_MS = 8000;

interface AgentToolInfo {
  name: string;
  description?: string;
}

interface AgentConnectionStatus {
  status: "disconnected" | "authorizing" | "connected" | "error";
  tools: AgentToolInfo[];
}

// Resolve the connected MCP tool that lists existing orders so we can poll for
// live fill/reject status. Robinhood is expected to expose `get_orders`, but we
// match defensively across common names and a conservative fuzzy fallback that
// requires the plural "orders" (so single-order or place_order tools are skipped).
function resolveOrdersTool(tools: AgentToolInfo[]): string | null {
  const preferred = ["get_orders", "list_orders", "get_all_orders", "get_open_orders", "orders"];
  for (const name of preferred) {
    const exact = tools.find((t) => t.name === name);
    if (exact) return exact.name;
  }
  const fuzzy = tools.find((t) =>
    /(get|list|fetch|view|all|recent|open)[_\s-]*orders\b/i.test(t.name) ||
    /\borders\b[_\s-]*(get|list|fetch|status|history)/i.test(t.name),
  );
  return fuzzy?.name ?? null;
}

// Unwrap an MCP CallToolResult into a plain payload (structuredContent if
// present, otherwise JSON parsed from the first text content block).
function unwrapMcpPayload(result: any): any {
  let payload: any = result?.structuredContent ?? null;
  if (!payload && Array.isArray(result?.content)) {
    const text = result.content.find((c: any) => c?.type === "text" && typeof c.text === "string")?.text;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        /* not JSON — leave payload null */
      }
    }
  }
  if (!payload) payload = result;
  return payload;
}

interface BrokerOrder {
  id?: string;
  symbol: string;
  side: "buy" | "sell" | "";
  quantity?: number;
  status: string;
  createdAt?: number;
}

// Normalize an orders-listing MCP result into a flat list. The exact payload
// shape isn't guaranteed, so we probe common field names and drop anything we
// can't recognize (callers keep the placement-time status for unmatched orders).
function normalizeBrokerOrders(result: any): BrokerOrder[] {
  const payload = unwrapMcpPayload(result);
  const raw: any[] = Array.isArray(payload)
    ? payload
    : payload?.orders || payload?.results || payload?.data || payload?.items || [];
  if (!Array.isArray(raw)) return [];

  return raw
    .map((o: any): BrokerOrder => {
      const symbol = String(o?.symbol ?? o?.ticker ?? o?.instrument ?? "").toUpperCase();
      const sideRaw = String(o?.side ?? o?.action ?? o?.direction ?? "").toLowerCase();
      const side: BrokerOrder["side"] = sideRaw.includes("sell")
        ? "sell"
        : sideRaw.includes("buy")
          ? "buy"
          : "";
      const statusRaw = o?.status ?? o?.state ?? o?.order_status ?? o?.orderStatus;
      const status = typeof statusRaw === "string" ? statusRaw : "";
      const qtyRaw = o?.quantity ?? o?.qty ?? o?.shares ?? o?.amount;
      const qtyNum = qtyRaw != null ? Number(qtyRaw) : NaN;
      const quantity = Number.isFinite(qtyNum) ? qtyNum : undefined;
      const idRaw = o?.id ?? o?.order_id ?? o?.orderId ?? o?.client_order_id;
      const createdRaw = o?.created_at ?? o?.createdAt ?? o?.placed_at ?? o?.timestamp ?? o?.created;
      let createdAt: number | undefined;
      if (createdRaw != null) {
        const t = typeof createdRaw === "number" ? createdRaw : Date.parse(String(createdRaw));
        if (Number.isFinite(t)) createdAt = t;
      }
      return {
        id: idRaw != null ? String(idRaw) : undefined,
        symbol,
        side,
        quantity,
        status,
        createdAt,
      };
    })
    .filter((o) => o.symbol && o.status);
}

function formatStatus(raw: string): string {
  const s = raw.trim().replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// A terminal status no longer needs polling. Partial fills are NOT terminal so
// they keep refreshing until fully filled (or canceled).
function isTerminalStatus(status: string): boolean {
  const s = status.toLowerCase();
  if (/partial/.test(s)) return false;
  return /(filled|complete|executed|reject|cancel|expired|done)/.test(s);
}

// Reconcile recorded orders against the latest broker order list, updating
// status where it changed. Each broker order is claimed by at most one recorded
// order. Returns the previous array unchanged when nothing moved (to avoid
// needless re-renders).
function reconcileOrders(prev: RecordedOrder[], brokerOrders: BrokerOrder[]): RecordedOrder[] {
  if (brokerOrders.length === 0) return prev;
  const claimed = new Set<number>();
  let changed = false;

  const next = prev.map((order) => {
    if (isTerminalStatus(order.status)) return order;

    let matchIdx = -1;

    // 1. Precise match by previously captured broker order id.
    if (order.brokerOrderId) {
      matchIdx = brokerOrders.findIndex((b, i) => !claimed.has(i) && b.id === order.brokerOrderId);
    }

    // 2. Fall back to symbol + side (+ quantity), preferring the nearest time.
    if (matchIdx === -1) {
      let best = -1;
      let bestDelta = Infinity;
      brokerOrders.forEach((b, i) => {
        if (claimed.has(i)) return;
        if (b.symbol !== order.symbol) return;
        if (b.side && b.side !== order.side) return;
        if (b.quantity != null && b.quantity !== order.quantity) return;
        const delta = b.createdAt != null ? Math.abs(b.createdAt - order.placedAt) : 0;
        if (delta < bestDelta) {
          bestDelta = delta;
          best = i;
        }
      });
      matchIdx = best;
    }

    if (matchIdx === -1) return order;
    claimed.add(matchIdx);

    const b = brokerOrders[matchIdx];
    const newStatus = formatStatus(b.status);
    const newBrokerId = b.id ?? order.brokerOrderId;
    if (newStatus === order.status && newBrokerId === order.brokerOrderId) {
      return order;
    }
    changed = true;
    return { ...order, status: newStatus, brokerOrderId: newBrokerId, updatedAt: Date.now() };
  });

  return changed ? next : prev;
}

export function AgentOrdersProvider({
  children,
  status,
}: {
  children: ReactNode;
  status?: AgentConnectionStatus;
}) {
  const { user } = useAuth();
  const userId = user?.id;

  const [orders, setOrders] = useState<RecordedOrder[]>(() => loadOrders(userId));
  const [isRefreshing, setIsRefreshing] = useState(false);

  // dedupeKeys we've already pushed to the notification feed, plus a one-time
  // seed guard so pre-existing terminal orders (loaded from localStorage on
  // mount) don't generate a backlog of notifications.
  const notifiedKeys = useRef<Set<string>>(new Set());
  const notifySeeded = useRef(false);

  // Reload the history whenever the active user changes so one user's orders
  // never leak into another user's session.
  const lastUserId = useRef<string | undefined>(userId);
  useEffect(() => {
    if (lastUserId.current !== userId) {
      lastUserId.current = userId;
      setOrders(loadOrders(userId));
      // Re-seed notification tracking for the new owner.
      notifiedKeys.current = new Set();
      notifySeeded.current = false;
    }
  }, [userId]);

  // Persist the current history, scoped to the active user's storage key.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storageKeyFor(userId), JSON.stringify(orders));
    } catch {
      // Ignore storage write failures (quota, privacy mode, etc.).
    }
  }, [orders, userId]);

  // Push a notification to the unified feed when an order reaches a terminal
  // status (filled / rejected / canceled / expired). Agent order status only
  // exists client-side, so the browser is the source of truth here. The server
  // dedupes on (userId, dedupeKey), and `notifySeeded` prevents notifying for
  // orders that were already terminal when the component first mounted.
  useEffect(() => {
    const terminal = orders.filter((o) => isTerminalStatus(o.status));
    const keyFor = (o: RecordedOrder) => `order:${o.id}:${o.status.toLowerCase()}`;

    if (!notifySeeded.current) {
      terminal.forEach((o) => notifiedKeys.current.add(keyFor(o)));
      notifySeeded.current = true;
      return;
    }

    const fresh = terminal.filter((o) => !notifiedKeys.current.has(keyFor(o)));
    if (fresh.length === 0) return;

    fresh.forEach((o) => {
      const key = keyFor(o);
      notifiedKeys.current.add(key);
      const sharesLabel = `${o.quantity} share${o.quantity === 1 ? "" : "s"}`;
      apiRequest("POST", "/api/notifications", {
        title: `Order ${o.status}`,
        message: `${o.side.toUpperCase()} ${sharesLabel} of ${o.symbol} — ${o.status}`,
        symbol: o.symbol,
        relatedId: o.id,
        dedupeKey: key,
      })
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
        })
        .catch(() => {
          // Allow a retry on a later status change by un-tracking the key.
          notifiedKeys.current.delete(key);
        });
    });
  }, [orders]);

  const recordOrder = useCallback((order: Omit<RecordedOrder, "id" | "placedAt" | "updatedAt">) => {
    setOrders((prev) => {
      const entry: RecordedOrder = {
        ...order,
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        placedAt: Date.now(),
      };
      return [entry, ...prev].slice(0, MAX_ORDERS);
    });
  }, []);

  const connected = status?.status === "connected";
  const ordersTool = useMemo(
    () => (status?.tools ? resolveOrdersTool(status.tools) : null),
    [status?.tools],
  );
  const hasPending = orders.some((o) => !isTerminalStatus(o.status));

  // Poll the broker's orders tool while connected and at least one order is
  // still open, reconciling live status onto the recorded list. When no orders
  // tool is exposed (or disconnected), we never poll and the placement-time
  // status remains as-is.
  useEffect(() => {
    if (!connected || !ordersTool || !hasPending) {
      setIsRefreshing(false);
      return;
    }
    let cancelled = false;
    setIsRefreshing(true);

    const poll = async () => {
      try {
        const res = await apiRequest("POST", "/api/agent/tools/call", {
          name: ordersTool,
          arguments: {},
        });
        const data = await res.json();
        const result = data.result ?? data;
        if (cancelled || result?.isError) return;
        const brokerOrders = normalizeBrokerOrders(result);
        if (cancelled || brokerOrders.length === 0) return;
        setOrders((prev) => reconcileOrders(prev, brokerOrders));
      } catch {
        /* ignore poll failures — keep the last known status */
      }
    };

    poll();
    const id = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [connected, ordersTool, hasPending]);

  const value = useMemo(
    () => ({ orders, recordOrder, isRefreshing }),
    [orders, recordOrder, isRefreshing],
  );

  return <AgentOrdersContext.Provider value={value}>{children}</AgentOrdersContext.Provider>;
}

export function useAgentOrders(): AgentOrdersContextValue {
  const ctx = useContext(AgentOrdersContext);
  if (!ctx) {
    throw new Error("useAgentOrders must be used within an AgentOrdersProvider");
  }
  return ctx;
}

const ORDER_TYPE_LABELS: Record<RecordedOrderType, string> = {
  market: "Market",
  limit: "Limit",
  stop: "Stop",
  stop_limit: "Stop Limit",
};

// Map a raw broker status string to a Badge variant for visual emphasis.
function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  const s = status.toLowerCase();
  if (/(fill|complete|executed|accept|confirm)/.test(s)) return "default";
  if (/(reject|cancel|fail|error|expired)/.test(s)) return "destructive";
  if (/(pending|queued|submit|new|open|partial)/.test(s)) return "secondary";
  return "outline";
}

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function AgentRecentOrders() {
  const { orders, isRefreshing } = useAgentOrders();

  return (
    <Card className="glass-panel">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4 text-primary" />
          Recent Orders
        </CardTitle>
        <div className="flex items-center gap-2">
          {isRefreshing && (
            <span
              className="flex items-center gap-1 text-xs text-muted-foreground"
              data-testid="status-orders-live"
            >
              <RefreshCw className="h-3 w-3 animate-spin" />
              Live
            </span>
          )}
          {orders.length > 0 && (
            <Badge variant="secondary" data-testid="badge-recent-orders-count">
              {orders.length}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {orders.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="text-no-recent-orders">
            Orders you place from the terminal will appear here with their status.
          </p>
        ) : (
          <ul className="space-y-2">
            {orders.map((order) => {
              const isBuy = order.side === "buy";
              const SideIcon = isBuy ? TrendingUp : TrendingDown;
              return (
                <li
                  key={order.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-[var(--glass-border)] bg-muted/20 px-3 py-2"
                  data-testid={`row-order-${order.id}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md ${
                        isBuy ? "bg-profit/15 text-profit" : "bg-loss/15 text-loss"
                      }`}
                    >
                      <SideIcon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs font-semibold uppercase ${isBuy ? "text-profit" : "text-loss"}`}
                          data-testid={`text-order-side-${order.id}`}
                        >
                          {order.side}
                        </span>
                        <span className="font-mono font-medium text-foreground" data-testid={`text-order-symbol-${order.id}`}>
                          {order.symbol}
                        </span>
                      </div>
                      <p className="truncate text-xs text-muted-foreground" data-testid={`text-order-meta-${order.id}`}>
                        <span data-testid={`text-order-qty-${order.id}`}>{order.quantity}</span> share
                        {order.quantity === 1 ? "" : "s"} · {ORDER_TYPE_LABELS[order.orderType]} · {fmtTime(order.placedAt)}
                        {order.updatedAt ? ` · updated ${fmtTime(order.updatedAt)}` : ""}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant={statusVariant(order.status)}
                    className="flex-shrink-0"
                    data-testid={`badge-order-status-${order.id}`}
                  >
                    {order.status}
                  </Badge>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
