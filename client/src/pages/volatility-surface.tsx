import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  ArrowLeft, 
  Search, 
  TrendingUp, 
  AlertTriangle, 
  Info,
  RefreshCw,
  Eye,
  EyeOff,
  Grid3X3
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface SurfaceNode {
  strike: number;
  expiry: number;
  expiryDays: number;
  optionType: "call" | "put";
  iv: number;
  ivPercent: string;
  ivSmoothed: number | null;
  ivSmoothedPercent: string | null;
  moneyness: number;
  bid: number;
  ask: number;
  mid: number;
  spreadPercent: string;
  delta: number | null;
  confidence: "high" | "medium" | "low";
  lowConfidenceReasons: string[];
}

interface ExpirySlice {
  expirationDate: string;
  expiry: number;
  expiryDays: number;
  atmStrike: number;
  atmIV: number;
  atmIVPercent: string;
  sviParams?: {
    a: number;
    b: number;
    rho: number;
    m: number;
    sigma: number;
  };
  sviRMSE?: number;
  nodeCount: number;
  parityDeviationCount: number;
}

interface SurfaceData {
  symbol: string;
  spotPrice: number;
  timestamp: string;
  atmIV: number;
  atmIVPercent: string;
  skew25Delta: number;
  termStructure: Array<{ expiry: number; expiryDays: number; atmIV: number; atmIVPercent: string }>;
  overallConfidence: "high" | "medium" | "low";
  warnings: string[];
  nodeCount: number;
  validNodeCount: number;
  slices: ExpirySlice[];
  nodes: SurfaceNode[];
  grid?: Array<{ strike: number; expiry: number; expiryDays: number; iv: number; ivPercent: string; smoothed: boolean }>;
}

interface OptionsChainData {
  symbol: string;
  underlyingPrice: number;
  expirationDates: string[];
  options: Array<{
    strike: number;
    expiration: string;
    callBid: number;
    callAsk: number;
    putBid: number;
    putAsk: number;
  }>;
}

const hotSymbols = ["SPY", "QQQ", "AAPL", "TSLA", "NVDA", "MSFT", "META", "AMZN"];

function getIVColor(iv: number, atmIV: number): string {
  const ratio = iv / atmIV;
  if (ratio < 0.8) return "bg-emerald-500/80";
  if (ratio < 0.9) return "bg-emerald-400/60";
  if (ratio < 1.0) return "bg-emerald-300/40";
  if (ratio < 1.1) return "bg-amber-300/50";
  if (ratio < 1.2) return "bg-amber-400/60";
  if (ratio < 1.4) return "bg-red-400/70";
  return "bg-red-500/80";
}

function getConfidenceColor(confidence: "high" | "medium" | "low"): string {
  switch (confidence) {
    case "high": return "text-emerald-500";
    case "medium": return "text-amber-500";
    case "low": return "text-red-500";
  }
}

export default function VolatilitySurfacePage() {
  const [, setLocation] = useLocation();
  const [symbol, setSymbol] = useState("SPY");
  const [inputSymbol, setInputSymbol] = useState("SPY");
  const [showSmoothed, setShowSmoothed] = useState(true);
  const [selectedExpiry, setSelectedExpiry] = useState<string>("all");
  const [optionTypeFilter, setOptionTypeFilter] = useState<"all" | "call" | "put">("call");

  const { data: quoteData } = useQuery<{ symbol: string; price: number }>({
    queryKey: ["/api/market/quote", symbol],
    staleTime: 10000,
  });

  const { data: chainData, isLoading: isLoadingChain } = useQuery<OptionsChainData>({
    queryKey: ["/api/market/options-chain", symbol],
    enabled: !!symbol,
    staleTime: 30000,
  });

  const { 
    data: surfaceData, 
    isLoading: isLoadingSurface,
    refetch: refetchSurface,
    isFetching
  } = useQuery<{ success: boolean; data: SurfaceData }>({
    queryKey: ["/api/pricing/surface", symbol, chainData?.underlyingPrice],
    queryFn: async () => {
      if (!chainData || !chainData.options || chainData.options.length === 0) {
        throw new Error("No options data available");
      }

      const spotPrice = chainData.underlyingPrice || quoteData?.price || 0;
      if (!spotPrice) throw new Error("No spot price available");

      const expirationGroups = new Map<string, typeof chainData.options>();
      for (const opt of chainData.options) {
        const existing = expirationGroups.get(opt.expiration) || [];
        existing.push(opt);
        expirationGroups.set(opt.expiration, existing);
      }

      const chains = Array.from(expirationGroups.entries())
        .slice(0, 6)
        .map(([expiration, options]) => {
          const sortedOptions = [...options].sort((a, b) => a.strike - b.strike);
          return {
            expirationDate: new Date(expiration).toISOString(),
            strikes: sortedOptions.map(o => o.strike),
            callBids: sortedOptions.map(o => o.callBid || 0),
            callAsks: sortedOptions.map(o => o.callAsk || 0.01),
            putBids: sortedOptions.map(o => o.putBid || 0),
            putAsks: sortedOptions.map(o => o.putAsk || 0.01),
          };
        });

      const response = await apiRequest("POST", "/api/pricing/surface", {
        symbol,
        spotPrice,
        chains,
        style: "AMERICAN",
        includeGrid: true,
      });

      return response.json();
    },
    enabled: !!chainData && chainData.options?.length > 0,
    staleTime: 60000,
    refetchInterval: 60000,
  });

  const surface = surfaceData?.data;

  const filteredNodes = useMemo(() => {
    if (!surface?.nodes) return [];
    return surface.nodes.filter(node => {
      if (optionTypeFilter !== "all" && node.optionType !== optionTypeFilter) return false;
      if (selectedExpiry !== "all" && node.expiryDays.toString() !== selectedExpiry) return false;
      return true;
    });
  }, [surface?.nodes, optionTypeFilter, selectedExpiry]);

  const uniqueExpiries = useMemo(() => {
    if (!surface?.nodes) return [];
    const expiries = Array.from(new Set(surface.nodes.map(n => n.expiryDays)));
    return expiries.sort((a, b) => a - b);
  }, [surface?.nodes]);

  const uniqueStrikes = useMemo(() => {
    const strikes = Array.from(new Set(filteredNodes.map(n => n.strike)));
    return strikes.sort((a, b) => a - b);
  }, [filteredNodes]);

  const heatmapData = useMemo(() => {
    if (showSmoothed && surface?.grid) {
      return surface.grid.filter(g => selectedExpiry === "all" || g.expiryDays.toString() === selectedExpiry);
    }
    return filteredNodes.map(n => ({
      strike: n.strike,
      expiry: n.expiry,
      expiryDays: n.expiryDays,
      iv: showSmoothed && n.ivSmoothed ? n.ivSmoothed : n.iv,
      ivPercent: showSmoothed && n.ivSmoothedPercent ? n.ivSmoothedPercent : n.ivPercent,
      smoothed: showSmoothed && !!n.ivSmoothed,
    }));
  }, [filteredNodes, showSmoothed, surface?.grid, selectedExpiry]);

  const handleSearch = useCallback(() => {
    const cleaned = inputSymbol.trim().toUpperCase();
    if (cleaned && cleaned !== symbol) {
      setSymbol(cleaned);
    }
  }, [inputSymbol, symbol]);

  const isLoading = isLoadingChain || isLoadingSurface;

  return (
    <div className="space-y-4 md:space-y-6 pb-20 md:pb-6" data-testid="volatility-surface-page">
      <div className="flex items-center gap-4 flex-wrap">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocation("/options")}
          className="shrink-0"
          data-testid="button-back"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl md:text-2xl font-bold truncate">Volatility Surface</h1>
          <p className="text-sm text-muted-foreground">IV analysis with SVI smoothing</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetchSurface()}
          disabled={isFetching}
          className="gap-2"
          data-testid="button-refresh-surface"
        >
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex gap-2 flex-1">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Symbol..."
              value={inputSymbol}
              onChange={(e) => setInputSymbol(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="pl-9"
              data-testid="input-symbol"
            />
          </div>
          <Button onClick={handleSearch} data-testid="button-search">
            Search
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {hotSymbols.map((s) => (
            <Button
              key={s}
              variant={symbol === s ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setSymbol(s);
                setInputSymbol(s);
              }}
              data-testid={`button-symbol-${s}`}
            >
              {s}
            </Button>
          ))}
        </div>
      </div>

      {surface?.warnings && surface.warnings.length > 0 && (
        <Alert variant="destructive" data-testid="surface-warnings">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {surface.warnings.map((w, i) => (
              <div key={i}>{w}</div>
            ))}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="glass-panel" data-testid="card-spot-price">
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">Spot Price</div>
            <div className="text-2xl font-bold">${surface?.spotPrice?.toFixed(2) || quoteData?.price?.toFixed(2) || "—"}</div>
            <div className="text-xs text-muted-foreground">{symbol}</div>
          </CardContent>
        </Card>

        <Card className="glass-panel" data-testid="card-atm-iv">
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              ATM IV
              <Tooltip>
                <TooltipTrigger><Info className="h-3 w-3" /></TooltipTrigger>
                <TooltipContent>At-the-money implied volatility</TooltipContent>
              </Tooltip>
            </div>
            <div className="text-2xl font-bold text-primary">
              {surface?.atmIVPercent || "—"}
            </div>
            <div className="text-xs text-muted-foreground">
              Annualized
            </div>
          </CardContent>
        </Card>

        <Card className="glass-panel" data-testid="card-skew">
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground flex items-center gap-1">
              25Δ Skew
              <Tooltip>
                <TooltipTrigger><Info className="h-3 w-3" /></TooltipTrigger>
                <TooltipContent>25-delta put IV minus 25-delta call IV</TooltipContent>
              </Tooltip>
            </div>
            <div className={`text-2xl font-bold ${(surface?.skew25Delta || 0) > 0 ? "text-red-500" : "text-emerald-500"}`}>
              {surface?.skew25Delta ? (surface.skew25Delta * 100).toFixed(2) + "%" : "—"}
            </div>
            <div className="text-xs text-muted-foreground">
              {(surface?.skew25Delta || 0) > 0 ? "Put skew" : "Call skew"}
            </div>
          </CardContent>
        </Card>

        <Card className="glass-panel" data-testid="card-confidence">
          <CardContent className="pt-4">
            <div className="text-sm text-muted-foreground">Confidence</div>
            <div className={`text-2xl font-bold capitalize ${getConfidenceColor(surface?.overallConfidence || "low")}`}>
              {surface?.overallConfidence || "—"}
            </div>
            <div className="text-xs text-muted-foreground">
              {surface?.validNodeCount || 0}/{surface?.nodeCount || 0} valid
            </div>
          </CardContent>
        </Card>
      </div>

      {surface?.termStructure && surface.termStructure.length > 0 && (
        <Card className="glass-panel" data-testid="card-term-structure">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Term Structure
            </CardTitle>
            <CardDescription>ATM IV across expirations</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {surface.termStructure.map((t, i) => (
                <div key={i} className="text-center p-3 rounded-lg bg-muted/50 min-w-[80px]">
                  <div className="text-xs text-muted-foreground">{t.expiryDays}D</div>
                  <div className="text-lg font-semibold text-primary">{t.atmIVPercent}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="glass-panel" data-testid="card-heatmap">
        <CardHeader className="pb-2">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Grid3X3 className="h-4 w-4" />
                IV Heatmap
              </CardTitle>
              <CardDescription>Implied volatility by strike and expiration</CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Label htmlFor="smoothed-toggle" className="text-sm">SVI Smoothed</Label>
                <Switch
                  id="smoothed-toggle"
                  checked={showSmoothed}
                  onCheckedChange={setShowSmoothed}
                  data-testid="switch-smoothed"
                />
                {showSmoothed ? <Eye className="h-4 w-4 text-primary" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
              </div>
              <Select value={optionTypeFilter} onValueChange={(v) => setOptionTypeFilter(v as any)}>
                <SelectTrigger className="w-24" data-testid="select-option-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="call">Calls</SelectItem>
                  <SelectItem value="put">Puts</SelectItem>
                </SelectContent>
              </Select>
              <Select value={selectedExpiry} onValueChange={setSelectedExpiry}>
                <SelectTrigger className="w-28" data-testid="select-expiry">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Expiries</SelectItem>
                  {uniqueExpiries.map((exp) => (
                    <SelectItem key={exp} value={exp.toString()}>{exp}D</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : heatmapData.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No data available for the selected filters
            </div>
          ) : (
            <div className="overflow-x-auto">
              <div className="inline-flex flex-col gap-1 min-w-full">
                <div className="flex gap-1 text-xs text-muted-foreground pl-16">
                  {uniqueStrikes.slice(0, 20).map((strike) => (
                    <div key={strike} className="w-14 text-center font-mono">
                      {strike}
                    </div>
                  ))}
                </div>
                {(selectedExpiry === "all" ? uniqueExpiries : [parseInt(selectedExpiry)]).map((expiryDays) => {
                  const rowData = heatmapData.filter(d => d.expiryDays === expiryDays);
                  if (rowData.length === 0) return null;
                  
                  return (
                    <div key={expiryDays} className="flex gap-1 items-center">
                      <div className="w-14 text-xs text-muted-foreground font-mono text-right pr-2">
                        {expiryDays}D
                      </div>
                      {uniqueStrikes.slice(0, 20).map((strike) => {
                        const cell = rowData.find(d => d.strike === strike);
                        if (!cell) {
                          return <div key={strike} className="w-14 h-10 bg-muted/20 rounded" />;
                        }
                        
                        const atmIV = surface?.atmIV || 0.20;
                        const colorClass = getIVColor(cell.iv, atmIV);
                        
                        return (
                          <Tooltip key={strike}>
                            <TooltipTrigger asChild>
                              <div 
                                className={`w-14 h-10 rounded flex items-center justify-center text-xs font-mono cursor-pointer transition-opacity hover:opacity-80 ${colorClass} ${cell.smoothed ? "ring-1 ring-primary/30" : ""}`}
                                data-testid={`cell-iv-${strike}-${expiryDays}`}
                              >
                                {cell.ivPercent}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <div className="text-xs space-y-1">
                                <div>Strike: ${strike}</div>
                                <div>Expiry: {expiryDays} days</div>
                                <div>IV: {cell.ivPercent}</div>
                                {cell.smoothed && <Badge variant="secondary" className="text-xs">SVI Smoothed</Badge>}
                              </div>
                            </TooltipContent>
                          </Tooltip>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
              
              <div className="flex items-center gap-2 mt-4 text-xs text-muted-foreground justify-center">
                <span>Low IV</span>
                <div className="flex gap-0.5">
                  <div className="w-6 h-4 bg-emerald-500/80 rounded-sm" />
                  <div className="w-6 h-4 bg-emerald-400/60 rounded-sm" />
                  <div className="w-6 h-4 bg-emerald-300/40 rounded-sm" />
                  <div className="w-6 h-4 bg-amber-300/50 rounded-sm" />
                  <div className="w-6 h-4 bg-amber-400/60 rounded-sm" />
                  <div className="w-6 h-4 bg-red-400/70 rounded-sm" />
                  <div className="w-6 h-4 bg-red-500/80 rounded-sm" />
                </div>
                <span>High IV</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {surface?.slices && surface.slices.length > 0 && (
        <Card className="glass-panel" data-testid="card-slices">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Expiry Slices</CardTitle>
            <CardDescription>SVI fit parameters per expiration</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-2">Expiry</th>
                    <th className="text-right py-2 px-2">Days</th>
                    <th className="text-right py-2 px-2">ATM Strike</th>
                    <th className="text-right py-2 px-2">ATM IV</th>
                    <th className="text-right py-2 px-2">SVI ρ</th>
                    <th className="text-right py-2 px-2">RMSE</th>
                    <th className="text-right py-2 px-2">Nodes</th>
                    <th className="text-right py-2 px-2">Parity Errors</th>
                  </tr>
                </thead>
                <tbody>
                  {surface.slices.map((slice, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-muted/20">
                      <td className="py-2 px-2 font-mono text-xs">
                        {new Date(slice.expirationDate).toLocaleDateString()}
                      </td>
                      <td className="text-right py-2 px-2">{slice.expiryDays}</td>
                      <td className="text-right py-2 px-2">${slice.atmStrike}</td>
                      <td className="text-right py-2 px-2 text-primary">{slice.atmIVPercent}</td>
                      <td className="text-right py-2 px-2 font-mono">
                        {slice.sviParams?.rho?.toFixed(3) || "—"}
                      </td>
                      <td className="text-right py-2 px-2 font-mono">
                        {slice.sviRMSE ? (slice.sviRMSE * 100).toFixed(2) + "%" : "—"}
                      </td>
                      <td className="text-right py-2 px-2">{slice.nodeCount}</td>
                      <td className="text-right py-2 px-2">
                        {slice.parityDeviationCount > 0 ? (
                          <Badge variant="destructive" className="text-xs">{slice.parityDeviationCount}</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">0</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
