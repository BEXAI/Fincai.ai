import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Target,
  AlertTriangle,
  Calculator,
  LineChart,
  Search,
  ChevronDown,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  SlidersHorizontal,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Seo } from "@/components/seo";

interface VIXData {
  vix: number;
  level: string;
  sentiment: string;
  optionsStrategy: string;
}

interface Quote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  timestamp: string;
  source: string;
}

interface MarketSummary {
  QQQ: Quote | null;
  WMT: Quote | null;
  SPY: Quote | null;
  VIX: Quote | null;
}

interface Mover {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
}

interface MarketMovers {
  gainers: Mover[];
  losers: Mover[];
  mostActive: Mover[];
  trending: Mover[];
}

interface HistoricalBar {
  time: string;
  price: number;
  open: number;
  high: number;
  low: number;
  volume: number;
}

const HISTORICAL_PERIODS = [
  { value: "1mo", label: "1 Month" },
  { value: "3mo", label: "3 Months" },
  { value: "6mo", label: "6 Months" },
  { value: "1y", label: "1 Year" },
] as const;

function formatPrice(value: number | undefined | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "—";
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPercent(value: number | undefined | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function changeColor(value: number | undefined | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "text-muted-foreground";
  if (value > 0) return "text-green-500";
  if (value < 0) return "text-red-500";
  return "text-muted-foreground";
}

export default function MarketAnalysis() {
  const { toast } = useToast();

  // VIX data fetch
  const { data: vixData, isLoading: vixLoading } = useQuery<VIXData>({
    queryKey: ["/api/market-analysis/vix"],
  });

  // Live market overview
  const {
    data: summary,
    isLoading: summaryLoading,
    isError: summaryError,
  } = useQuery<MarketSummary>({
    queryKey: ["/api/market/summary"],
  });

  const {
    data: movers,
    isLoading: moversLoading,
    isError: moversError,
  } = useQuery<MarketMovers>({
    queryKey: ["/api/market/movers"],
  });

  // Analyze-a-symbol flow
  const [symbolInput, setSymbolInput] = useState("");
  const [period, setPeriod] = useState<string>("1mo");
  const [analyzedSymbol, setAnalyzedSymbol] = useState<string | null>(null);
  const [analyzedBars, setAnalyzedBars] = useState<number | null>(null);
  const [analyzedRange, setAnalyzedRange] = useState<{ from: string; to: string } | null>(null);

  // Manual entry advanced panels
  const [manualOpen, setManualOpen] = useState({
    pivot: false,
    fibonacci: false,
    atr: false,
    bollinger: false,
  });

  // Pivot Points state
  const [pivotInputs, setPivotInputs] = useState({
    high: "",
    low: "",
    close: "",
  });

  // Fibonacci state
  const [fibInputs, setFibInputs] = useState({
    high: "",
    low: "",
  });

  // ATR state
  const [atrPrices, setAtrPrices] = useState("");

  // Bollinger Bands state
  const [bollingerPrices, setBollingerPrices] = useState("");

  // Mutations
  const pivotMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/market-analysis/pivot-points", data);
      return res.json();
    },
    onError: (error: Error) => {
      toast({
        title: "Pivot Calculation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const fibonacciMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/market-analysis/fibonacci", data);
      return res.json();
    },
    onError: (error: Error) => {
      toast({
        title: "Fibonacci Calculation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const atrMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/market-analysis/atr", data);
      return res.json();
    },
    onError: (error: Error) => {
      toast({
        title: "ATR Calculation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const bollingerMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("POST", "/api/market-analysis/bollinger-bands", data);
      return res.json();
    },
    onError: (error: Error) => {
      toast({
        title: "Bollinger Calculation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const analyzeMutation = useMutation({
    mutationFn: async ({ symbol, selectedPeriod }: { symbol: string; selectedPeriod: string }) => {
      const res = await apiRequest(
        "GET",
        `/api/market/historical/${encodeURIComponent(symbol)}?period=${selectedPeriod}`,
      );
      const bars = (await res.json()) as HistoricalBar[];
      if (!Array.isArray(bars) || bars.length === 0) {
        throw new Error("No historical data returned for this symbol");
      }
      return { symbol, bars };
    },
    onSuccess: ({ symbol, bars }) => {
      // Most recent completed daily bar → pivot points (high/low/close)
      const recentBar = bars[bars.length - 1];
      pivotMutation.mutate({
        high: recentBar.high,
        low: recentBar.low,
        close: recentBar.price,
      });

      // Period swing high/low → fibonacci retracement
      const swingHigh = Math.max(...bars.map((b) => b.high));
      const swingLow = Math.min(...bars.map((b) => b.low));
      fibonacciMutation.mutate({ high: swingHigh, low: swingLow });

      // Full OHLC array → ATR (period clamped to available data)
      const ohlc = bars.map((b) => ({ high: b.high, low: b.low, close: b.price }));
      const atrPeriod = Math.max(2, Math.min(14, ohlc.length - 1));
      atrMutation.mutate({ prices: ohlc, period: atrPeriod });

      // Close array → bollinger bands (period clamped to available data)
      const closes = bars.map((b) => b.price);
      const bbPeriod = Math.max(2, Math.min(20, closes.length));
      bollingerMutation.mutate({ prices: closes, period: bbPeriod });

      setAnalyzedSymbol(symbol);
      setAnalyzedBars(bars.length);
      setAnalyzedRange({
        from: new Date(bars[0].time).toLocaleDateString(),
        to: new Date(bars[bars.length - 1].time).toLocaleDateString(),
      });

      toast({
        title: `Analysis complete for ${symbol}`,
        description: `Ran all four calculators on ${bars.length} real daily bars.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Unable to Analyze Symbol",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleAnalyze = () => {
    const symbol = symbolInput.trim().toUpperCase();
    if (!symbol) {
      toast({
        title: "Symbol Required",
        description: "Enter a ticker symbol (e.g., AAPL, SPY, WMT) to analyze.",
        variant: "destructive",
      });
      return;
    }
    analyzeMutation.mutate({ symbol, selectedPeriod: period });
  };

  const handlePivotCalculate = () => {
    pivotMutation.mutate({
      high: parseFloat(pivotInputs.high),
      low: parseFloat(pivotInputs.low),
      close: parseFloat(pivotInputs.close),
    });
  };

  const handleFibonacciCalculate = () => {
    fibonacciMutation.mutate({
      high: parseFloat(fibInputs.high),
      low: parseFloat(fibInputs.low),
    });
  };

  const handleATRCalculate = () => {
    if (!atrPrices.trim()) {
      toast({
        title: "Input Required",
        description: 'Enter OHLC data as JSON array. Example: [{"high":505,"low":498,"close":502}]',
        variant: "destructive",
      });
      return;
    }

    try {
      const pricesArray = JSON.parse(atrPrices);

      if (!Array.isArray(pricesArray)) {
        throw new Error("Input must be a JSON array of OHLC objects");
      }

      if (pricesArray.length < 14) {
        throw new Error("At least 14 data points required for default ATR period");
      }

      const isValidFormat = pricesArray.every((item: any) =>
        typeof item === "object" &&
        item !== null &&
        typeof item.high === "number" &&
        typeof item.low === "number" &&
        typeof item.close === "number"
      );

      if (!isValidFormat) {
        throw new Error("Each item must have numeric 'high', 'low', and 'close' properties");
      }

      atrMutation.mutate({ prices: pricesArray });
    } catch (e) {
      const errorMessage = e instanceof SyntaxError
        ? "Invalid JSON syntax"
        : e instanceof Error ? e.message : "Invalid format";
      toast({
        title: "Invalid Input",
        description: errorMessage,
        variant: "destructive",
      });
    }
  };

  const handleBollingerCalculate = () => {
    if (!bollingerPrices.trim()) {
      toast({
        title: "Input Required",
        description: "Please enter close prices in JSON format.",
        variant: "destructive",
      });
      return;
    }

    try {
      const pricesArray = JSON.parse(bollingerPrices);

      if (!Array.isArray(pricesArray)) {
        throw new Error("Input must be a JSON array of numbers");
      }

      if (pricesArray.length < 20) {
        throw new Error("At least 20 data points required for Bollinger Bands (default period)");
      }

      const isValidFormat = pricesArray.every((item: any) => typeof item === "number");

      if (!isValidFormat) {
        throw new Error("All values must be numbers");
      }

      bollingerMutation.mutate({ prices: pricesArray });
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "Invalid JSON format";
      toast({
        title: "Invalid Input Format",
        description: `${errorMessage}. Example: [502, 506, 504, 508, 510, 512, 509, 515, 518, 516, 520, 522, 519, 523, 521, 525, 527, 524, 528, 530]`,
        variant: "destructive",
      });
    }
  };

  const getVIXColor = (level: string) => {
    switch (level) {
      case "low": return "text-green-500";
      case "moderate": return "text-yellow-500";
      case "elevated": return "text-orange-500";
      case "extreme": return "text-red-500";
      default: return "text-muted-foreground";
    }
  };

  const indexCards: { key: keyof MarketSummary; label: string }[] = [
    { key: "SPY", label: "S&P 500 (SPY)" },
    { key: "QQQ", label: "Nasdaq 100 (QQQ)" },
    { key: "WMT", label: "Walmart (WMT)" },
    { key: "VIX", label: "Volatility (VIX)" },
  ];

  const renderMoverList = (list: Mover[] | undefined, kind: string) => {
    if (!list || list.length === 0) {
      return (
        <div className="text-sm text-muted-foreground py-4 text-center" data-testid={`empty-movers-${kind}`}>
          No data available
        </div>
      );
    }
    return (
      <div className="space-y-2">
        {list.map((m) => (
          <div
            key={`${kind}-${m.symbol}`}
            className="flex items-center justify-between gap-2 p-2 rounded-md bg-muted/50 hover-elevate"
            data-testid={`row-mover-${kind}-${m.symbol}`}
          >
            <div className="flex flex-col">
              <span className="text-sm font-semibold" data-testid={`text-mover-symbol-${kind}-${m.symbol}`}>
                {m.symbol}
              </span>
              <span className="text-xs text-muted-foreground">
                Vol {m.volume ? (m.volume / 1_000_000).toFixed(1) + "M" : "—"}
              </span>
            </div>
            <div className="flex flex-col items-end">
              <span className="text-sm font-mono" data-testid={`text-mover-price-${kind}-${m.symbol}`}>
                ${formatPrice(m.price)}
              </span>
              <span
                className={`text-xs font-medium flex items-center gap-1 ${changeColor(m.changePercent)}`}
                data-testid={`text-mover-change-${kind}-${m.symbol}`}
              >
                {m.changePercent > 0 ? (
                  <ArrowUpRight className="h-3 w-3" />
                ) : m.changePercent < 0 ? (
                  <ArrowDownRight className="h-3 w-3" />
                ) : (
                  <Minus className="h-3 w-3" />
                )}
                {formatPercent(m.changePercent)}
              </span>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="container max-w-7xl p-6 space-y-6">
      <Seo path="/market-analysis" />
      <div>
        <h1 className="text-2xl font-bold" data-testid="heading-market-analysis">Market Analysis Tools</h1>
        <p className="text-sm text-muted-foreground">
          Live market overview and professional technical analysis powered by real market data
        </p>
      </div>

      {/* Live Market Overview */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          <h2 className="text-lg font-semibold" data-testid="heading-market-overview">Market Overview</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {summaryLoading ? (
            indexCards.map((c) => (
              <Card key={c.key} data-testid={`skeleton-index-${c.key}`}>
                <CardContent className="p-4 space-y-3">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-28" />
                  <Skeleton className="h-4 w-20" />
                </CardContent>
              </Card>
            ))
          ) : summaryError ? (
            <div className="col-span-full">
              <Alert variant="destructive" data-testid="error-summary">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>Unable to load market overview. Please try again shortly.</AlertDescription>
              </Alert>
            </div>
          ) : (
            indexCards.map((c) => {
              const quote = summary?.[c.key];
              return (
                <Card key={c.key} data-testid={`card-index-${c.key}`}>
                  <CardContent className="p-4 space-y-1">
                    <div className="text-xs text-muted-foreground">{c.label}</div>
                    {quote ? (
                      <>
                        <div className="text-2xl font-mono font-bold" data-testid={`text-index-price-${c.key}`}>
                          {formatPrice(quote.price)}
                        </div>
                        <div
                          className={`text-sm font-medium flex items-center gap-1 ${changeColor(quote.changePercent)}`}
                          data-testid={`text-index-change-${c.key}`}
                        >
                          {quote.changePercent > 0 ? (
                            <TrendingUp className="h-3.5 w-3.5" />
                          ) : quote.changePercent < 0 ? (
                            <TrendingDown className="h-3.5 w-3.5" />
                          ) : (
                            <Minus className="h-3.5 w-3.5" />
                          )}
                          {formatPercent(quote.changePercent)}
                        </div>
                      </>
                    ) : (
                      <div className="text-sm text-muted-foreground py-2" data-testid={`text-index-unavailable-${c.key}`}>
                        Unavailable
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        {/* Top Movers */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4" />
              Top Movers
            </CardTitle>
            <CardDescription>Most active gainers, losers, and high-volume names</CardDescription>
          </CardHeader>
          <CardContent>
            {moversLoading ? (
              <div className="space-y-2" data-testid="loading-movers">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : moversError ? (
              <Alert variant="destructive" data-testid="error-movers">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>Unable to load top movers right now.</AlertDescription>
              </Alert>
            ) : (
              <Tabs defaultValue="gainers" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="gainers" data-testid="tab-movers-gainers">
                    <TrendingUp className="h-4 w-4 mr-2" />
                    Gainers
                  </TabsTrigger>
                  <TabsTrigger value="losers" data-testid="tab-movers-losers">
                    <TrendingDown className="h-4 w-4 mr-2" />
                    Losers
                  </TabsTrigger>
                  <TabsTrigger value="active" data-testid="tab-movers-active">
                    <Activity className="h-4 w-4 mr-2" />
                    Most Active
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="gainers" className="mt-4">
                  {renderMoverList(movers?.gainers, "gainers")}
                </TabsContent>
                <TabsContent value="losers" className="mt-4">
                  {renderMoverList(movers?.losers, "losers")}
                </TabsContent>
                <TabsContent value="active" className="mt-4">
                  {renderMoverList(movers?.mostActive, "active")}
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>
      </div>

      {/* VIX Fear Index */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              VIX Fear Index
            </CardTitle>
            <CardDescription>Market volatility sentiment indicator</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {vixLoading ? (
            <div className="text-sm text-muted-foreground" data-testid="loading-vix">Loading VIX data...</div>
          ) : vixData ? (
            <div className="space-y-4">
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-mono font-bold" data-testid="text-vix-value">
                  {vixData.vix}
                </span>
                <span className={`text-sm font-medium ${getVIXColor(vixData.level)}`} data-testid="text-vix-level">
                  {vixData.level.toUpperCase()}
                </span>
              </div>
              <p className="text-sm text-muted-foreground" data-testid="text-vix-sentiment">
                {vixData.sentiment}
              </p>
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription data-testid="text-vix-strategy">
                  <strong>Options Strategy: </strong>{vixData.optionsStrategy}
                </AlertDescription>
              </Alert>
            </div>
          ) : (
            <div className="text-sm text-destructive" data-testid="error-vix">Failed to load VIX data</div>
          )}
        </CardContent>
      </Card>

      {/* Analyze a Symbol */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <Search className="h-4 w-4" />
            Analyze a Symbol
          </CardTitle>
          <CardDescription>
            Pull real OHLC history and auto-run all four technical calculators on live data
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3 flex-wrap">
            <div className="space-y-2 flex-1 min-w-[160px]">
              <Label htmlFor="analyze-symbol">Ticker Symbol</Label>
              <Input
                id="analyze-symbol"
                placeholder="e.g., AAPL, SPY, WMT"
                className="font-mono uppercase"
                value={symbolInput}
                onChange={(e) => setSymbolInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAnalyze();
                }}
                data-testid="input-analyze-symbol"
              />
            </div>
            <div className="space-y-2 min-w-[140px]">
              <Label htmlFor="analyze-period">Period</Label>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger id="analyze-period" data-testid="select-analyze-period">
                  <SelectValue placeholder="Select period" />
                </SelectTrigger>
                <SelectContent>
                  {HISTORICAL_PERIODS.map((p) => (
                    <SelectItem key={p.value} value={p.value} data-testid={`option-period-${p.value}`}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleAnalyze}
              disabled={analyzeMutation.isPending}
              data-testid="button-analyze-symbol"
            >
              {analyzeMutation.isPending ? "Analyzing..." : "Analyze"}
            </Button>
          </div>

          {analyzedSymbol && (
            <div className="flex items-center gap-2 flex-wrap" data-testid="status-analyzed">
              <Badge variant="default" data-testid="badge-analyzed-symbol">{analyzedSymbol}</Badge>
              {analyzedBars !== null && (
                <Badge variant="outline" data-testid="badge-analyzed-bars">{analyzedBars} daily bars</Badge>
              )}
              {analyzedRange && (
                <Badge variant="outline" data-testid="badge-analyzed-range">
                  {analyzedRange.from} – {analyzedRange.to}
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Analysis Tools Tabs */}
      <Tabs defaultValue="pivot" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="pivot" data-testid="tab-pivot">
            <Target className="h-4 w-4 mr-2" />
            Pivot Points
          </TabsTrigger>
          <TabsTrigger value="fibonacci" data-testid="tab-fibonacci">
            <LineChart className="h-4 w-4 mr-2" />
            Fibonacci
          </TabsTrigger>
          <TabsTrigger value="atr" data-testid="tab-atr">
            <TrendingUp className="h-4 w-4 mr-2" />
            ATR
          </TabsTrigger>
          <TabsTrigger value="bollinger" data-testid="tab-bollinger">
            <Calculator className="h-4 w-4 mr-2" />
            Bollinger Bands
          </TabsTrigger>
        </TabsList>

        {/* Pivot Points Tab */}
        <TabsContent value="pivot" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Pivot Point Calculator</CardTitle>
              <CardDescription>
                Support and resistance levels from the most recent session's high, low, and close
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {pivotMutation.isPending && (
                <div className="text-sm text-muted-foreground" data-testid="loading-pivot">Calculating pivot levels...</div>
              )}

              {pivotMutation.data && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium flex items-center gap-2 text-green-500">
                        <TrendingUp className="h-4 w-4" />
                        Resistance Levels
                      </h3>
                      <div className="space-y-2 text-sm font-mono">
                        <div className="flex justify-between gap-2 p-2 bg-muted rounded" data-testid="text-r3">
                          <span>R3:</span>
                          <span className="font-bold">${pivotMutation.data.resistance.r3}</span>
                        </div>
                        <div className="flex justify-between gap-2 p-2 bg-muted rounded" data-testid="text-r2">
                          <span>R2:</span>
                          <span className="font-bold">${pivotMutation.data.resistance.r2}</span>
                        </div>
                        <div className="flex justify-between gap-2 p-2 bg-muted rounded" data-testid="text-r1">
                          <span>R1:</span>
                          <span className="font-bold">${pivotMutation.data.resistance.r1}</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <h3 className="text-sm font-medium flex items-center gap-2 text-red-500">
                        <TrendingDown className="h-4 w-4" />
                        Support Levels
                      </h3>
                      <div className="space-y-2 text-sm font-mono">
                        <div className="flex justify-between gap-2 p-2 bg-muted rounded" data-testid="text-s1">
                          <span>S1:</span>
                          <span className="font-bold">${pivotMutation.data.support.s1}</span>
                        </div>
                        <div className="flex justify-between gap-2 p-2 bg-muted rounded" data-testid="text-s2">
                          <span>S2:</span>
                          <span className="font-bold">${pivotMutation.data.support.s2}</span>
                        </div>
                        <div className="flex justify-between gap-2 p-2 bg-muted rounded" data-testid="text-s3">
                          <span>S3:</span>
                          <span className="font-bold">${pivotMutation.data.support.s3}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-muted rounded">
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-sm font-medium">Pivot Point:</span>
                      <span className="text-lg font-mono font-bold" data-testid="text-pivot-point">
                        ${pivotMutation.data.pivotPoint}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {!pivotMutation.data && !pivotMutation.isPending && (
                <div className="text-sm text-muted-foreground" data-testid="empty-pivot">
                  Analyze a symbol above to auto-calculate, or use manual entry below.
                </div>
              )}

              <Collapsible
                open={manualOpen.pivot}
                onOpenChange={(open) => setManualOpen((s) => ({ ...s, pivot: open }))}
              >
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" data-testid="button-toggle-manual-pivot">
                    <SlidersHorizontal className="h-4 w-4 mr-2" />
                    Manual entry (advanced)
                    <ChevronDown className="h-4 w-4 ml-2" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-4 space-y-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="pivot-high">Previous High</Label>
                      <Input
                        id="pivot-high"
                        type="number"
                        step="0.01"
                        placeholder="e.g., 505.50"
                        className="font-mono"
                        value={pivotInputs.high}
                        onChange={(e) => setPivotInputs({ ...pivotInputs, high: e.target.value })}
                        data-testid="input-pivot-high"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pivot-low">Previous Low</Label>
                      <Input
                        id="pivot-low"
                        type="number"
                        step="0.01"
                        placeholder="e.g., 498.25"
                        className="font-mono"
                        value={pivotInputs.low}
                        onChange={(e) => setPivotInputs({ ...pivotInputs, low: e.target.value })}
                        data-testid="input-pivot-low"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="pivot-close">Previous Close</Label>
                      <Input
                        id="pivot-close"
                        type="number"
                        step="0.01"
                        placeholder="e.g., 502.00"
                        className="font-mono"
                        value={pivotInputs.close}
                        onChange={(e) => setPivotInputs({ ...pivotInputs, close: e.target.value })}
                        data-testid="input-pivot-close"
                      />
                    </div>
                  </div>
                  <Button
                    onClick={handlePivotCalculate}
                    disabled={pivotMutation.isPending}
                    data-testid="button-calculate-pivot"
                  >
                    {pivotMutation.isPending ? "Calculating..." : "Calculate Levels"}
                  </Button>
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Fibonacci Tab */}
        <TabsContent value="fibonacci" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Fibonacci Retracement Levels</CardTitle>
              <CardDescription>
                Key retracement levels from the period swing high to swing low
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {fibonacciMutation.isPending && (
                <div className="text-sm text-muted-foreground" data-testid="loading-fib">Calculating fibonacci levels...</div>
              )}

              {fibonacciMutation.data && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-4 text-sm font-mono">
                    {Object.entries(fibonacciMutation.data as Record<string, number>).map(([key, value]) => {
                      const percent = key.replace("level_", "");
                      const displayPercent = percent === "0" ? "100.0%" :
                                            percent === "100" ? "0.0%" :
                                            `${(parseFloat(percent) / 10).toFixed(1)}%`;
                      return (
                        <div
                          key={key}
                          className="flex justify-between gap-2 p-2 bg-muted rounded"
                          data-testid={`text-fib-${percent}`}
                        >
                          <span>{displayPercent}:</span>
                          <span className="font-bold">${value}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {!fibonacciMutation.data && !fibonacciMutation.isPending && (
                <div className="text-sm text-muted-foreground" data-testid="empty-fib">
                  Analyze a symbol above to auto-calculate, or use manual entry below.
                </div>
              )}

              <Collapsible
                open={manualOpen.fibonacci}
                onOpenChange={(open) => setManualOpen((s) => ({ ...s, fibonacci: open }))}
              >
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" data-testid="button-toggle-manual-fib">
                    <SlidersHorizontal className="h-4 w-4 mr-2" />
                    Manual entry (advanced)
                    <ChevronDown className="h-4 w-4 ml-2" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-4 space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="fib-high">Swing High</Label>
                      <Input
                        id="fib-high"
                        type="number"
                        step="0.01"
                        placeholder="e.g., 520.00"
                        className="font-mono"
                        value={fibInputs.high}
                        onChange={(e) => setFibInputs({ ...fibInputs, high: e.target.value })}
                        data-testid="input-fib-high"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="fib-low">Swing Low</Label>
                      <Input
                        id="fib-low"
                        type="number"
                        step="0.01"
                        placeholder="e.g., 480.00"
                        className="font-mono"
                        value={fibInputs.low}
                        onChange={(e) => setFibInputs({ ...fibInputs, low: e.target.value })}
                        data-testid="input-fib-low"
                      />
                    </div>
                  </div>
                  <Button
                    onClick={handleFibonacciCalculate}
                    disabled={fibonacciMutation.isPending}
                    data-testid="button-calculate-fib"
                  >
                    {fibonacciMutation.isPending ? "Calculating..." : "Calculate Fibonacci Levels"}
                  </Button>
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ATR Tab */}
        <TabsContent value="atr" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Average True Range (ATR)</CardTitle>
              <CardDescription>
                Measure volatility to set appropriate stop losses
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {atrMutation.isPending && (
                <div className="text-sm text-muted-foreground" data-testid="loading-atr">Calculating ATR...</div>
              )}

              {atrMutation.data && (
                <div className="space-y-4">
                  <div className="p-4 bg-muted rounded space-y-2">
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-sm font-medium">ATR Value:</span>
                      <span className="text-2xl font-mono font-bold" data-testid="text-atr-value">
                        {atrMutation.data.atr}
                      </span>
                    </div>
                    <div className="flex justify-between items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Period:</span>
                      <span className="font-mono" data-testid="text-atr-period">{atrMutation.data.period} days</span>
                    </div>
                  </div>
                  <Alert>
                    <Activity className="h-4 w-4" />
                    <AlertDescription data-testid="text-atr-interpretation">
                      <strong>Volatility: </strong>{atrMutation.data.interpretation}
                    </AlertDescription>
                  </Alert>
                </div>
              )}

              {!atrMutation.data && !atrMutation.isPending && (
                <div className="text-sm text-muted-foreground" data-testid="empty-atr">
                  Analyze a symbol above to auto-calculate, or use manual entry below.
                </div>
              )}

              <Collapsible
                open={manualOpen.atr}
                onOpenChange={(open) => setManualOpen((s) => ({ ...s, atr: open }))}
              >
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" data-testid="button-toggle-manual-atr">
                    <SlidersHorizontal className="h-4 w-4 mr-2" />
                    Manual entry (advanced)
                    <ChevronDown className="h-4 w-4 ml-2" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-4 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="atr-prices">Price Data (JSON format)</Label>
                    <textarea
                      id="atr-prices"
                      className="w-full min-h-32 p-2 rounded-md border bg-background font-mono text-base md:text-xs"
                      placeholder='[{"high":505,"low":498,"close":502},{"high":508,"low":501,"close":506},{"high":510,"low":503,"close":507},...14+ items]'
                      value={atrPrices}
                      onChange={(e) => setAtrPrices(e.target.value)}
                      data-testid="input-atr-prices"
                    />
                    <p className="text-xs text-muted-foreground">
                      Enter array of OHLC objects with high, low, close values (minimum 14 data points)
                    </p>
                  </div>
                  <Button
                    onClick={handleATRCalculate}
                    disabled={atrMutation.isPending}
                    data-testid="button-calculate-atr"
                  >
                    {atrMutation.isPending ? "Calculating..." : "Calculate ATR"}
                  </Button>
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Bollinger Bands Tab */}
        <TabsContent value="bollinger" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Bollinger Bands</CardTitle>
              <CardDescription>
                Identify overbought and oversold conditions
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {bollingerMutation.isPending && (
                <div className="text-sm text-muted-foreground" data-testid="loading-bollinger">Calculating bollinger bands...</div>
              )}

              {bollingerMutation.data && (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4 text-sm font-mono">
                    <div className="p-4 bg-green-500/10 rounded space-y-2">
                      <div className="text-xs text-muted-foreground">Upper Band</div>
                      <div className="text-xl font-bold text-green-500" data-testid="text-upper-band">
                        ${bollingerMutation.data.upperBand}
                      </div>
                    </div>
                    <div className="p-4 bg-muted rounded space-y-2">
                      <div className="text-xs text-muted-foreground">SMA (20)</div>
                      <div className="text-xl font-bold" data-testid="text-sma">
                        ${bollingerMutation.data.sma}
                      </div>
                    </div>
                    <div className="p-4 bg-red-500/10 rounded space-y-2">
                      <div className="text-xs text-muted-foreground">Lower Band</div>
                      <div className="text-xl font-bold text-red-500" data-testid="text-lower-band">
                        ${bollingerMutation.data.lowerBand}
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-muted rounded space-y-2">
                    <div className="flex justify-between items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Current Price:</span>
                      <span className="font-mono font-bold" data-testid="text-current-price">
                        ${bollingerMutation.data.currentPrice}
                      </span>
                    </div>
                    <div className="flex justify-between items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Band Width:</span>
                      <span className="font-mono" data-testid="text-band-width">
                        {bollingerMutation.data.bandWidth}%
                      </span>
                    </div>
                  </div>

                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription data-testid="text-bollinger-interpretation">
                      <strong>Signal: </strong>{bollingerMutation.data.interpretation}
                    </AlertDescription>
                  </Alert>
                </div>
              )}

              {!bollingerMutation.data && !bollingerMutation.isPending && (
                <div className="text-sm text-muted-foreground" data-testid="empty-bollinger">
                  Analyze a symbol above to auto-calculate, or use manual entry below.
                </div>
              )}

              <Collapsible
                open={manualOpen.bollinger}
                onOpenChange={(open) => setManualOpen((s) => ({ ...s, bollinger: open }))}
              >
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" data-testid="button-toggle-manual-bollinger">
                    <SlidersHorizontal className="h-4 w-4 mr-2" />
                    Manual entry (advanced)
                    <ChevronDown className="h-4 w-4 ml-2" />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-4 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="bollinger-prices">Close Prices (JSON array)</Label>
                    <textarea
                      id="bollinger-prices"
                      className="w-full min-h-32 p-2 rounded-md border bg-background font-mono text-base md:text-xs"
                      placeholder='[502, 506, 504, 508, 510, 512, 509, 515, 518, 516, 520, 522, 519, 523, 521, 525, 527, 524, 528, 530]'
                      value={bollingerPrices}
                      onChange={(e) => setBollingerPrices(e.target.value)}
                      data-testid="input-bollinger-prices"
                    />
                    <p className="text-xs text-muted-foreground">
                      Enter array of close prices (minimum 20 data points for default period)
                    </p>
                  </div>
                  <Button
                    onClick={handleBollingerCalculate}
                    disabled={bollingerMutation.isPending}
                    data-testid="button-calculate-bollinger"
                  >
                    {bollingerMutation.isPending ? "Calculating..." : "Calculate Bollinger Bands"}
                  </Button>
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
