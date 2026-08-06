import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { TrendingUp, TrendingDown, Wallet, Link2 } from "lucide-react";

interface Holding {
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

interface Portfolio {
  source: "none" | "robinhood";
  accountValue: number;
  buyingPower: number;
  totalValue: number;
  dayChange: number;
  dayChangePct: number;
  holdings: Holding[];
}

const DONUT_COLORS = [
  "hsl(46 65% 52%)",
  "hsl(51 100% 50%)",
  "hsl(44 63% 43%)",
  "hsl(43 75% 41%)",
  "hsl(38 55% 60%)",
  "hsl(48 40% 70%)",
];

function fmt(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function PortfolioView({ connected }: { connected: boolean }) {
  const { data, isLoading } = useQuery<Portfolio>({
    queryKey: ["/api/agent/portfolio"],
    refetchInterval: 5000,
  });

  if (isLoading || !data) {
    return (
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="text-base">Portfolio</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (data.source !== "robinhood" || data.holdings.length === 0) {
    return (
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="text-base">Portfolio</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center"
            data-testid="empty-portfolio"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Wallet className="h-6 w-6 text-primary" />
            </span>
            <div className="space-y-1">
              <p className="text-sm font-medium text-foreground">No connected account</p>
              <p className="text-xs text-muted-foreground">
                Connect your Robinhood agent to see your live portfolio, holdings, and buying power.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              data-testid="button-portfolio-connect"
              onClick={() => {
                const el = document.querySelector<HTMLElement>(
                  '[data-testid="button-connect-agent"]',
                );
                el?.scrollIntoView({ behavior: "smooth", block: "center" });
                el?.focus();
              }}
            >
              <Link2 className="h-4 w-4" />
              Connect your agent
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const positive = data.dayChange >= 0;
  const donutData = data.holdings.map((h) => ({ name: h.symbol, value: h.marketValue }));

  return (
    <div className="space-y-4">
      {/* Ticker tape */}
      <div className="overflow-hidden rounded-md border border-border bg-card/40">
        <div className="flex animate-[ticker_30s_linear_infinite] gap-8 whitespace-nowrap py-2 px-4">
          {[...data.holdings, ...data.holdings].map((h, i) => (
            <span key={i} className="inline-flex items-center gap-2 text-sm" data-testid={`ticker-${h.symbol}-${i}`}>
              <span className="font-semibold">{h.symbol}</span>
              <span className="text-muted-foreground">${fmt(h.price)}</span>
              <span className={h.gain >= 0 ? "text-profit" : "text-loss"}>
                {h.gain >= 0 ? "+" : ""}
                {h.gainPct}%
              </span>
            </span>
          ))}
        </div>
      </div>

      <Card className="glass-panel">
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <CardTitle className="text-base">Live Portfolio</CardTitle>
          <span
            className="text-xs text-muted-foreground"
            data-testid="text-portfolio-source"
          >
            {data.source === "robinhood" ? "Robinhood Agentic" : "Simulated"}
          </span>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="relative h-52">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={62}
                    outerRadius={90}
                    paddingAngle={2}
                    stroke="none"
                  >
                    {donutData.map((_, i) => (
                      <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xs text-muted-foreground">Total Value</span>
                <span className="text-xl font-semibold" data-testid="text-total-value">
                  ${fmt(data.totalValue)}
                </span>
                <span
                  className={`flex items-center gap-1 text-xs ${positive ? "text-profit" : "text-loss"}`}
                  data-testid="text-day-change"
                >
                  {positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                  {positive ? "+" : ""}
                  {fmt(data.dayChange)} ({data.dayChangePct}%)
                </span>
              </div>
            </div>

            <div className="flex flex-col justify-center gap-2">
              <div className="flex items-center justify-between gap-2 rounded-md bg-card/40 px-3 py-2">
                <span className="text-sm text-muted-foreground">Account Value</span>
                <span className="font-medium">${fmt(data.accountValue)}</span>
              </div>
              <div className="flex items-center justify-between gap-2 rounded-md bg-card/40 px-3 py-2">
                <span className="text-sm text-muted-foreground">Buying Power</span>
                <span className="font-medium">${fmt(data.buyingPower)}</span>
              </div>
              <div className="flex items-center justify-between gap-2 rounded-md bg-card/40 px-3 py-2">
                <span className="text-sm text-muted-foreground">Positions</span>
                <span className="font-medium">{data.holdings.length}</span>
              </div>
            </div>
          </div>

          <div className="mt-5 space-y-1">
            {data.holdings.map((h, i) => (
              <div
                key={h.symbol}
                className="flex items-center justify-between gap-3 rounded-md px-2 py-2 hover-elevate"
                data-testid={`holding-${h.symbol}`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }}
                  />
                  <div>
                    <div className="text-sm font-semibold">{h.symbol}</div>
                    <div className="text-xs text-muted-foreground">{h.quantity} sh · ${fmt(h.price)}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium">${fmt(h.marketValue)}</div>
                  <div className={`text-xs ${h.gain >= 0 ? "text-profit" : "text-loss"}`}>
                    {h.gain >= 0 ? "+" : ""}
                    {fmt(h.gain)} ({h.gainPct}%)
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
