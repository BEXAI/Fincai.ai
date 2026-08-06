import { useQuery } from "@tanstack/react-query";
import { MarketQuoteCard } from "@/components/market-quote-card";
import { StrategyCard } from "@/components/strategy-card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Plus, TrendingUp, AlertCircle, RefreshCw } from "lucide-react";
import { useLocation } from "wouter";
import { queryClient } from "@/lib/queryClient";
import type { Strategy, MarketQuote } from "@shared/schema";

import { useSeo } from "@/components/seo";

export default function Dashboard() {
  useSeo({ path: "/dashboard" });
  const [, setLocation] = useLocation();

  const { 
    data: marketData, 
    isLoading: marketLoading,
    isError: marketError,
    error: marketErrorDetails
  } = useQuery<{
    QQQ: MarketQuote;
    WMT: MarketQuote;
    VIX: MarketQuote;
    SPY: MarketQuote;
  }>({
    queryKey: ["/api/market/summary"],
  });

  const { 
    data: strategies, 
    isLoading: strategiesLoading,
    isError: strategiesError,
    error: strategiesErrorDetails
  } = useQuery<Strategy[]>({
    queryKey: ["/api/strategies"],
  });

  const handleRetryMarket = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/market/summary"] });
  };

  const handleRetryStrategies = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/strategies"] });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-muted-foreground">
            Market overview and active strategies
          </p>
        </div>
        <Button onClick={() => setLocation("/builder")} data-testid="button-new-strategy">
          <Plus className="h-4 w-4 mr-2" />
          New Strategy
        </Button>
      </div>

      {marketError ? (
        <Alert variant="destructive" data-testid="alert-market-error">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Failed to load market data</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-4">
            <span>
              {marketErrorDetails instanceof Error 
                ? marketErrorDetails.message 
                : "Unable to fetch market quotes. Please try again."}
            </span>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleRetryMarket}
              data-testid="button-retry-market"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <MarketQuoteCard
            symbol="QQQ"
            price={marketData?.QQQ?.price}
            change={marketData?.QQQ?.change}
            changePercent={marketData?.QQQ?.changePercent}
            isLoading={marketLoading}
          />
          <MarketQuoteCard
            symbol="WMT"
            price={marketData?.WMT?.price}
            change={marketData?.WMT?.change}
            changePercent={marketData?.WMT?.changePercent}
            isLoading={marketLoading}
          />
          <MarketQuoteCard
            symbol="SPY"
            price={marketData?.SPY?.price}
            change={marketData?.SPY?.change}
            changePercent={marketData?.SPY?.changePercent}
            isLoading={marketLoading}
          />
          <MarketQuoteCard
            symbol="VIX"
            price={marketData?.VIX?.price}
            change={marketData?.VIX?.change}
            changePercent={marketData?.VIX?.changePercent}
            isLoading={marketLoading}
          />
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-medium">Active Strategies</h2>
          {strategies && strategies.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation("/compare")}
              data-testid="button-compare-all"
            >
              <TrendingUp className="h-4 w-4 mr-2" />
              Compare All
            </Button>
          )}
        </div>

        {strategiesLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-48 rounded-lg bg-muted/20 animate-pulse"
                data-testid={`skeleton-strategy-${i}`}
              />
            ))}
          </div>
        ) : strategiesError ? (
          <Alert variant="destructive" data-testid="alert-strategies-error">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Failed to load strategies</AlertTitle>
            <AlertDescription className="flex items-center justify-between gap-4">
              <span>
                {strategiesErrorDetails instanceof Error 
                  ? strategiesErrorDetails.message 
                  : "Unable to fetch your strategies. Please try again."}
              </span>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleRetryStrategies}
                data-testid="button-retry-strategies"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        ) : strategies && strategies.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {strategies.map((strategy) => (
              <StrategyCard
                key={strategy.id}
                strategy={strategy}
                onView={() => setLocation(`/builder?id=${strategy.id}`)}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 border border-dashed rounded-lg" data-testid="empty-strategies">
            <TrendingUp className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No strategies yet</h3>
            <p className="text-muted-foreground mb-4">
              Create your first options strategy to get started
            </p>
            <Button onClick={() => setLocation("/builder")} data-testid="button-create-first-strategy">
              <Plus className="h-4 w-4 mr-2" />
              Create Strategy
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
