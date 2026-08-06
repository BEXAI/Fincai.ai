import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { TrendingUp, ArrowRight, AlertCircle, RefreshCw } from "lucide-react";
import type { Strategy } from "@shared/schema";

function StrategyCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-5 w-8 rounded-full" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-3 border rounded-md">
              <Skeleton className="h-5 w-32 mb-2" />
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-3 w-3" />
                <Skeleton className="h-4 w-20" />
              </div>
              <Skeleton className="h-3 w-full mt-2" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function DistributionSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-40" />
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-4">
              <div className="flex-1">
                <div className="flex justify-between mb-1">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-8" />
                </div>
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function CompareStrategies() {
  const { data: strategies, isLoading, isError, error, refetch } = useQuery<Strategy[]>({
    queryKey: ["/api/strategies"],
  });

  const groupByRiskProfile = (strategies: Strategy[]) => {
    return {
      conservative: strategies.filter((s) => s.riskProfile === "conservative"),
      moderate: strategies.filter((s) => s.riskProfile === "moderate"),
      aggressive: strategies.filter((s) => s.riskProfile === "aggressive"),
    };
  };

  const grouped = strategies ? groupByRiskProfile(strategies) : null;

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case "conservative":
        return "bg-chart-2 text-white";
      case "moderate":
        return "bg-chart-3 text-white";
      case "aggressive":
        return "bg-chart-5 text-white";
      default:
        return "bg-muted";
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6" data-testid="loading-state">
        <div>
          <h1 className="text-2xl font-semibold">Compare Strategies</h1>
          <p className="text-muted-foreground">
            Side-by-side comparison of your options strategies
          </p>
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <StrategyCardSkeleton key={i} />
          ))}
        </div>
        <DistributionSkeleton />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-6" data-testid="error-state">
        <div>
          <h1 className="text-2xl font-semibold">Compare Strategies</h1>
          <p className="text-muted-foreground">
            Side-by-side comparison of your options strategies
          </p>
        </div>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Failed to load strategies</AlertTitle>
          <AlertDescription className="flex flex-col gap-3">
            <span>
              {error instanceof Error 
                ? error.message 
                : "We couldn't load your strategies. Please check your connection and try again."}
            </span>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => refetch()}
              className="w-fit"
              data-testid="button-retry"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Try Again
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!strategies || strategies.length === 0) {
    return (
      <div className="space-y-6" data-testid="empty-state">
        <div>
          <h1 className="text-2xl font-semibold">Compare Strategies</h1>
          <p className="text-muted-foreground">
            Side-by-side comparison of your options strategies
          </p>
        </div>
        <Card className="text-center py-12" data-testid="card-empty-strategies">
          <TrendingUp className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No strategies to compare</h3>
          <p className="text-muted-foreground">
            Create at least two strategies to use the comparison view
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Compare Strategies</h1>
        <p className="text-muted-foreground">
          Side-by-side comparison of your options strategies
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {(["conservative", "moderate", "aggressive"] as const).map((profile) => (
          <Card key={profile} data-testid={`card-${profile}-strategies`}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="capitalize">{profile}</span>
                <Badge className={getRiskColor(profile)}>
                  {grouped?.[profile]?.length || 0}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {grouped?.[profile] && grouped[profile].length > 0 ? (
                <div className="space-y-3">
                  {grouped[profile].map((strategy) => (
                    <div
                      key={strategy.id}
                      className="p-3 border rounded-md hover-elevate"
                      data-testid={`strategy-item-${strategy.id}`}
                    >
                      <div className="font-medium mb-1">{strategy.name}</div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className="font-mono">{strategy.underlyingSymbol}</span>
                        <ArrowRight className="h-3 w-3" />
                        <span className="capitalize">
                          {strategy.strategyType.replace(/_/g, " ")}
                        </span>
                      </div>
                      {strategy.description && (
                        <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                          {strategy.description}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <p className="text-sm">No {profile} strategies</p>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Strategy Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="flex justify-between mb-1 text-sm">
                  <span>Conservative</span>
                  <span className="font-mono text-muted-foreground">
                    {grouped?.conservative.length || 0}
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-chart-2"
                    style={{
                      width: `${
                        ((grouped?.conservative.length || 0) / strategies.length) * 100
                      }%`,
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="flex justify-between mb-1 text-sm">
                  <span>Moderate</span>
                  <span className="font-mono text-muted-foreground">
                    {grouped?.moderate.length || 0}
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-chart-3"
                    style={{
                      width: `${
                        ((grouped?.moderate.length || 0) / strategies.length) * 100
                      }%`,
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="flex justify-between mb-1 text-sm">
                  <span>Aggressive</span>
                  <span className="font-mono text-muted-foreground">
                    {grouped?.aggressive.length || 0}
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-chart-5"
                    style={{
                      width: `${
                        ((grouped?.aggressive.length || 0) / strategies.length) * 100
                      }%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
