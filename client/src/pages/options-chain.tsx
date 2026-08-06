import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Search,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Info,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  Target,
  Activity,
  Percent,
  BarChart3,
  Shield,
  Lock,
  GraduationCap,
  AlertTriangle,
  Eye,
  EyeOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, parseISO, differenceInDays } from "date-fns";
import {
  usePricingGreeks,
  getGreeksForContract,
  formatGreek,
  getGreekColor,
  type ContractInput,
} from "@/hooks/use-pricing-greeks";

interface OptionContract {
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

interface OptionsChainData {
  chain: OptionContract[];
  expirationDates: string[];
  underlyingPrice: number;
}

interface Greeks {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
}

export default function OptionsChainPage() {
  const [, setLocation] = useLocation();
  const [searchSymbol, setSearchSymbol] = useState("");
  const [activeSymbol, setActiveSymbol] = useState("SPY");
  const [selectedExpiration, setSelectedExpiration] = useState<string>("");
  const [strikeFilter, setStrikeFilter] = useState<"all" | "itm" | "otm" | "atm">("all");
  const [viewType, setViewType] = useState<"calls" | "puts" | "straddle">("calls");
  const [strikeRange, setStrikeRange] = useState(5);
  const [showGreeks, setShowGreeks] = useState(true);
  
  const optionsLevel = 3;
  const optionsLevelInfo = {
    name: "Options Research",
    description: "Educational options chain with real-time pricing and Greeks.",
    strategies: [] as string[],
  };

  const handleSearch = () => {
    if (searchSymbol.trim()) {
      setActiveSymbol(searchSymbol.toUpperCase().trim());
      setSelectedExpiration("");
    }
  };

  const { data: quoteData, isLoading: quoteLoading } = useQuery<{ price: number; change: number; changePercent: number }>({
    queryKey: ["/api/market/quote", activeSymbol],
    enabled: !!activeSymbol,
    refetchInterval: 30000,
  });

  const { data: optionsData, isLoading: optionsLoading, refetch: refetchOptions } = useQuery<OptionsChainData>({
    queryKey: ["/api/options/chain", activeSymbol, selectedExpiration],
    enabled: !!activeSymbol,
    refetchInterval: 60000,
  });

  const currentExpiration = selectedExpiration || optionsData?.expirationDates?.[0] || "";

  const daysToExpiration = useMemo(() => {
    if (!currentExpiration) return 0;
    try {
      const expDate = parseISO(currentExpiration);
      return differenceInDays(expDate, new Date());
    } catch {
      return 0;
    }
  }, [currentExpiration]);

  const filteredOptions = useMemo(() => {
    if (!optionsData?.chain) return { calls: [], puts: [] };

    const underlyingPrice = optionsData.underlyingPrice || quoteData?.price || 0;
    let options = optionsData.chain.filter(opt => 
      !currentExpiration || opt.expiration === currentExpiration
    );

    const minStrike = underlyingPrice - (strikeRange * underlyingPrice * 0.01);
    const maxStrike = underlyingPrice + (strikeRange * underlyingPrice * 0.01);
    options = options.filter(opt => opt.strike >= minStrike && opt.strike <= maxStrike);

    if (strikeFilter !== "all") {
      options = options.filter(opt => {
        const isITM = opt.type === "call" ? opt.strike < underlyingPrice : opt.strike > underlyingPrice;
        const isATM = Math.abs(opt.strike - underlyingPrice) / underlyingPrice < 0.01;
        
        switch (strikeFilter) {
          case "itm": return isITM;
          case "otm": return !isITM && !isATM;
          case "atm": return isATM;
          default: return true;
        }
      });
    }

    const calls = options.filter(opt => opt.type === "call").sort((a, b) => a.strike - b.strike);
    const puts = options.filter(opt => opt.type === "put").sort((a, b) => a.strike - b.strike);

    return { calls, puts };
  }, [optionsData, currentExpiration, strikeFilter, strikeRange, quoteData?.price]);

  const formatCurrency = (value: number | null | undefined) => {
    if (value === null || value === undefined) return "—";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(value);
  };

  const formatPercent = (value: number | null | undefined) => {
    if (value === null || value === undefined) return "—";
    return `${(value * 100).toFixed(1)}%`;
  };

  const formatNumber = (value: number | null | undefined) => {
    if (value === null || value === undefined) return "—";
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
    return value.toLocaleString();
  };

  const underlyingPrice = optionsData?.underlyingPrice || quoteData?.price || 0;

  const greeksContracts = useMemo((): ContractInput[] => {
    if (!showGreeks) return [];
    const allOptions = [...filteredOptions.calls, ...filteredOptions.puts];
    return allOptions.map(opt => ({
      strikePrice: opt.strike,
      volatility: opt.impliedVolatility || 0.3,
      optionType: opt.type,
    }));
  }, [filteredOptions, showGreeks]);

  const { 
    data: greeksMap, 
    isLoading: greeksLoading,
  } = usePricingGreeks(
    activeSymbol,
    underlyingPrice,
    currentExpiration,
    greeksContracts,
    showGreeks && greeksContracts.length > 0
  );

  const renderOptionsTable = (options: OptionContract[], type: "call" | "put") => {
    if (options.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center" data-testid="options-empty">
          <Target className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium mb-1">No Options Found</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            No {type} options match your current filters. Try adjusting the strike range or expiration date.
          </p>
        </div>
      );
    }

    return (
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-center">Strike</TableHead>
              <TableHead className="text-right">Bid</TableHead>
              <TableHead className="text-right">Ask</TableHead>
              <TableHead className="text-right">Last</TableHead>
              <TableHead className="text-right">
                <Tooltip>
                  <TooltipTrigger className="flex items-center gap-1">
                    IV <Info className="h-3 w-3" />
                  </TooltipTrigger>
                  <TooltipContent>Implied Volatility</TooltipContent>
                </Tooltip>
              </TableHead>
              {showGreeks && (
                <>
                  <TableHead className="text-right">
                    <Tooltip>
                      <TooltipTrigger className="flex items-center gap-1 justify-end">
                        Δ <Info className="h-3 w-3" />
                      </TooltipTrigger>
                      <TooltipContent>Delta: Price sensitivity to underlying</TooltipContent>
                    </Tooltip>
                  </TableHead>
                  <TableHead className="text-right">
                    <Tooltip>
                      <TooltipTrigger className="flex items-center gap-1 justify-end">
                        Γ <Info className="h-3 w-3" />
                      </TooltipTrigger>
                      <TooltipContent>Gamma: Rate of change in delta</TooltipContent>
                    </Tooltip>
                  </TableHead>
                  <TableHead className="text-right">
                    <Tooltip>
                      <TooltipTrigger className="flex items-center gap-1 justify-end">
                        Θ <Info className="h-3 w-3" />
                      </TooltipTrigger>
                      <TooltipContent>Theta: Time decay per day</TooltipContent>
                    </Tooltip>
                  </TableHead>
                  <TableHead className="text-right">
                    <Tooltip>
                      <TooltipTrigger className="flex items-center gap-1 justify-end">
                        ν <Info className="h-3 w-3" />
                      </TooltipTrigger>
                      <TooltipContent>Vega: Sensitivity to volatility</TooltipContent>
                    </Tooltip>
                  </TableHead>
                  <TableHead className="text-right">
                    <Tooltip>
                      <TooltipTrigger className="flex items-center gap-1 justify-end">
                        ρ <Info className="h-3 w-3" />
                      </TooltipTrigger>
                      <TooltipContent>Rho: Interest rate sensitivity</TooltipContent>
                    </Tooltip>
                  </TableHead>
                </>
              )}
              <TableHead className="text-right">Volume</TableHead>
              <TableHead className="text-right">
                <Tooltip>
                  <TooltipTrigger className="flex items-center gap-1">
                    OI <Info className="h-3 w-3" />
                  </TooltipTrigger>
                  <TooltipContent>Open Interest</TooltipContent>
                </Tooltip>
              </TableHead>
              <TableHead className="text-center">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {options.map((option) => {
              const isATM = Math.abs(option.strike - underlyingPrice) / underlyingPrice < 0.01;
              const spread = option.ask - option.bid;
              const spreadPercent = option.ask > 0 ? (spread / option.ask) * 100 : 0;
              
              return (
                <TableRow
                  key={option.symbol}
                  className={cn(
                    isATM && "bg-primary/5 border-l-2 border-l-primary",
                    option.inTheMoney && "bg-emerald-500/5"
                  )}
                  data-testid={`row-option-${option.symbol}`}
                >
                  <TableCell className="text-center">
                    <div className="flex flex-col items-center">
                      <span className="font-mono font-medium">{formatCurrency(option.strike)}</span>
                      {isATM && <Badge variant="outline" className="text-xs mt-1">ATM</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-emerald-500">
                    {formatCurrency(option.bid)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-red-500">
                    {formatCurrency(option.ask)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(option.last)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-col items-end">
                      <span className="font-mono">{formatPercent(option.impliedVolatility)}</span>
                      {option.impliedVolatility > 0.5 && (
                        <Badge variant="secondary" className="text-xs">High</Badge>
                      )}
                    </div>
                  </TableCell>
                  {showGreeks && (() => {
                    const greeks = getGreeksForContract(greeksMap, option.strike, option.type);
                    if (greeksLoading) {
                      return (
                        <>
                          <TableCell className="text-right"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                          <TableCell className="text-right"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                          <TableCell className="text-right"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                          <TableCell className="text-right"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                          <TableCell className="text-right"><Skeleton className="h-4 w-12 ml-auto" /></TableCell>
                        </>
                      );
                    }
                    return (
                      <>
                        <TableCell className={cn("text-right font-mono", getGreekColor(greeks?.delta))} data-testid={`greek-delta-${option.symbol}`}>
                          {formatGreek(greeks?.delta)}
                        </TableCell>
                        <TableCell className={cn("text-right font-mono", getGreekColor(greeks?.gamma))} data-testid={`greek-gamma-${option.symbol}`}>
                          {formatGreek(greeks?.gamma, 3)}
                        </TableCell>
                        <TableCell className={cn("text-right font-mono", getGreekColor(greeks?.theta))} data-testid={`greek-theta-${option.symbol}`}>
                          {formatGreek(greeks?.theta)}
                        </TableCell>
                        <TableCell className={cn("text-right font-mono", getGreekColor(greeks?.vega))} data-testid={`greek-vega-${option.symbol}`}>
                          {formatGreek(greeks?.vega)}
                        </TableCell>
                        <TableCell className={cn("text-right font-mono", getGreekColor(greeks?.rho))} data-testid={`greek-rho-${option.symbol}`}>
                          {formatGreek(greeks?.rho)}
                        </TableCell>
                      </>
                    );
                  })()}
                  <TableCell className="text-right font-mono">
                    {formatNumber(option.volume)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatNumber(option.openInterest)}
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge 
                      variant={option.inTheMoney ? "default" : "secondary"}
                      className={option.inTheMoney ? "bg-emerald-600" : ""}
                    >
                      {option.inTheMoney ? "ITM" : "OTM"}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    );
  };

  const renderStraddleView = () => {
    const strikesSet = new Set<number>([
      ...filteredOptions.calls.map(c => c.strike),
      ...filteredOptions.puts.map(p => p.strike)
    ]);
    const strikes = Array.from(strikesSet).sort((a, b) => a - b);

    if (strikes.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Activity className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium mb-1">No Options Data</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            Adjust your filters or search for a different symbol.
          </p>
        </div>
      );
    }

    return (
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-right text-emerald-500">Call Bid</TableHead>
              <TableHead className="text-right text-emerald-500">Call Ask</TableHead>
              <TableHead className="text-right text-emerald-500">Call Vol</TableHead>
              <TableHead className="text-center font-bold">Strike</TableHead>
              <TableHead className="text-right text-red-500">Put Bid</TableHead>
              <TableHead className="text-right text-red-500">Put Ask</TableHead>
              <TableHead className="text-right text-red-500">Put Vol</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {strikes.map((strike) => {
              const call = filteredOptions.calls.find(c => c.strike === strike);
              const put = filteredOptions.puts.find(p => p.strike === strike);
              const isATM = Math.abs(strike - underlyingPrice) / underlyingPrice < 0.01;

              return (
                <TableRow
                  key={strike}
                  className={cn(
                    isATM && "bg-primary/5 border-y-2 border-primary/50"
                  )}
                >
                  <TableCell className="text-right font-mono text-emerald-500">
                    {call ? formatCurrency(call.bid) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-emerald-500">
                    {call ? formatCurrency(call.ask) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground">
                    {call ? formatNumber(call.volume) : "—"}
                  </TableCell>
                  <TableCell className="text-center">
                    <div className="flex flex-col items-center">
                      <span className="font-mono font-bold">{formatCurrency(strike)}</span>
                      {isATM && <Badge variant="outline" className="text-xs">ATM</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-red-500">
                    {put ? formatCurrency(put.bid) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-red-500">
                    {put ? formatCurrency(put.ask) : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground">
                    {put ? formatNumber(put.volume) : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold" data-testid="text-page-title">Options Chain</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              View options contracts with real-time pricing and Greeks
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Symbol..."
                value={searchSymbol}
                onChange={(e) => setSearchSymbol(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="pl-9 w-32 uppercase"
                data-testid="input-search-symbol"
              />
            </div>
            <Button onClick={handleSearch} data-testid="button-search">
              Search
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={() => refetchOptions()}
              data-testid="button-refresh"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setLocation("/volatility-surface")}
                  data-testid="button-vol-surface"
                >
                  <TrendingUp className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>IV Surface Analysis</TooltipContent>
            </Tooltip>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowGreeks(!showGreeks)}
              className={cn(
                showGreeks && "border-primary/50 bg-primary/5"
              )}
              data-testid="button-toggle-greeks"
            >
              {showGreeks ? <Eye className="h-4 w-4 mr-1" /> : <EyeOff className="h-4 w-4 mr-1" />}
              Greeks
            </Button>
          </div>
        </div>
        
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-card/50 backdrop-blur-sm border-border/50" data-testid="card-underlying">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              {activeSymbol}
              {quoteData && (
                <Badge variant={quoteData.changePercent >= 0 ? "default" : "destructive"}>
                  {quoteData.changePercent >= 0 ? "+" : ""}{quoteData.changePercent.toFixed(2)}%
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {quoteLoading ? (
              <Skeleton className="h-8 w-24" data-testid="underlying-loading" />
            ) : (
              <div className="text-3xl font-bold font-mono" data-testid="text-underlying-price">
                {formatCurrency(quoteData?.price || underlyingPrice)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Expiration</CardTitle>
          </CardHeader>
          <CardContent>
            <Select 
              value={currentExpiration} 
              onValueChange={setSelectedExpiration}
            >
              <SelectTrigger data-testid="select-expiration">
                <SelectValue placeholder="Select expiration" />
              </SelectTrigger>
              <SelectContent>
                {optionsData?.expirationDates?.map((date) => (
                  <SelectItem key={date} value={date}>
                    {format(parseISO(date), "MMM d, yyyy")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {daysToExpiration > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                {daysToExpiration} days to expiration
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Strike Filter</CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={strikeFilter} onValueChange={(v: any) => setStrikeFilter(v)}>
              <SelectTrigger data-testid="select-strike-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Strikes</SelectItem>
                <SelectItem value="itm">In The Money</SelectItem>
                <SelectItem value="otm">Out of The Money</SelectItem>
                <SelectItem value="atm">At The Money</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Strike Range</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setStrikeRange(Math.max(1, strikeRange - 1))}
                data-testid="button-range-decrease"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-center flex-1 font-mono">±{strikeRange}%</span>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setStrikeRange(Math.min(20, strikeRange + 1))}
                data-testid="button-range-increase"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card/50 backdrop-blur-sm border-border/50" data-testid="card-options-chain">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Options Chain
              </CardTitle>
              <CardDescription>
                {currentExpiration && `Expiring ${format(parseISO(currentExpiration), "MMMM d, yyyy")}`}
              </CardDescription>
            </div>
            <Tabs value={viewType} onValueChange={(v: any) => setViewType(v)}>
              <TabsList>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <TabsTrigger 
                      value="calls" 
                      className={cn(
                        "text-emerald-500",
                        optionsLevel < 2 && "opacity-60"
                      )} 
                      data-testid="tab-calls"
                    >
                      {optionsLevel < 2 && <Lock className="h-3 w-3 mr-1" />}
                      <TrendingUp className="h-4 w-4 mr-1" /> Calls
                    </TabsTrigger>
                  </TooltipTrigger>
                  {optionsLevel < 2 && (
                    <TooltipContent>
                      <p>Long calls require Level 2</p>
                    </TooltipContent>
                  )}
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <TabsTrigger 
                      value="puts" 
                      className={cn(
                        "text-red-500",
                        optionsLevel < 2 && "opacity-60"
                      )} 
                      data-testid="tab-puts"
                    >
                      {optionsLevel < 2 && <Lock className="h-3 w-3 mr-1" />}
                      <TrendingDown className="h-4 w-4 mr-1" /> Puts
                    </TabsTrigger>
                  </TooltipTrigger>
                  {optionsLevel < 2 && (
                    <TooltipContent>
                      <p>Long puts require Level 2</p>
                    </TooltipContent>
                  )}
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <TabsTrigger 
                      value="straddle" 
                      className={optionsLevel < 3 ? "opacity-60" : ""}
                      data-testid="tab-straddle"
                    >
                      {optionsLevel < 3 && <Lock className="h-3 w-3 mr-1" />}
                      <Activity className="h-4 w-4 mr-1" /> Straddle
                    </TabsTrigger>
                  </TooltipTrigger>
                  {optionsLevel < 3 && (
                    <TooltipContent>
                      <p>Straddles require Level 3</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent>
          {optionsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <>
              {viewType === "calls" && renderOptionsTable(filteredOptions.calls, "call")}
              {viewType === "puts" && renderOptionsTable(filteredOptions.puts, "put")}
              {viewType === "straddle" && renderStraddleView()}
            </>
          )}
        </CardContent>
      </Card>

      <Card className="bg-card/50 backdrop-blur-sm border-border/50" data-testid="card-greeks-legend">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Percent className="h-4 w-4" />
            Greeks Reference
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
            <div>
              <div className="font-medium">Delta (Δ)</div>
              <p className="text-xs text-muted-foreground">
                Price sensitivity to underlying movement
              </p>
            </div>
            <div>
              <div className="font-medium">Gamma (Γ)</div>
              <p className="text-xs text-muted-foreground">
                Rate of change in delta
              </p>
            </div>
            <div>
              <div className="font-medium">Theta (Θ)</div>
              <p className="text-xs text-muted-foreground">
                Time decay per day
              </p>
            </div>
            <div>
              <div className="font-medium">Vega (ν)</div>
              <p className="text-xs text-muted-foreground">
                Sensitivity to volatility changes
              </p>
            </div>
            <div>
              <div className="font-medium">IV</div>
              <p className="text-xs text-muted-foreground">
                Implied volatility from market prices
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
