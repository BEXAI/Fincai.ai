import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { MarketQuoteCard } from "@/components/market-quote-card";
import { Plus, Trash2, Eye, AlertCircle, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { WatchlistItem, MarketQuote } from "@shared/schema";

import { useSeo } from "@/components/seo";

export default function Watchlist() {
  useSeo({ path: "/watchlist" });
  const { toast } = useToast();
  const [newSymbol, setNewSymbol] = useState("");

  const { 
    data: watchlist, 
    isLoading: isLoadingWatchlist, 
    isError: isWatchlistError,
    error: watchlistError,
    refetch: refetchWatchlist
  } = useQuery<WatchlistItem[]>({
    queryKey: ["/api/watchlist"],
  });

  const symbols = watchlist?.map((w) => w.symbol).join(",") || "";
  const { 
    data: quotes, 
    isLoading: isLoadingQuotes,
    isError: isQuotesError,
    refetch: refetchQuotes
  } = useQuery<Record<string, MarketQuote>>({
    queryKey: [`/api/market/quotes?symbols=${symbols}`],
    enabled: !!watchlist && watchlist.length > 0,
  });

  const addMutation = useMutation({
    mutationFn: async (symbol: string) => {
      const response = await apiRequest("POST", "/api/watchlist", { symbol: symbol.toUpperCase() });
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Symbol added",
        description: "Added to your watchlist successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] });
      setNewSymbol("");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add symbol",
        variant: "destructive",
      });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/watchlist/${id}`, undefined);
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Symbol removed",
        description: "Removed from your watchlist.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/watchlist"] });
    },
  });

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (newSymbol.trim()) {
      addMutation.mutate(newSymbol.trim());
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Watchlist</h1>
        <p className="text-muted-foreground">
          Track your favorite stocks and monitor real-time prices
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Add Symbol
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAdd} className="flex gap-2">
            <Input
              value={newSymbol}
              onChange={(e) => setNewSymbol(e.target.value.toUpperCase())}
              placeholder="Enter ticker symbol (e.g., AAPL)"
              className="uppercase font-mono"
              data-testid="input-add-symbol"
            />
            <Button
              type="submit"
              disabled={addMutation.isPending || !newSymbol.trim()}
              data-testid="button-add-to-watchlist"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add
            </Button>
          </form>
        </CardContent>
      </Card>

      {isWatchlistError ? (
        <Alert variant="destructive" data-testid="alert-watchlist-error">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Failed to load watchlist</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-4">
            <span>
              {watchlistError instanceof Error 
                ? watchlistError.message 
                : "Unable to fetch your watchlist. Please try again."}
            </span>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => refetchWatchlist()}
              data-testid="button-retry-watchlist"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : isLoadingWatchlist ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="p-4">
              <Skeleton className="h-6 w-20 mb-2" />
              <Skeleton className="h-8 w-24 mb-2" />
              <Skeleton className="h-4 w-16" />
            </Card>
          ))}
        </div>
      ) : watchlist && watchlist.length > 0 ? (
        <>
          {isQuotesError && (
            <Alert variant="destructive" className="mb-4" data-testid="alert-quotes-error">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Failed to load market quotes</AlertTitle>
              <AlertDescription className="flex items-center justify-between gap-4">
                <span>Unable to fetch current prices. Showing cached data if available.</span>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => refetchQuotes()}
                  data-testid="button-retry-quotes"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          )}
          
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {watchlist.map((item) => (
              <div key={item.id} className="relative">
                {isLoadingQuotes && !quotes?.[item.symbol] ? (
                  <Card className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono font-medium">{item.symbol}</span>
                      <Skeleton className="h-4 w-4" />
                    </div>
                    <Skeleton className="h-8 w-24 mb-2" />
                    <Skeleton className="h-4 w-16" />
                  </Card>
                ) : (
                  <MarketQuoteCard
                    symbol={item.symbol}
                    price={quotes?.[item.symbol]?.price}
                    change={quotes?.[item.symbol]?.change}
                    changePercent={quotes?.[item.symbol]?.changePercent}
                  />
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="absolute top-2 right-2"
                  onClick={() => removeMutation.mutate(item.id)}
                  data-testid={`button-remove-${item.symbol}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Watchlist Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {watchlist.map((item) => {
                  const quote = quotes?.[item.symbol];
                  const isPositive = (quote?.change ?? 0) > 0;
                  const isNegative = (quote?.change ?? 0) < 0;

                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3 border rounded-md hover-elevate"
                      data-testid={`watchlist-item-${item.symbol}`}
                    >
                      <div>
                        <div className="font-medium font-mono">{item.symbol}</div>
                        <div className="text-sm text-muted-foreground">{item.name}</div>
                      </div>
                      <div className="text-right">
                        {isLoadingQuotes && !quote ? (
                          <>
                            <Skeleton className="h-5 w-16 mb-1" />
                            <Skeleton className="h-4 w-12" />
                          </>
                        ) : (
                          <>
                            <div className="font-mono font-medium">
                              ${quote?.price?.toFixed(2) ?? "--"}
                            </div>
                            <div
                              className={`text-sm font-mono ${
                                isPositive
                                  ? "text-profit"
                                  : isNegative
                                  ? "text-loss"
                                  : "text-muted-foreground"
                              }`}
                            >
                              {isPositive && "+"}
                              {quote?.changePercent?.toFixed(2) ?? "--"}%
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card className="text-center py-12" data-testid="empty-watchlist-state">
          <Eye className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No symbols in watchlist</h3>
          <p className="text-muted-foreground">
            Add stocks to your watchlist to track their prices
          </p>
        </Card>
      )}
    </div>
  );
}
