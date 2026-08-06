import { robinhoodMcp } from "./robinhood-mcp";

export interface PortfolioHolding {
  symbol: string;
  name: string;
  quantity: number;
  avgCost: number;
  price: number;
  marketValue: number;
  costBasis: number;
  gain: number;
  gainPct: number;
}

export interface Portfolio {
  source: "robinhood" | "none";
  accountValue: number;
  buyingPower: number;
  totalValue: number;
  dayChange: number;
  dayChangePct: number;
  holdings: PortfolioHolding[];
}

// Defensively normalize an MCP get_holdings result into the Portfolio shape the
// frontend expects. Robinhood's exact payload is not known ahead of time, so we
// probe common field names and compute any missing derived values. Throws when
// no recognizable holdings can be extracted (caller falls back to demo data).
export function normalizeLivePortfolio(result: any): Portfolio {
  const num = (v: unknown): number => {
    const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
    return Number.isFinite(n) ? n : 0;
  };

  // Unwrap MCP CallToolResult: prefer structuredContent, else parse text content.
  let payload: any = result?.structuredContent ?? result;
  if (payload?.content && Array.isArray(payload.content)) {
    const text = payload.content.find((c: any) => c?.type === "text")?.text;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        /* keep payload as-is */
      }
    }
  }

  const rawHoldings: any[] = Array.isArray(payload)
    ? payload
    : payload?.holdings || payload?.positions || payload?.results || payload?.data || [];

  if (!Array.isArray(rawHoldings) || rawHoldings.length === 0) {
    throw new Error("No recognizable holdings in MCP response");
  }

  const holdings: PortfolioHolding[] = rawHoldings.map((h: any) => {
    const symbol = String(h.symbol ?? h.ticker ?? h.instrument ?? "?");
    const name = String(h.name ?? h.instrument_name ?? h.description ?? symbol);
    const quantity = num(h.quantity ?? h.qty ?? h.shares);
    const avgCost = num(h.avgCost ?? h.average_buy_price ?? h.average_cost ?? h.cost_basis_per_share);
    const price = num(h.price ?? h.last_price ?? h.market_price ?? h.current_price);
    const marketValue = h.marketValue != null || h.market_value != null
      ? num(h.marketValue ?? h.market_value)
      : Number((price * quantity).toFixed(2));
    const costBasis = h.costBasis != null
      ? num(h.costBasis)
      : Number((avgCost * quantity).toFixed(2));
    const gain = Number((marketValue - costBasis).toFixed(2));
    const gainPct = costBasis > 0 ? Number(((gain / costBasis) * 100).toFixed(2)) : 0;
    return { symbol, name, quantity, avgCost, price, marketValue, costBasis, gain, gainPct };
  });

  const totalValue = Number(holdings.reduce((a, h) => a + h.marketValue, 0).toFixed(2));
  const totalCost = holdings.reduce((a, h) => a + h.costBasis, 0);
  const buyingPower = num(payload?.buyingPower ?? payload?.buying_power ?? payload?.cash);
  const dayChange = Number((totalValue - totalCost).toFixed(2));
  const dayChangePct = totalCost > 0 ? Number(((dayChange / totalCost) * 100).toFixed(2)) : 0;

  return {
    source: "robinhood",
    accountValue: Number((totalValue + buyingPower).toFixed(2)),
    buyingPower,
    totalValue,
    dayChange,
    dayChangePct,
    holdings,
  };
}

// ---- Empty portfolio (when no agent is connected or live data is unavailable) ----
// Production behavior: we NEVER fabricate holdings. When there is no live
// Robinhood portfolio we return an empty, zeroed portfolio and the UI shows a
// "connect your account" state instead of simulated positions.
export function emptyPortfolio(): Portfolio {
  return {
    source: "none",
    accountValue: 0,
    buyingPower: 0,
    totalValue: 0,
    dayChange: 0,
    dayChangePct: 0,
    holdings: [],
  };
}

// Resolve the live Robinhood portfolio for the session when an agent is
// connected. Returns an empty portfolio (source "none") whenever no agent is
// connected or the live call fails — never simulated data. Restoration of a
// persisted connection is handled by the caller (via ensureRestored).
export async function getPortfolioForSession(sid: string): Promise<Portfolio> {
  if (robinhoodMcp.isConnected(sid)) {
    try {
      const result: any = await robinhoodMcp.callTool(sid, "get_holdings", {});
      return normalizeLivePortfolio(result);
    } catch {
      // Fall through to an empty portfolio if the live call fails
    }
  }
  return emptyPortfolio();
}
