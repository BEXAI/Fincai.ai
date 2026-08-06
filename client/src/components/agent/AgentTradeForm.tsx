import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  AlertDialog,
  AlertDialogContent,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { NOT_A_RECOMMENDATION_SHORT } from "@shared/disclosures";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ShoppingCart,
  TrendingUp,
  TrendingDown,
  Loader2,
  Check,
  X,
  Package,
  DollarSign,
  ArrowRight,
  Wallet,
  XCircle,
  CheckCircle,
  AlertTriangle,
  Layers,
  CalendarClock,
  Clock,
  RefreshCw,
  GitMerge,
  Plus,
  Trash2,
  Scale,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useAgentOrders } from "@/components/agent/agent-orders";

interface AgentTool {
  name: string;
  description?: string;
}

interface AgentStatus {
  status: "disconnected" | "authorizing" | "connected" | "error";
  tools: AgentTool[];
}

interface AgentHolding {
  symbol: string;
  quantity: number;
  price: number;
}

interface AgentPortfolio {
  buyingPower: number;
  holdings: AgentHolding[];
}

interface ChainContract {
  symbol: string;
  strike: number;
  expiration: string;
  type: "call" | "put";
  bid: number;
  ask: number;
  last: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  inTheMoney: boolean;
}

interface OptionsChainResponse {
  chain: ChainContract[];
  expirationDates: string[];
  underlyingPrice: number;
}

type Side = "buy" | "sell";
type OrderType = "market" | "limit" | "stop" | "stop_limit";
type TimeInForce = "day" | "gtc" | "ioc" | "fok";
type AssetType = "equity" | "option" | "spread";
type ContractType = "call" | "put";
type LegAction = "buy" | "sell";
type SpreadDirection = "debit" | "credit";

interface OptionLeg {
  expiration: string; // YYYY-MM-DD
  strike: number;
  contractType: ContractType;
  occSymbol: string;
}

// One leg of a multi-leg options strategy (vertical, straddle, etc.). Premium is
// the optional estimated per-contract mark used only for the net debit/credit and
// strategy-analysis previews — it is not sent as part of the order.
interface SpreadLeg {
  action: LegAction;
  contractType: ContractType;
  expiration: string; // YYYY-MM-DD
  strike: number;
  premium?: number;
  occSymbol: string;
}

interface DraftOrder {
  assetType: AssetType;
  symbol: string; // underlying symbol
  side: Side;
  quantity: number;
  orderType: OrderType;
  limitPrice?: number;
  stopPrice?: number;
  timeInForce: TimeInForce;
  option?: OptionLeg;
  legs?: SpreadLeg[]; // multi-leg spread
  direction?: SpreadDirection; // net debit/credit direction for spreads
}

// Result of POST /api/agent/strategy/analyze for the spread preview.
interface StrategyAnalysis {
  currentPrice: number;
  maxProfit: number;
  maxLoss: number;
  breakeven: number[];
  probabilityOfProfit: number;
}

// Contracts carry a 100-share multiplier when estimating notional value.
const OPTION_CONTRACT_MULTIPLIER = 100;

// Build an OCC-compliant option symbol (e.g. AAPL250620C00150000) client-side so
// the contract can be previewed and sent to the MCP order tool without a round
// trip. Format: ROOT + YYMMDD + C/P + 8-digit strike (3 implied decimals).
function buildOccSymbol(underlying: string, expiration: string, contractType: ContractType, strike: number): string {
  const root = underlying.toUpperCase().slice(0, 6);
  const [y, m, d] = expiration.split("-");
  const expiry = `${y.slice(-2)}${m.padStart(2, "0")}${d.padStart(2, "0")}`;
  const type = contractType === "call" ? "C" : "P";
  const strikeInt = String(Math.round(strike * 1000)).padStart(8, "0");
  return `${root}${expiry}${type}${strikeInt}`;
}

// Human-readable contract label, e.g. "AAPL Jun 20 '25 $150 Call".
function formatOptionDescription(underlying: string, expiration: string, contractType: ContractType, strike: number): string {
  const date = new Date(`${expiration}T00:00:00`);
  const expiry = Number.isNaN(date.getTime())
    ? expiration
    : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
  const strikeLabel = Number.isInteger(strike) ? `$${strike}` : `$${strike.toFixed(2)}`;
  return `${underlying.toUpperCase()} ${expiry} ${strikeLabel} ${contractType === "call" ? "Call" : "Put"}`;
}

// Strike label for the chain dropdown, e.g. "$150" (integers) or "$152.50".
function formatStrikeLabel(strike: number): string {
  return Number.isInteger(strike) ? `$${strike}` : `$${strike.toFixed(2)}`;
}

// Friendly expiration label for the chain dropdown, e.g. "Jun 20 '25 (15d)".
function formatExpirationLabel(expiration: string): string {
  const date = new Date(`${expiration}T00:00:00`);
  if (Number.isNaN(date.getTime())) return expiration;
  const label = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
  const days = Math.round((date.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  return days >= 0 ? `${label} (${days}d)` : label;
}

// Mid price (or last) used to preview a contract's cost in the dropdown.
function contractMidPrice(c: ChainContract): number | null {
  if (c.bid > 0 && c.ask > 0) return (c.bid + c.ask) / 2;
  if (c.last > 0) return c.last;
  if (c.ask > 0) return c.ask;
  if (c.bid > 0) return c.bid;
  return null;
}

// Resolve the connected MCP tool that places an order. Robinhood exposes
// `place_order`, but we match defensively in case the tool is named slightly
// differently on the server.
function resolvePlaceOrderTool(tools: AgentTool[]): string | null {
  const exact = tools.find((t) => t.name === "place_order");
  if (exact) return exact.name;
  const fuzzy = tools.find((t) => /(place|submit|create).*order|order.*(place|submit|create)/i.test(t.name));
  return fuzzy?.name ?? null;
}

// Resolve the connected MCP tool that returns a live quote for a symbol.
// Robinhood exposes `get_quote`; match defensively in case the name differs.
function resolveQuoteTool(tools: AgentTool[]): string | null {
  const exact = tools.find((t) => t.name === "get_quote");
  if (exact) return exact.name;
  const fuzzy = tools.find((t) => /(get|fetch).*(quote|price)|^quote$/i.test(t.name));
  return fuzzy?.name ?? null;
}

// Build the place_order tool arguments using the schema the app standardizes on
// (symbol, side, quantity, order_type, optional limit/stop price, time_in_force).
// For options we send the OCC contract symbol plus the structured contract fields
// (underlying, expiration, strike, type) so the MCP order tool can resolve the
// instrument regardless of which argument names it expects.
function buildPlaceOrderArgs(order: DraftOrder): Record<string, unknown> {
  if (order.assetType === "spread" && order.legs && order.legs.length >= 2) {
    return buildSpreadOrderArgs(order);
  }

  const args: Record<string, unknown> = {
    side: order.side,
    quantity: order.quantity,
    order_type: order.orderType,
    time_in_force: order.timeInForce,
  };

  if (order.assetType === "option" && order.option) {
    const leg = order.option;
    args.symbol = leg.occSymbol;
    args.asset_type = "option";
    args.instrument_type = "option";
    args.underlying_symbol = order.symbol;
    args.expiration_date = leg.expiration;
    args.strike_price = leg.strike;
    args.option_type = leg.contractType;
    args.contract_type = leg.contractType;
  } else {
    args.symbol = order.symbol;
    args.asset_type = "equity";
  }

  if ((order.orderType === "limit" || order.orderType === "stop_limit") && order.limitPrice != null) {
    args.limit_price = order.limitPrice;
  }
  if ((order.orderType === "stop" || order.orderType === "stop_limit") && order.stopPrice != null) {
    args.stop_price = order.stopPrice;
  }
  return args;
}

// Build place_order arguments for a multi-leg options strategy. The live MCP
// inputSchema isn't surfaced to the frontend, so we send the canonical multi-leg
// shape (a `legs` array of buy/sell option legs with ratio quantities) plus
// redundant top-level descriptors (underlying, direction, net price) to maximize
// compatibility with whatever the broker's order tool expects.
function buildSpreadOrderArgs(order: DraftOrder): Record<string, unknown> {
  const legs = order.legs ?? [];
  const args: Record<string, unknown> = {
    asset_type: "option",
    instrument_type: "option",
    order_class: "multileg",
    type: "multi_leg",
    underlying_symbol: order.symbol,
    quantity: order.quantity,
    order_type: order.orderType,
    time_in_force: order.timeInForce,
    direction: order.direction,
    legs: legs.map((leg) => ({
      symbol: leg.occSymbol,
      side: leg.action,
      action: leg.action,
      option_type: leg.contractType,
      contract_type: leg.contractType,
      strike_price: leg.strike,
      expiration_date: leg.expiration,
      underlying_symbol: order.symbol,
      ratio_quantity: 1,
      quantity: order.quantity,
    })),
  };
  if (order.orderType === "limit" && order.limitPrice != null) {
    args.limit_price = order.limitPrice;
    args.price = order.limitPrice;
  }
  return args;
}

// Net premium per spread (per single contract of each leg): bought legs cost
// premium (negative), sold legs collect premium (positive). Returns null when any
// leg is missing an estimated premium. A negative result is a net debit (you pay),
// positive is a net credit (you receive).
function computeNetPerSpread(legs: { action: LegAction; premium?: number }[]): number | null {
  if (legs.length === 0) return null;
  if (legs.some((l) => l.premium == null || !Number.isFinite(l.premium))) return null;
  return legs.reduce(
    (sum, l) => sum + (l.action === "buy" ? -(l.premium as number) : (l.premium as number)),
    0,
  );
}

interface LegTemplate {
  action: LegAction;
  contractType: ContractType;
}

interface SpreadPreset {
  key: string;
  label: string;
  legs: LegTemplate[];
}

// Common multi-leg templates. Applying a preset sets each leg's action/type;
// strikes and expirations are filled in by the user.
const SPREAD_PRESETS: SpreadPreset[] = [
  {
    key: "vertical",
    label: "Vertical",
    legs: [
      { action: "buy", contractType: "call" },
      { action: "sell", contractType: "call" },
    ],
  },
  {
    key: "straddle",
    label: "Straddle",
    legs: [
      { action: "buy", contractType: "call" },
      { action: "buy", contractType: "put" },
    ],
  },
  {
    key: "strangle",
    label: "Strangle",
    legs: [
      { action: "buy", contractType: "call" },
      { action: "buy", contractType: "put" },
    ],
  },
  {
    key: "iron-condor",
    label: "Iron Condor",
    legs: [
      { action: "sell", contractType: "put" },
      { action: "buy", contractType: "put" },
      { action: "sell", contractType: "call" },
      { action: "buy", contractType: "call" },
    ],
  },
];

function fmtCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(value);
}

const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  market: "Market",
  limit: "Limit",
  stop: "Stop",
  stop_limit: "Stop Limit",
};

// Single-leg options orders are limited to market and limit order types.
const OPTION_ORDER_TYPES: OrderType[] = ["market", "limit"];
const EQUITY_ORDER_TYPES: OrderType[] = ["market", "limit", "stop", "stop_limit"];

const TIF_LABELS: Record<TimeInForce, string> = {
  day: "Day",
  gtc: "Good 'til Canceled",
  ioc: "Immediate or Cancel",
  fok: "Fill or Kill",
};

// Editable form state for one spread leg (string inputs, validated on review).
interface LegDraftInput {
  id: string;
  action: LegAction;
  contractType: ContractType;
  expiration: string;
  strike: string;
  premium: string;
}

function newLegId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function makeLeg(template: LegTemplate, expiration = ""): LegDraftInput {
  return {
    id: newLegId(),
    action: template.action,
    contractType: template.contractType,
    expiration,
    strike: "",
    premium: "",
  };
}

// Default spread: a long call vertical scaffold the user fills in.
function defaultSpreadLegs(): LegDraftInput[] {
  return SPREAD_PRESETS[0].legs.map((t) => makeLeg(t));
}

export function AgentTradeForm({ status }: { status: AgentStatus }) {
  const connected = status.status === "connected";
  const placeOrderTool = useMemo(() => resolvePlaceOrderTool(status.tools), [status.tools]);
  const quoteTool = useMemo(() => resolveQuoteTool(status.tools), [status.tools]);

  const [assetType, setAssetType] = useState<AssetType>("equity");
  const [symbol, setSymbol] = useState("");
  const [side, setSide] = useState<Side>("buy");
  const [quantity, setQuantity] = useState("");
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [limitPrice, setLimitPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");
  const [timeInForce, setTimeInForce] = useState<TimeInForce>("day");
  // Options contract inputs
  const [expiration, setExpiration] = useState("");
  const [strike, setStrike] = useState("");
  const [contractType, setContractType] = useState<ContractType>("call");
  // Multi-leg spread inputs
  const [spreadLegs, setSpreadLegs] = useState<LegDraftInput[]>(defaultSpreadLegs);
  const [spreadDirection, setSpreadDirection] = useState<SpreadDirection>("debit");
  const [formError, setFormError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftOrder | null>(null);

  const isOption = assetType === "option";
  const isSpread = assetType === "spread";
  const needsLimit = orderType === "limit" || orderType === "stop_limit";
  const needsStop = orderType === "stop" || orderType === "stop_limit";
  const availableOrderTypes = isOption || isSpread ? OPTION_ORDER_TYPES : EQUITY_ORDER_TYPES;

  // Live net debit/credit estimate from the leg premiums entered so far.
  const netPerSpread = useMemo(
    () =>
      computeNetPerSpread(
        spreadLegs.map((l) => ({
          action: l.action,
          premium: l.premium.trim() === "" ? undefined : Number(l.premium),
        })),
      ),
    [spreadLegs],
  );

  // Symbol whose options chain we've loaded, debounced from the underlying input
  // so we don't fire a request on every keystroke.
  const [chainSymbol, setChainSymbol] = useState("");

  useEffect(() => {
    if (!isOption) return;
    const sym = symbol.trim().toUpperCase();
    const handle = setTimeout(() => setChainSymbol(sym), 400);
    return () => clearTimeout(handle);
  }, [symbol, isOption]);

  // Clear contract selections whenever the loaded underlying changes so stale
  // strikes/expirations from a previous symbol don't linger.
  useEffect(() => {
    setExpiration("");
    setStrike("");
  }, [chainSymbol]);

  // Live options chain for the selected underlying + expiration. The endpoint
  // returns the contracts for one expiration plus the full list of available
  // expirations; passing no expiration yields the nearest one.
  const {
    data: chainData,
    isLoading: chainLoading,
    isError: chainError,
  } = useQuery<OptionsChainResponse>({
    queryKey: ["/api/options/chain", chainSymbol, expiration],
    enabled: isOption && chainSymbol.length > 0,
    staleTime: 60_000,
    retry: false,
    queryFn: async () => {
      const url = `/api/options/chain/${encodeURIComponent(chainSymbol)}${
        expiration ? `?expiration=${encodeURIComponent(expiration)}` : ""
      }`;
      const res = await apiRequest("GET", url);
      return res.json();
    },
  });

  const chainExpirations = chainData?.expirationDates ?? [];
  const hasChain = isOption && !chainError && chainExpirations.length > 0;

  // Default the expiration to the nearest available one once the chain loads.
  useEffect(() => {
    if (isOption && !expiration && chainExpirations.length > 0) {
      setExpiration(chainExpirations[0]);
    }
  }, [isOption, expiration, chainExpirations]);

  // One contract per strike for the chosen call/put type and selected
  // expiration, sorted ascending for the strike dropdown.
  const chainStrikes = useMemo(() => {
    if (!chainData?.chain) return [] as ChainContract[];
    const byStrike = new Map<number, ChainContract>();
    for (const c of chainData.chain) {
      if (c.type !== contractType) continue;
      if (expiration && c.expiration !== expiration) continue;
      if (!byStrike.has(c.strike)) byStrike.set(c.strike, c);
    }
    return Array.from(byStrike.values()).sort((a, b) => a.strike - b.strike);
  }, [chainData, contractType, expiration]);

  const switchAssetType = (next: AssetType) => {
    if (next === assetType) return;
    setAssetType(next);
    setFormError(null);
    // Options/spreads only support market/limit; reset to a valid order type.
    if ((next === "option" || next === "spread") && !OPTION_ORDER_TYPES.includes(orderType)) {
      setOrderType("market");
      setStopPrice("");
    }
  };

  const updateLeg = (id: string, patch: Partial<LegDraftInput>) => {
    setSpreadLegs((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const addLeg = () => {
    setSpreadLegs((prev) => {
      if (prev.length >= 6) return prev;
      const shared = prev[0]?.expiration ?? "";
      return [...prev, makeLeg({ action: "buy", contractType: "call" }, shared)];
    });
  };

  const removeLeg = (id: string) => {
    setSpreadLegs((prev) => (prev.length <= 2 ? prev : prev.filter((l) => l.id !== id)));
  };

  const applyPreset = (preset: SpreadPreset) => {
    setFormError(null);
    const shared = spreadLegs[0]?.expiration ?? "";
    setSpreadLegs(preset.legs.map((t) => makeLeg(t, shared)));
  };

  const handleReview = () => {
    setFormError(null);
    const sym = symbol.trim().toUpperCase();
    const qty = Number(quantity);
    if (!sym) return setFormError("Enter a symbol.");
    if (!Number.isFinite(qty) || qty <= 0) return setFormError("Enter a quantity greater than zero.");

    if (isSpread) {
      if (!Number.isInteger(qty)) return setFormError("Contract quantity must be a whole number.");
      if (spreadLegs.length < 2) return setFormError("A spread needs at least two legs.");
      if (needsLimit) {
        const lp = Number(limitPrice);
        if (!Number.isFinite(lp) || lp <= 0) return setFormError("Enter a valid net limit price.");
      }
      const legs: SpreadLeg[] = [];
      for (let i = 0; i < spreadLegs.length; i++) {
        const leg = spreadLegs[i];
        if (!/^\d{4}-\d{2}-\d{2}$/.test(leg.expiration)) {
          return setFormError(`Choose an expiration for leg ${i + 1}.`);
        }
        const strikeNum = Number(leg.strike);
        if (!Number.isFinite(strikeNum) || strikeNum <= 0) {
          return setFormError(`Enter a strike greater than zero for leg ${i + 1}.`);
        }
        let premium: number | undefined;
        if (leg.premium.trim() !== "") {
          const p = Number(leg.premium);
          if (!Number.isFinite(p) || p < 0) return setFormError(`Enter a valid est. price for leg ${i + 1}.`);
          premium = p;
        }
        legs.push({
          action: leg.action,
          contractType: leg.contractType,
          expiration: leg.expiration,
          strike: strikeNum,
          premium,
          occSymbol: buildOccSymbol(sym, leg.expiration, leg.contractType, strikeNum),
        });
      }

      setDraft({
        assetType,
        symbol: sym,
        side: spreadDirection === "debit" ? "buy" : "sell",
        quantity: qty,
        orderType,
        limitPrice: needsLimit ? Number(limitPrice) : undefined,
        timeInForce,
        legs,
        direction: spreadDirection,
      });
      return;
    }

    if (needsLimit) {
      const lp = Number(limitPrice);
      if (!Number.isFinite(lp) || lp <= 0) return setFormError("Enter a valid limit price.");
    }
    if (needsStop) {
      const sp = Number(stopPrice);
      if (!Number.isFinite(sp) || sp <= 0) return setFormError("Enter a valid stop price.");
    }

    let option: OptionLeg | undefined;
    if (isOption) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(expiration)) return setFormError("Choose an expiration date.");
      const strikeNum = Number(strike);
      if (!Number.isFinite(strikeNum) || strikeNum <= 0) return setFormError("Enter a strike price greater than zero.");
      if (!Number.isInteger(qty)) return setFormError("Contract quantity must be a whole number.");
      option = {
        expiration,
        strike: strikeNum,
        contractType,
        occSymbol: buildOccSymbol(sym, expiration, contractType, strikeNum),
      };
    }

    setDraft({
      assetType,
      symbol: sym,
      side,
      quantity: qty,
      orderType,
      limitPrice: needsLimit ? Number(limitPrice) : undefined,
      stopPrice: needsStop ? Number(stopPrice) : undefined,
      timeInForce,
      option,
    });
  };

  const resetForm = () => {
    setSymbol("");
    setQuantity("");
    setLimitPrice("");
    setStopPrice("");
    setOrderType("market");
    setTimeInForce("day");
    setSide("buy");
    setExpiration("");
    setStrike("");
    setContractType("call");
    setSpreadLegs(defaultSpreadLegs());
    setSpreadDirection("debit");
  };

  return (
    <Card className="glass-panel">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShoppingCart className="h-4 w-4 text-primary" />
          Place a Trade
        </CardTitle>
        {connected && placeOrderTool && (
          <Badge variant="secondary" data-testid="badge-place-order-tool">{placeOrderTool}</Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {!connected ? (
          <p className="text-sm text-muted-foreground">
            Connect the Robinhood Trading agent to place guided buy and sell orders. Orders you
            place here require explicit confirmation before they are sent.
          </p>
        ) : !placeOrderTool ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive" data-testid="text-no-order-tool">
            The connected agent does not expose an order-placement tool, so trades can't be placed here.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              <Button
                variant={assetType === "equity" ? "default" : "outline"}
                onClick={() => switchAssetType("equity")}
                className="gap-2"
                data-testid="button-asset-equity"
              >
                <Package className="h-4 w-4" />
                Stock
              </Button>
              <Button
                variant={assetType === "option" ? "default" : "outline"}
                onClick={() => switchAssetType("option")}
                className="gap-2"
                data-testid="button-asset-option"
              >
                <Layers className="h-4 w-4" />
                Option
              </Button>
              <Button
                variant={assetType === "spread" ? "default" : "outline"}
                onClick={() => switchAssetType("spread")}
                className="gap-2"
                data-testid="button-asset-spread"
              >
                <GitMerge className="h-4 w-4" />
                Spread
              </Button>
            </div>

            {!isSpread && (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant={side === "buy" ? "default" : "outline"}
                  onClick={() => setSide("buy")}
                  className="gap-2"
                  data-testid="button-side-buy"
                >
                  <TrendingUp className="h-4 w-4" />
                  Buy
                </Button>
                <Button
                  variant={side === "sell" ? "default" : "outline"}
                  onClick={() => setSide("sell")}
                  className="gap-2"
                  data-testid="button-side-sell"
                >
                  <TrendingDown className="h-4 w-4" />
                  Sell
                </Button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="trade-symbol" className="text-xs text-muted-foreground">
                  {isOption || isSpread ? "Underlying" : "Symbol"}
                </Label>
                <Input
                  id="trade-symbol"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                  placeholder="NVDA"
                  className="font-mono uppercase"
                  data-testid="input-trade-symbol"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="trade-quantity" className="text-xs text-muted-foreground">
                  {isSpread ? "Spreads" : isOption ? "Contracts" : "Quantity"}
                </Label>
                <Input
                  id="trade-quantity"
                  type="number"
                  min="0"
                  step={isOption || isSpread ? "1" : "any"}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder={isOption || isSpread ? "1" : "10"}
                  className="font-mono"
                  data-testid="input-trade-quantity"
                />
              </div>
            </div>

            {isSpread && (
              <SpreadLegEditor
                legs={spreadLegs}
                direction={spreadDirection}
                netPerSpread={netPerSpread}
                onApplyPreset={applyPreset}
                onUpdateLeg={updateLeg}
                onAddLeg={addLeg}
                onRemoveLeg={removeLeg}
                onDirectionChange={setSpreadDirection}
              />
            )}

            {isOption && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant={contractType === "call" ? "default" : "outline"}
                    onClick={() => setContractType("call")}
                    className="gap-2"
                    data-testid="button-contract-call"
                  >
                    <TrendingUp className="h-4 w-4" />
                    Call
                  </Button>
                  <Button
                    variant={contractType === "put" ? "default" : "outline"}
                    onClick={() => setContractType("put")}
                    className="gap-2"
                    data-testid="button-contract-put"
                  >
                    <TrendingDown className="h-4 w-4" />
                    Put
                  </Button>
                </div>

                {chainLoading && !hasChain && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground" data-testid="text-chain-loading">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Loading live options chain…
                  </div>
                )}

                {hasChain && chainData?.underlyingPrice ? (
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground" data-testid="text-chain-underlying">
                    <span className="flex items-center gap-1.5">
                      <CalendarClock className="h-3.5 w-3.5 text-primary" />
                      Live chain
                    </span>
                    <span className="font-mono">{chainSymbol} {fmtCurrency(chainData.underlyingPrice)}</span>
                  </div>
                ) : null}

                {hasChain ? (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Expiration</Label>
                      <Select
                        value={expiration}
                        onValueChange={(v) => {
                          setExpiration(v);
                          setStrike("");
                        }}
                      >
                        <SelectTrigger data-testid="select-expiration">
                          <SelectValue placeholder="Select expiration" />
                        </SelectTrigger>
                        <SelectContent>
                          {chainExpirations.map((exp) => (
                            <SelectItem key={exp} value={exp} data-testid={`option-expiration-${exp}`}>
                              {formatExpirationLabel(exp)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Strike</Label>
                      <Select
                        value={strike}
                        onValueChange={setStrike}
                        disabled={chainLoading || chainStrikes.length === 0}
                      >
                        <SelectTrigger data-testid="select-strike">
                          <SelectValue placeholder={chainLoading ? "Loading…" : chainStrikes.length === 0 ? "No strikes" : "Select strike"} />
                        </SelectTrigger>
                        <SelectContent>
                          {chainStrikes.map((c) => {
                            const mid = contractMidPrice(c);
                            return (
                              <SelectItem
                                key={c.strike}
                                value={String(c.strike)}
                                data-testid={`option-strike-${c.strike}`}
                              >
                                <span className="flex items-center gap-2">
                                  <span className="font-mono">{formatStrikeLabel(c.strike)}</span>
                                  {mid != null && (
                                    <span className="text-xs text-muted-foreground font-mono">{fmtCurrency(mid)}</span>
                                  )}
                                  {c.inTheMoney && (
                                    <Badge variant="secondary" className="text-[10px]">ITM</Badge>
                                  )}
                                </span>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {chainError && (
                      <p className="text-xs text-muted-foreground" data-testid="text-chain-unavailable">
                        Live chain unavailable for {chainSymbol || "this symbol"} — enter the contract manually.
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label htmlFor="trade-expiration" className="text-xs text-muted-foreground">Expiration</Label>
                        <Input
                          id="trade-expiration"
                          type="date"
                          value={expiration}
                          onChange={(e) => setExpiration(e.target.value)}
                          className="font-mono"
                          data-testid="input-expiration"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="trade-strike" className="text-xs text-muted-foreground">Strike Price</Label>
                        <Input
                          id="trade-strike"
                          type="number"
                          min="0"
                          step="any"
                          value={strike}
                          onChange={(e) => setStrike(e.target.value)}
                          placeholder="150"
                          className="font-mono"
                          data-testid="input-strike"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Order Type</Label>
                <Select value={orderType} onValueChange={(v) => setOrderType(v as OrderType)}>
                  <SelectTrigger data-testid="select-order-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableOrderTypes.map((ot) => (
                      <SelectItem key={ot} value={ot} data-testid={`option-order-type-${ot}`}>
                        {ORDER_TYPE_LABELS[ot]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Time in Force</Label>
                <Select value={timeInForce} onValueChange={(v) => setTimeInForce(v as TimeInForce)}>
                  <SelectTrigger data-testid="select-time-in-force">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TIF_LABELS) as TimeInForce[]).map((tif) => (
                      <SelectItem key={tif} value={tif} data-testid={`option-tif-${tif}`}>
                        {TIF_LABELS[tif]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {(needsLimit || needsStop) && (
              <div className="grid grid-cols-2 gap-3">
                {needsLimit && (
                  <div className="space-y-1.5">
                    <Label htmlFor="trade-limit" className="text-xs text-muted-foreground">
                      {isSpread ? "Net Limit Price" : "Limit Price"}
                    </Label>
                    <Input
                      id="trade-limit"
                      type="number"
                      min="0"
                      step="any"
                      value={limitPrice}
                      onChange={(e) => setLimitPrice(e.target.value)}
                      placeholder="0.00"
                      className="font-mono"
                      data-testid="input-limit-price"
                    />
                  </div>
                )}
                {needsStop && (
                  <div className="space-y-1.5">
                    <Label htmlFor="trade-stop" className="text-xs text-muted-foreground">Stop Price</Label>
                    <Input
                      id="trade-stop"
                      type="number"
                      min="0"
                      step="any"
                      value={stopPrice}
                      onChange={(e) => setStopPrice(e.target.value)}
                      placeholder="0.00"
                      className="font-mono"
                      data-testid="input-stop-price"
                    />
                  </div>
                )}
              </div>
            )}

            {formError && (
              <p className="text-sm text-destructive" data-testid="text-form-error">{formError}</p>
            )}

            <Button onClick={handleReview} className="w-full gap-2" data-testid="button-review-order">
              <ShoppingCart className="h-4 w-4" />
              {isSpread ? "Review Spread Order" : `Review ${side === "buy" ? "Buy" : "Sell"} Order`}
            </Button>
          </>
        )}
      </CardContent>

      <AgentTradeConfirmation
        order={draft}
        toolName={placeOrderTool}
        quoteToolName={quoteTool}
        onClose={() => setDraft(null)}
        onFilled={() => {
          setDraft(null);
          resetForm();
        }}
      />
    </Card>
  );
}

// Net debit/credit label + amount derived from the running per-spread estimate.
function netSummary(netPerSpread: number | null): { label: string; tone: string; amount: string } | null {
  if (netPerSpread == null) return null;
  if (Math.abs(netPerSpread) < 1e-9) {
    return { label: "Even", tone: "text-foreground", amount: fmtCurrency(0) };
  }
  if (netPerSpread < 0) {
    return { label: "Net Debit", tone: "text-loss", amount: fmtCurrency(Math.abs(netPerSpread) * OPTION_CONTRACT_MULTIPLIER) };
  }
  return { label: "Net Credit", tone: "text-profit", amount: fmtCurrency(netPerSpread * OPTION_CONTRACT_MULTIPLIER) };
}

function SpreadLegEditor({
  legs,
  direction,
  netPerSpread,
  onApplyPreset,
  onUpdateLeg,
  onAddLeg,
  onRemoveLeg,
  onDirectionChange,
}: {
  legs: LegDraftInput[];
  direction: SpreadDirection;
  netPerSpread: number | null;
  onApplyPreset: (preset: SpreadPreset) => void;
  onUpdateLeg: (id: string, patch: Partial<LegDraftInput>) => void;
  onAddLeg: () => void;
  onRemoveLeg: (id: string) => void;
  onDirectionChange: (direction: SpreadDirection) => void;
}) {
  const summary = netSummary(netPerSpread);

  return (
    <div className="space-y-3 rounded-md border border-[var(--glass-border)] bg-muted/20 p-3">
      <div className="flex flex-wrap items-center gap-2">
        {SPREAD_PRESETS.map((preset) => (
          <Button
            key={preset.key}
            variant="outline"
            size="sm"
            onClick={() => onApplyPreset(preset)}
            data-testid={`button-preset-${preset.key}`}
          >
            {preset.label}
          </Button>
        ))}
      </div>

      <div className="space-y-3">
        {legs.map((leg, index) => (
          <div
            key={leg.id}
            className="space-y-2 rounded-md border border-[var(--glass-border)] bg-background/40 p-2.5"
            data-testid={`leg-${index}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-muted-foreground">Leg {index + 1}</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onRemoveLeg(leg.id)}
                disabled={legs.length <= 2}
                data-testid={`button-remove-leg-${index}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid grid-cols-2 gap-1">
                <Button
                  variant={leg.action === "buy" ? "default" : "outline"}
                  size="sm"
                  onClick={() => onUpdateLeg(leg.id, { action: "buy" })}
                  data-testid={`button-leg-buy-${index}`}
                >
                  Buy
                </Button>
                <Button
                  variant={leg.action === "sell" ? "default" : "outline"}
                  size="sm"
                  onClick={() => onUpdateLeg(leg.id, { action: "sell" })}
                  data-testid={`button-leg-sell-${index}`}
                >
                  Sell
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-1">
                <Button
                  variant={leg.contractType === "call" ? "default" : "outline"}
                  size="sm"
                  onClick={() => onUpdateLeg(leg.id, { contractType: "call" })}
                  data-testid={`button-leg-call-${index}`}
                >
                  Call
                </Button>
                <Button
                  variant={leg.contractType === "put" ? "default" : "outline"}
                  size="sm"
                  onClick={() => onUpdateLeg(leg.id, { contractType: "put" })}
                  data-testid={`button-leg-put-${index}`}
                >
                  Put
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Expiration</Label>
                <Input
                  type="date"
                  value={leg.expiration}
                  onChange={(e) => onUpdateLeg(leg.id, { expiration: e.target.value })}
                  className="font-mono text-base md:text-xs"
                  data-testid={`input-leg-expiration-${index}`}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Strike</Label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={leg.strike}
                  onChange={(e) => onUpdateLeg(leg.id, { strike: e.target.value })}
                  placeholder="150"
                  className="font-mono text-base md:text-xs"
                  data-testid={`input-leg-strike-${index}`}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground">Est. Price</Label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={leg.premium}
                  onChange={(e) => onUpdateLeg(leg.id, { premium: e.target.value })}
                  placeholder="2.50"
                  className="font-mono text-base md:text-xs"
                  data-testid={`input-leg-premium-${index}`}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <Button
        variant="outline"
        size="sm"
        onClick={onAddLeg}
        disabled={legs.length >= 6}
        className="w-full gap-2"
        data-testid="button-add-leg"
      >
        <Plus className="h-4 w-4" />
        Add Leg
      </Button>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Scale className="h-3.5 w-3.5" /> Order Direction
        </Label>
        <div className="grid grid-cols-2 gap-1">
          <Button
            variant={direction === "debit" ? "default" : "outline"}
            size="sm"
            onClick={() => onDirectionChange("debit")}
            data-testid="button-direction-debit"
          >
            Debit
          </Button>
          <Button
            variant={direction === "credit" ? "default" : "outline"}
            size="sm"
            onClick={() => onDirectionChange("credit")}
            data-testid="button-direction-credit"
          >
            Credit
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-[var(--glass-border)] pt-2">
        <span className="text-xs text-muted-foreground">Est. Net (per spread)</span>
        {summary ? (
          <span className={`font-mono text-sm font-medium ${summary.tone}`} data-testid="text-net-estimate">
            {summary.label} · {summary.amount}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground" data-testid="text-net-estimate">
            Add est. prices for net
          </span>
        )}
      </div>
    </div>
  );
}

type DialogPhase = "confirm" | "submitting" | "success" | "error";

function AgentTradeConfirmation({
  order,
  toolName,
  quoteToolName,
  onClose,
  onFilled,
}: {
  order: DraftOrder | null;
  toolName: string | null;
  quoteToolName: string | null;
  onClose: () => void;
  onFilled: () => void;
}) {
  const queryClient = useQueryClient();
  const { recordOrder } = useAgentOrders();
  const prefersReducedMotion = useReducedMotion();
  const [phase, setPhase] = useState<DialogPhase>("confirm");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resultText, setResultText] = useState<string | null>(null);
  // Live quote fetched best-effort when the dialog opens, so a fresh symbol with
  // a market order still shows a real dollar estimate (not just "At market").
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [quoteStatus, setQuoteStatus] = useState<"idle" | "loading" | "loaded" | "error">("idle");
  const [priceAge, setPriceAge] = useState(0);
  // Manual refresh state: while refreshing we keep the previously loaded price
  // visible (best-effort) and surface a transient error if the re-fetch fails.
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const [analysis, setAnalysis] = useState<StrategyAnalysis | null>(null);
  const [analysisState, setAnalysisState] = useState<"idle" | "loading" | "error">("idle");

  const isOpen = order !== null;
  const orderSymbol = order?.symbol;

  useEffect(() => {
    if (isOpen) {
      setPhase("confirm");
      setErrorMessage(null);
      setResultText(null);
      setLivePrice(null);
      setQuoteStatus("idle");
      setPriceAge(0);
      setIsRefreshing(false);
      setRefreshError(false);
    }
  }, [isOpen, order?.symbol, order?.side, order?.quantity]);

  // Fetch a live quote via the connected MCP get_quote tool. Best-effort: any
  // failure (no tool, broker error, unparseable result) silently falls back to
  // the held-position price / limit price, preserving the prior behavior. Shared
  // by the on-open effect and the manual "Refresh quote" control; the refresh
  // path keeps the prior price on screen instead of clearing it.
  const fetchQuote = useCallback(
    async (opts?: { isCancelled?: () => boolean; isRefresh?: boolean }) => {
      if (!quoteToolName || !orderSymbol) return;
      const isRefresh = opts?.isRefresh ?? false;
      if (isRefresh) {
        setIsRefreshing(true);
        setRefreshError(false);
      } else {
        setQuoteStatus("loading");
      }
      try {
        const res = await apiRequest("POST", "/api/agent/tools/call", {
          name: quoteToolName,
          arguments: { symbol: orderSymbol },
        });
        const data = await res.json();
        const price = extractQuotePrice(data.result ?? data);
        if (opts?.isCancelled?.()) return;
        if (price != null) {
          setLivePrice(price);
          setPriceAge(0);
          setQuoteStatus("loaded");
        } else if (isRefresh) {
          setRefreshError(true);
        } else {
          setQuoteStatus("error");
        }
      } catch {
        if (opts?.isCancelled?.()) return;
        if (isRefresh) {
          setRefreshError(true);
        } else {
          setQuoteStatus("error");
        }
      } finally {
        if (isRefresh && !opts?.isCancelled?.()) setIsRefreshing(false);
      }
    },
    [quoteToolName, orderSymbol],
  );

  useEffect(() => {
    if (!isOpen || !quoteToolName) return;
    let cancelled = false;
    fetchQuote({ isCancelled: () => cancelled });
    return () => {
      cancelled = true;
    };
  }, [isOpen, quoteToolName, fetchQuote]);

  const handleRefreshQuote = useCallback(() => {
    if (isRefreshing) return;
    fetchQuote({ isRefresh: true });
  }, [isRefreshing, fetchQuote]);

  // Tick the price-age counter once a live quote has loaded, mirroring the
  // staleness indicator in the chat TradeConfirmationDialog.
  useEffect(() => {
    if (!isOpen || quoteStatus !== "loaded") return;
    const interval = setInterval(() => setPriceAge((p) => p + 1), 1000);
    return () => clearInterval(interval);
  }, [isOpen, quoteStatus]);

  // For spreads, fetch a strategy analysis (max profit/loss, breakeven, POP) so
  // the confirmation preview can surface the risk/reward of all legs together.
  // Only legs with an estimated price contribute, so we require every leg priced.
  useEffect(() => {
    if (!isOpen || !order || order.assetType !== "spread" || !order.legs) {
      setAnalysis(null);
      setAnalysisState("idle");
      return;
    }
    const priced = order.legs.every((l) => l.premium != null);
    if (!priced) {
      setAnalysis(null);
      setAnalysisState("idle");
      return;
    }
    let cancelled = false;
    setAnalysisState("loading");
    setAnalysis(null);
    (async () => {
      try {
        const res = await apiRequest("POST", "/api/agent/strategy/analyze", {
          underlyingSymbol: order.symbol,
          legs: order.legs!.map((l) => ({
            optionType: l.contractType,
            action: l.action,
            strike: l.strike,
            quantity: order.quantity,
            premium: l.premium ?? 0,
            expirationDate: l.expiration,
          })),
        });
        const data = (await res.json()) as StrategyAnalysis;
        if (!cancelled) {
          setAnalysis(data);
          setAnalysisState("idle");
        }
      } catch {
        if (!cancelled) {
          setAnalysis(null);
          setAnalysisState("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, order?.assetType, order?.symbol, order?.quantity, order?.legs]);

  const portfolio = queryClient.getQueryData<AgentPortfolio>(["/api/agent/portfolio"]);

  const animationVariants = useMemo(
    () => ({
      initial: prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: 10, scale: 0.98 },
      animate: prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 },
      exit: prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.98 },
    }),
    [prefersReducedMotion],
  );

  if (!order) return null;

  const isBuy = order.side === "buy";
  const isOption = order.assetType === "option";
  const isSpread = order.assetType === "spread";
  const ActionIcon = isSpread ? GitMerge : isBuy ? TrendingUp : TrendingDown;
  const actionLabel = isSpread
    ? order.direction === "credit"
      ? "Credit Spread"
      : "Debit Spread"
    : isBuy
      ? "Buy"
      : "Sell";
  const unitLabel = isSpread
    ? `spread${order.quantity === 1 ? "" : "s"}`
    : isOption
      ? `contract${order.quantity === 1 ? "" : "s"}`
      : `share${order.quantity === 1 ? "" : "s"}`;
  const contractLabel = isOption && order.option
    ? formatOptionDescription(order.symbol, order.option.expiration, order.option.contractType, order.option.strike)
    : null;
  const displaySymbol = isOption && order.option ? order.option.occSymbol : order.symbol;

  // Net debit/credit estimate for spreads, derived from the per-leg premiums.
  const spreadNetPerSpread = isSpread && order.legs
    ? computeNetPerSpread(order.legs.map((l) => ({ action: l.action, premium: l.premium })))
    : null;
  const spreadSummary = netSummary(spreadNetPerSpread);
  const spreadEstValue = spreadNetPerSpread != null
    ? Math.abs(spreadNetPerSpread) * OPTION_CONTRACT_MULTIPLIER * order.quantity
    : null;

  // For options, holdings are keyed by the OCC contract symbol; for equities by
  // the ticker. Either way, fall back gracefully when there's no match.
  const holding = portfolio?.holdings?.find((h) => h.symbol === displaySymbol);
  const liveQuotePrice = quoteStatus === "loaded" ? livePrice : null;
  // Reference price for estimating order value: limit price if provided,
  // otherwise the live MCP quote, falling back to the latest known market price
  // from the live portfolio. Options notionals are multiplied by the 100-share
  // contract multiplier.
  const refPrice = order.limitPrice ?? liveQuotePrice ?? holding?.price;
  const valueMultiplier = isOption ? OPTION_CONTRACT_MULTIPLIER : 1;
  const estValue = refPrice != null ? refPrice * order.quantity * valueMultiplier : null;
  const buyingPower = portfolio?.buyingPower;
  const currentShares = holding?.quantity ?? 0;
  const newShares = isBuy ? currentShares + order.quantity : currentShares - order.quantity;

  // Warn (don't block) when a buy order's estimated value exceeds the user's
  // available buying power. Only meaningful when we have a real estimate from
  // the live quote / limit price and a known buying power figure.
  const exceedsBuyingPower =
    isBuy && estValue != null && buyingPower != null && estValue > buyingPower;
  const shortfall = exceedsBuyingPower ? estValue! - buyingPower! : 0;

  // Show the live-quote freshness meta only when the live price actually drives
  // the estimate (i.e. no explicit limit price was entered).
  const usingLiveQuote = order.limitPrice == null && liveQuotePrice != null;
  const isPriceStale = priceAge > 60;
  const getPriceAgeLabel = () => {
    if (priceAge < 5) return "Just now";
    if (priceAge < 30) return `${priceAge}s ago`;
    if (priceAge < 60) return "< 1 min ago";
    return `${Math.floor(priceAge / 60)}m ago`;
  };

  const handleConfirm = async () => {
    if (!toolName) {
      setPhase("error");
      setErrorMessage("No order-placement tool is available.");
      return;
    }
    setPhase("submitting");
    setErrorMessage(null);
    try {
      const res = await apiRequest("POST", "/api/agent/tools/call", {
        name: toolName,
        arguments: buildPlaceOrderArgs(order),
      });
      const data = await res.json();
      const result = data.result ?? data;
      if (result?.isError) {
        const text = extractResultText(result) || "The broker rejected the order.";
        setPhase("error");
        setErrorMessage(text);
        return;
      }
      setResultText(extractResultText(result));
      recordOrder({
        side: order.side,
        symbol: isSpread ? `${order.symbol} Spread (${order.legs?.length ?? 0} legs)` : order.symbol,
        quantity: order.quantity,
        orderType: order.orderType,
        status: extractOrderStatus(result),
        brokerOrderId: extractOrderId(result),
      });
      setPhase("success");
      queryClient.invalidateQueries({ queryKey: ["/api/agent/portfolio"] });
      queryClient.invalidateQueries({ queryKey: ["/api/agent/status"] });
    } catch (err: any) {
      setPhase("error");
      setErrorMessage(err?.message ?? "Failed to place the order.");
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open && phase !== "submitting") {
      if (phase === "success") onFilled();
      else onClose();
    }
  };

  return (
    <AlertDialog open={isOpen} onOpenChange={handleOpenChange}>
      <AlertDialogContent
        className="max-w-[440px] p-0 gap-0 bg-[var(--glass-chat)] backdrop-blur-xl border border-[var(--glass-border)] shadow-2xl overflow-hidden"
        data-testid="agent-trade-confirmation-dialog"
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={phase}
            initial={animationVariants.initial}
            animate={animationVariants.animate}
            exit={animationVariants.exit}
            transition={{ duration: prefersReducedMotion ? 0.1 : 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className={`px-6 py-4 ${isBuy ? "bg-profit/10" : "bg-loss/10"} border-b border-[var(--glass-border)]`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${isBuy ? "bg-profit/20" : "bg-loss/20"}`}>
                    <ActionIcon className={`w-5 h-5 ${isBuy ? "text-profit" : "text-loss"}`} />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">Confirm {actionLabel}</h2>
                    <p className="text-sm text-muted-foreground">Review before sending to your broker</p>
                  </div>
                </div>
                {phase !== "submitting" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleOpenChange(false)}
                    className="rounded-full h-8 w-8"
                    data-testid="button-close-agent-dialog"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>

            <div className="p-6 space-y-5">
              {(phase === "confirm" || phase === "submitting") && (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center">
                        {isSpread ? (
                          <GitMerge className="w-5 h-5 text-foreground" />
                        ) : isOption ? (
                          <Layers className="w-5 h-5 text-foreground" />
                        ) : (
                          <span className="font-mono font-bold text-foreground">{order.symbol.slice(0, 2)}</span>
                        )}
                      </div>
                      <div>
                        <p className="font-semibold text-foreground text-lg" data-testid="text-confirm-symbol">
                          {contractLabel ?? order.symbol}
                        </p>
                        <p className="text-xs text-muted-foreground">{ORDER_TYPE_LABELS[order.orderType]} · {TIF_LABELS[order.timeInForce]}</p>
                      </div>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-sm px-3 py-1 ${isBuy ? "bg-profit/10 text-profit border-profit/30" : "bg-loss/10 text-loss border-loss/30"}`}
                    >
                      <ActionIcon className="w-3.5 h-3.5 mr-1.5" />
                      {actionLabel}
                    </Badge>
                  </div>

                  <div className="space-y-3 bg-muted/30 rounded-xl p-4 border border-[var(--glass-border)]">
                    {isSpread && order.legs && (
                      <>
                        <div className="space-y-2">
                          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                            Legs
                          </span>
                          {order.legs.map((leg, index) => (
                            <div
                              key={index}
                              className="flex items-center justify-between gap-2 rounded-md bg-background/40 px-2.5 py-1.5"
                              data-testid={`confirm-leg-${index}`}
                            >
                              <div className="flex items-center gap-2">
                                <Badge
                                  variant="outline"
                                  className={`text-xs ${leg.action === "buy" ? "bg-profit/10 text-profit border-profit/30" : "bg-loss/10 text-loss border-loss/30"}`}
                                >
                                  {leg.action === "buy" ? "Buy" : "Sell"}
                                </Badge>
                                <span className="font-mono text-xs text-foreground">
                                  {formatOptionDescription(order.symbol, leg.expiration, leg.contractType, leg.strike)}
                                </span>
                              </div>
                              {leg.premium != null && (
                                <span className="font-mono text-xs text-muted-foreground">
                                  {fmtCurrency(leg.premium)}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                        <Separator className="bg-[var(--glass-border)]" />
                      </>
                    )}
                    {isOption && order.option && (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground flex items-center gap-2">
                            <CalendarClock className="w-4 h-4" /> Expiration
                          </span>
                          <span className="font-mono font-medium text-foreground" data-testid="text-confirm-expiration">
                            {order.option.expiration}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground flex items-center gap-2">
                            <DollarSign className="w-4 h-4" /> Strike
                          </span>
                          <span className="font-mono font-medium text-foreground" data-testid="text-confirm-strike">
                            {fmtCurrency(order.option.strike)} {order.option.contractType === "call" ? "Call" : "Put"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground flex items-center gap-2">
                            <Layers className="w-4 h-4" /> Contract
                          </span>
                          <span className="font-mono text-xs font-medium text-foreground" data-testid="text-confirm-occ">
                            {order.option.occSymbol}
                          </span>
                        </div>
                        <Separator className="bg-[var(--glass-border)]" />
                      </>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground flex items-center gap-2">
                        <Package className="w-4 h-4" /> {isSpread ? "Spreads" : isOption ? "Contracts" : "Quantity"}
                      </span>
                      <span className="font-mono font-medium text-foreground" data-testid="text-confirm-quantity">
                        {order.quantity} {unitLabel}
                      </span>
                    </div>
                    {order.limitPrice != null && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground flex items-center gap-2">
                          <DollarSign className="w-4 h-4" /> {isSpread ? "Net Limit Price" : "Limit Price"}
                        </span>
                        <span className="font-mono font-medium text-foreground">{fmtCurrency(order.limitPrice)}</span>
                      </div>
                    )}
                    {order.stopPrice != null && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground flex items-center gap-2">
                          <DollarSign className="w-4 h-4" /> Stop Price
                        </span>
                        <span className="font-mono font-medium text-foreground">{fmtCurrency(order.stopPrice)}</span>
                      </div>
                    )}
                    {usingLiveQuote && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground flex items-center gap-2">
                          <DollarSign className="w-4 h-4" /> Live Price
                        </span>
                        <span className="font-mono font-medium text-foreground" data-testid="text-confirm-live-price">
                          {fmtCurrency(liveQuotePrice!)}
                        </span>
                      </div>
                    )}
                    <Separator className="bg-[var(--glass-border)]" />
                    {isSpread ? (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Estimated Net</span>
                        {spreadSummary && spreadEstValue != null ? (
                          <span className={`font-mono font-medium ${spreadSummary.tone}`} data-testid="text-confirm-est-value">
                            {spreadSummary.label} · {fmtCurrency(spreadEstValue)}
                          </span>
                        ) : (
                          <span className="font-mono font-medium text-foreground" data-testid="text-confirm-est-value">
                            {order.orderType === "market" ? "At market" : "—"}
                          </span>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Estimated Value</span>
                        <span className="font-mono font-medium text-foreground" data-testid="text-confirm-est-value">
                          {estValue != null
                            ? fmtCurrency(estValue)
                            : quoteStatus === "loading"
                              ? "Fetching live price…"
                              : order.orderType === "market"
                                ? "At market"
                                : "—"}
                        </span>
                      </div>
                    )}
                    {usingLiveQuote && (
                      <div className="flex items-center justify-end gap-2 text-xs">
                        <div className="flex items-center gap-1.5" data-testid="text-quote-freshness">
                          <Clock className={`w-3 h-3 ${isPriceStale ? "text-yellow-500" : "text-muted-foreground"}`} />
                          <span className={isPriceStale ? "text-yellow-500" : "text-muted-foreground"}>
                            {isRefreshing ? "Refreshing…" : `Updated ${getPriceAgeLabel()}`}
                          </span>
                          {isPriceStale && !isRefreshing && <AlertTriangle className="w-3 h-3 text-yellow-500" />}
                        </div>
                        {quoteToolName && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleRefreshQuote}
                            disabled={isRefreshing}
                            className="h-6 gap-1 px-2 text-xs"
                            data-testid="button-refresh-quote"
                          >
                            <RefreshCw className={`w-3 h-3 ${isRefreshing ? "animate-spin" : ""}`} />
                            Refresh
                          </Button>
                        )}
                      </div>
                    )}
                    {usingLiveQuote && refreshError && !isRefreshing && (
                      <p className="text-right text-xs text-yellow-500" data-testid="text-refresh-error">
                        Couldn't refresh the quote. Showing the last price.
                      </p>
                    )}
                  </div>

                  {usingLiveQuote && isPriceStale && (
                    <div className="flex items-start gap-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3" data-testid="warning-quote-stale">
                      <AlertTriangle className="w-5 h-5 flex-shrink-0 text-yellow-500" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-yellow-500">Price may have changed</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          The live quote is over a minute old. The actual execution price may differ.
                        </p>
                      </div>
                      {quoteToolName && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleRefreshQuote}
                          disabled={isRefreshing}
                          className="flex-shrink-0 gap-1 border-yellow-500/30 text-xs text-yellow-500"
                          data-testid="button-refresh-quote-stale"
                        >
                          <RefreshCw className={`w-3 h-3 ${isRefreshing ? "animate-spin" : ""}`} />
                          Refresh quote
                        </Button>
                      )}
                    </div>
                  )}

                  {isSpread && (
                    <div className="space-y-3">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Strategy Analysis</p>
                      {analysisState === "loading" ? (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground" data-testid="text-analysis-loading">
                          <Loader2 className="w-4 h-4 animate-spin" /> Calculating risk &amp; reward…
                        </div>
                      ) : analysisState === "error" ? (
                        <p className="text-sm text-muted-foreground" data-testid="text-analysis-error">
                          Strategy analysis is unavailable right now.
                        </p>
                      ) : analysis ? (
                        <div className="grid grid-cols-2 gap-3" data-testid="strategy-analysis">
                          <div className="bg-muted/20 rounded-lg p-3 border border-[var(--glass-border)]">
                            <span className="text-xs text-muted-foreground">Max Profit</span>
                            <p className="font-mono text-sm font-medium text-profit" data-testid="text-max-profit">
                              {Number.isFinite(analysis.maxProfit) ? fmtCurrency(analysis.maxProfit) : "Unlimited"}
                            </p>
                          </div>
                          <div className="bg-muted/20 rounded-lg p-3 border border-[var(--glass-border)]">
                            <span className="text-xs text-muted-foreground">Max Loss</span>
                            <p className="font-mono text-sm font-medium text-loss" data-testid="text-max-loss">
                              {Number.isFinite(analysis.maxLoss) ? fmtCurrency(analysis.maxLoss) : "Unlimited"}
                            </p>
                          </div>
                          <div className="bg-muted/20 rounded-lg p-3 border border-[var(--glass-border)]">
                            <span className="text-xs text-muted-foreground">Breakeven</span>
                            <p className="font-mono text-sm font-medium text-foreground" data-testid="text-breakeven">
                              {analysis.breakeven.length
                                ? analysis.breakeven.map((b) => fmtCurrency(b)).join(", ")
                                : "—"}
                            </p>
                          </div>
                          <div className="bg-muted/20 rounded-lg p-3 border border-[var(--glass-border)]">
                            <span className="text-xs text-muted-foreground">Prob. of Profit</span>
                            <p className="font-mono text-sm font-medium text-foreground" data-testid="text-pop">
                              {analysis.probabilityOfProfit.toFixed(1)}%
                            </p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground" data-testid="text-analysis-hint">
                          Add an estimated price to every leg to preview max profit, loss, and breakeven.
                        </p>
                      )}
                    </div>
                  )}

                  {exceedsBuyingPower && (
                    <div className="flex items-start gap-3 rounded-lg border border-loss/30 bg-loss/10 p-3" data-testid="warning-insufficient-buying-power">
                      <AlertTriangle className="w-5 h-5 flex-shrink-0 text-loss" />
                      <div>
                        <p className="text-sm font-medium text-loss">Exceeds buying power</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          The estimated value of {fmtCurrency(estValue!)} is about {fmtCurrency(shortfall)} more
                          than your available buying power of {fmtCurrency(buyingPower!)}. This order may be
                          rejected by your broker.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Portfolio Impact</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className={`rounded-lg p-3 border ${exceedsBuyingPower ? "bg-loss/10 border-loss/30" : "bg-muted/20 border-[var(--glass-border)]"}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <Wallet className={`w-3.5 h-3.5 ${exceedsBuyingPower ? "text-loss" : "text-muted-foreground"}`} />
                          <span className="text-xs text-muted-foreground">Buying Power</span>
                        </div>
                        <span className={`font-mono text-sm font-medium ${exceedsBuyingPower ? "text-loss" : "text-foreground"}`} data-testid="text-confirm-buying-power">
                          {buyingPower != null ? fmtCurrency(buyingPower) : "—"}
                        </span>
                      </div>
                      <div className="bg-muted/20 rounded-lg p-3 border border-[var(--glass-border)]">
                        <div className="flex items-center gap-2 mb-1">
                          <Package className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground truncate">
                            {isSpread ? "Legs" : isOption ? "Contracts" : `${order.symbol} Shares`}
                          </span>
                        </div>
                        {isSpread ? (
                          <span className="font-mono text-sm font-medium text-foreground" data-testid="text-confirm-leg-count">
                            {order.legs?.length ?? 0} legs · {order.quantity}×
                          </span>
                        ) : (
                          <div className="flex items-center gap-1">
                            <span className="font-mono text-sm text-muted-foreground">{currentShares}</span>
                            <ArrowRight className="w-3 h-3 text-muted-foreground" />
                            <span className={`font-mono text-sm font-medium ${newShares < 0 ? "text-loss" : "text-foreground"}`}>
                              {newShares}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    This order will be sent to your connected Robinhood account for live execution.
                    Market data and prices may differ at the time of fill.
                  </p>

                  <p
                    className="text-xs font-medium text-muted-foreground"
                    data-testid="text-confirm-not-a-recommendation"
                  >
                    {NOT_A_RECOMMENDATION_SHORT}
                  </p>

                  <div className="flex gap-3 pt-1">
                    <Button
                      variant="outline"
                      onClick={() => handleOpenChange(false)}
                      disabled={phase === "submitting"}
                      className="flex-1 h-12"
                      data-testid="button-cancel-agent-trade"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleConfirm}
                      disabled={phase === "submitting"}
                      className={`flex-1 h-12 font-semibold ${isBuy ? "bg-profit hover:bg-profit/90 text-white" : "bg-loss hover:bg-loss/90 text-white"}`}
                      data-testid="button-confirm-agent-trade"
                    >
                      {phase === "submitting" ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Placing…
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4 mr-2" /> Confirm {actionLabel}
                        </>
                      )}
                    </Button>
                  </div>
                </>
              )}

              {phase === "success" && (
                <div className="space-y-4">
                  <div className="flex flex-col items-center justify-center py-4 space-y-3">
                    <div className="p-4 rounded-full bg-profit/20">
                      <CheckCircle className="w-10 h-10 text-profit" />
                    </div>
                    <h3 className="text-xl font-semibold text-profit">Order Submitted</h3>
                    <p className="text-sm text-muted-foreground text-center">
                      Your {actionLabel.toLowerCase()} order for {order.quantity} {unitLabel} of {contractLabel ?? order.symbol} was sent to Robinhood.
                    </p>
                  </div>
                  {resultText && (
                    <pre className="max-h-40 overflow-auto rounded-md bg-card/60 p-3 text-xs" data-testid="text-order-result">
                      {resultText}
                    </pre>
                  )}
                  <Button onClick={onFilled} className="w-full h-12 bg-profit hover:bg-profit/90 text-white" data-testid="button-done-agent-trade">
                    Done
                  </Button>
                </div>
              )}

              {phase === "error" && (
                <div className="space-y-4">
                  <div className="flex flex-col items-center justify-center py-4 space-y-3">
                    <div className="p-4 rounded-full bg-loss/20">
                      <XCircle className="w-10 h-10 text-loss" />
                    </div>
                    <h3 className="text-xl font-semibold text-loss">Order Failed</h3>
                  </div>
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-loss/10 border border-loss/30 text-sm">
                    <AlertTriangle className="w-4 h-4 text-loss flex-shrink-0 mt-0.5" />
                    <span className="text-foreground" data-testid="text-order-error">
                      {errorMessage || "An error occurred while placing your order."}
                    </span>
                  </div>
                  <div className="flex gap-3">
                    <Button variant="outline" onClick={onClose} className="flex-1 h-12" data-testid="button-close-error-agent-trade">
                      Close
                    </Button>
                    <Button onClick={() => setPhase("confirm")} className="flex-1 h-12" data-testid="button-retry-agent-trade">
                      Try Again
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Derive a short order status from an MCP place_order result. Robinhood's exact
// payload isn't guaranteed, so we probe common status field names in the
// structured content (or JSON parsed from text content) and fall back to
// "Submitted" when none is present.
function extractOrderStatus(result: any): string {
  const fallback = "Submitted";
  if (!result) return fallback;

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
  if (!payload && typeof result === "object") payload = result;
  if (!payload || typeof payload !== "object") return fallback;

  const candidate =
    payload.status ??
    payload.state ??
    payload.order_status ??
    payload.orderStatus ??
    payload.order?.status ??
    payload.order?.state;

  if (typeof candidate === "string" && candidate.trim()) {
    const s = candidate.trim().replace(/_/g, " ");
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  return fallback;
}

// Pull a numeric price out of an MCP get_quote CallToolResult. Robinhood's exact
// payload shape isn't known ahead of time, so we unwrap structuredContent or the
// JSON text content and probe common price field names. Returns null when no
// positive price can be found (caller treats this as a best-effort miss).
function extractQuotePrice(result: any): number | null {
  if (!result) return null;

  const toNum = (v: unknown): number | null => {
    const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  let payload: any = result?.structuredContent ?? result;
  if (Array.isArray(payload?.content)) {
    const text = payload.content
      .filter((c: any) => c?.type === "text" && typeof c.text === "string")
      .map((c: any) => c.text)
      .join("\n");
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        const m = text.match(/-?\d+(\.\d+)?/);
        if (m) return toNum(m[0]);
      }
    }
  }

  // Some payloads nest the quote under a single-element array or `quote`/`results`.
  const node =
    (Array.isArray(payload) ? payload[0] : undefined) ??
    payload?.quote ??
    (Array.isArray(payload?.results) ? payload.results[0] : undefined) ??
    payload;

  const candidates = [
    node?.price,
    node?.last_price,
    node?.lastPrice,
    node?.last_trade_price,
    node?.lastTradePrice,
    node?.mark_price,
    node?.markPrice,
    node?.current_price,
    node?.currentPrice,
    node?.ask_price,
    node?.askPrice,
    node?.bid_price,
    node?.bidPrice,
    node?.close,
  ];
  for (const c of candidates) {
    const n = toNum(c);
    if (n != null) return n;
  }
  return null;
}

// Pull the broker order id out of a place_order result (when present) so the
// recent-orders list can later reconcile live status precisely by id rather
// than guessing by symbol/side/time. Returns undefined when no id is found.
function extractOrderId(result: any): string | undefined {
  if (!result || typeof result !== "object") return undefined;

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
  if (!payload && typeof result === "object") payload = result;
  if (!payload || typeof payload !== "object") return undefined;

  const id =
    payload.id ??
    payload.order_id ??
    payload.orderId ??
    payload.order?.id ??
    payload.order?.order_id ??
    payload.client_order_id;

  return id != null && String(id).trim() ? String(id) : undefined;
}

// Pull a human-readable string out of an MCP CallToolResult (text content or
// structured JSON) for display in the result/error panels.
function extractResultText(result: any): string | null {
  if (!result) return null;
  if (typeof result === "string") return result;
  if (Array.isArray(result?.content)) {
    const text = result.content
      .filter((c: any) => c?.type === "text" && typeof c.text === "string")
      .map((c: any) => c.text)
      .join("\n")
      .trim();
    if (text) return text;
  }
  if (result?.structuredContent) {
    try {
      return JSON.stringify(result.structuredContent, null, 2);
    } catch {
      /* ignore */
    }
  }
  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return null;
  }
}
