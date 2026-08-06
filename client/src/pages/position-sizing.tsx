import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calculator, DollarSign, TrendingDown, TrendingUp, AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";

const positionSizingSchema = z.object({
  accountValue: z.coerce.number().min(1, "Account value must be positive"),
  riskPercentage: z.coerce.number().min(0.1).max(10, "Risk percentage should be between 0.1% and 10%"),
  premiumPerContract: z.coerce.number().min(0.01, "Premium must be positive"),
  maxLossPerContract: z.coerce.number().min(0.01, "Max loss must be positive"),
  maxDailyLossPercent: z.coerce.number().min(0.1).max(20, "Daily loss limit should be between 0.1% and 20%").optional(),
  tradesPerDay: z.coerce.number().int().min(1).max(50, "Trades per day should be between 1 and 50").optional(),
  tradesPerWeek: z.coerce.number().int().min(1).max(100, "Trades per week should be between 1 and 100").optional(),
});

type PositionSizingForm = z.infer<typeof positionSizingSchema>;

interface PositionSizingResult {
  accountValue: number;
  riskPercentage: number;
  maxRiskPerPosition: number;
  recommendedContracts: number;
  totalCost: number;
  totalRisk: number;
}

function ResultsSkeleton() {
  return (
    <div className="space-y-4" data-testid="skeleton-results">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-6 w-20" />
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-5 rounded" />
                <Skeleton className="h-5 w-40" />
              </div>
              <Skeleton className="h-8 w-12" />
            </div>
            <Separator />
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex justify-between items-center">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
            <Separator />
            <div className="space-y-2">
              <div className="flex justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-12" />
              </div>
              <Skeleton className="h-2 w-full rounded-full" />
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-52" />
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-start gap-2">
              <Skeleton className="h-1.5 w-1.5 rounded-full mt-1.5" />
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
          <Separator className="my-4" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      </Card>
    </div>
  );
}

function ErrorState({ 
  error, 
  onRetry 
}: { 
  error: Error; 
  onRetry: () => void;
}) {
  return (
    <div className="space-y-4" data-testid="error-state">
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Calculation Failed</AlertTitle>
        <AlertDescription className="mt-2">
          {error.message || "Unable to calculate position size. Please check your inputs and try again."}
        </AlertDescription>
      </Alert>
      <Button 
        variant="outline" 
        onClick={onRetry}
        className="w-full"
        data-testid="button-retry"
      >
        <RefreshCw className="h-4 w-4 mr-2" />
        Try Again
      </Button>
    </div>
  );
}

import { useSeo } from "@/components/seo";

export default function PositionSizing() {
  useSeo({ path: "/position-sizing" });
  const [result, setResult] = useState<PositionSizingResult | null>(null);
  const { toast } = useToast();

  const form = useForm<PositionSizingForm>({
    resolver: zodResolver(positionSizingSchema),
    defaultValues: {
      accountValue: 50000,
      riskPercentage: 2,
      premiumPerContract: 300,
      maxLossPerContract: 300,
      maxDailyLossPercent: 5,
      tradesPerDay: 3,
      tradesPerWeek: 15,
    },
  });

  const calculateMutation = useMutation({
    mutationFn: async (data: PositionSizingForm) => {
      const res = await apiRequest("POST", "/api/position-sizing", data);
      return await res.json() as PositionSizingResult;
    },
    onSuccess: (data: PositionSizingResult) => {
      setResult(data);
      toast({
        title: "Position Size Calculated",
        description: `Recommended contracts: ${data.recommendedContracts}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Calculation Failed",
        description: error.message || "Failed to calculate position size. Please try again.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: PositionSizingForm) => {
    calculateMutation.mutate(data);
  };

  const riskLevel = result ? (result.riskPercentage <= 1 ? "conservative" : result.riskPercentage <= 2 ? "moderate" : "aggressive") : null;

  const accountValue = form.watch("accountValue");
  const riskPercentage = form.watch("riskPercentage");
  const maxDailyLossPercent = form.watch("maxDailyLossPercent");
  const tradesPerDay = form.watch("tradesPerDay");
  const tradesPerWeek = form.watch("tradesPerWeek");

  const targetMinDrawdown = 10;
  const targetMaxDrawdown = 20;
  const currentDrawdownRisk = result ? (result.totalRisk / result.accountValue) * 100 : 0;
  const isDrawdownWarning = currentDrawdownRisk > targetMaxDrawdown;
  
  const dailyLossLimit = maxDailyLossPercent ? (accountValue * maxDailyLossPercent) / 100 : 0;
  const riskPerTradeDaily = tradesPerDay && dailyLossLimit ? dailyLossLimit / tradesPerDay : 0;
  const riskPerTradeWeekly = tradesPerWeek && maxDailyLossPercent ? (accountValue * maxDailyLossPercent * 5) / 100 / tradesPerWeek : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Position Sizing Calculator</h1>
        <p className="text-muted-foreground">
          Calculate optimal position size based on your risk tolerance
        </p>
      </div>

      <Card className="bg-muted/30 border-2" data-testid="card-drawdown-warning">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <TrendingDown className="h-5 w-5 text-warning" />
            Drawdown Warning
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Target Max Drawdown</span>
            <span className="font-mono font-medium">{targetMinDrawdown}-{targetMaxDrawdown}%</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Current Account Value</span>
            <span className="font-mono font-medium">${accountValue.toLocaleString()}</span>
          </div>
          {result && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Current Position Risk</span>
                <Badge variant={isDrawdownWarning ? "destructive" : currentDrawdownRisk > 15 ? "default" : "outline"}>
                  {currentDrawdownRisk.toFixed(2)}%
                </Badge>
              </div>
              {isDrawdownWarning && (
                <div className="flex items-start gap-2 p-4 bg-destructive/10 border border-destructive/20 rounded-md">
                  <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  <p className="text-sm text-destructive">
                    Warning: Your position risk exceeds the recommended maximum drawdown of {targetMaxDrawdown}%. Consider reducing position size.
                  </p>
                </div>
              )}
              {currentDrawdownRisk > 15 && !isDrawdownWarning && (
                <div className="flex items-start gap-2 p-4 bg-warning/10 border border-warning/20 rounded-md">
                  <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
                  <p className="text-sm text-warning">
                    Caution: Approaching maximum drawdown limits. Monitor your risk carefully.
                  </p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Input Parameters
            </CardTitle>
            <CardDescription>
              Enter your account details and trade parameters
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                <FormField
                  control={form.control}
                  name="accountValue"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Account Value</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            {...field}
                            type="number"
                            className="pl-9 font-mono"
                            placeholder="50000"
                            data-testid="input-account-value"
                          />
                        </div>
                      </FormControl>
                      <FormDescription>
                        Total trading capital available
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="riskPercentage"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Risk Percentage per Position</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            {...field}
                            type="number"
                            step="0.1"
                            className="font-mono"
                            placeholder="2.0"
                            data-testid="input-risk-percentage"
                          />
                          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                        </div>
                      </FormControl>
                      <FormDescription>
                        Maximum account risk per trade (1-2% recommended)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="premiumPerContract"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Premium per Contract</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            {...field}
                            type="number"
                            step="0.01"
                            className="pl-9 font-mono"
                            placeholder="300"
                            data-testid="input-premium"
                          />
                        </div>
                      </FormControl>
                      <FormDescription>
                        Cost to enter the position per contract
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="maxLossPerContract"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Max Loss per Contract</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            {...field}
                            type="number"
                            step="0.01"
                            className="pl-9 font-mono"
                            placeholder="300"
                            data-testid="input-max-loss"
                          />
                        </div>
                      </FormControl>
                      <FormDescription>
                        Maximum potential loss per contract
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Separator />

                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-medium mb-2">Daily Loss Limit Calculator</h3>
                    <FormField
                      control={form.control}
                      name="maxDailyLossPercent"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs">Max Daily Loss %</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input
                                {...field}
                                type="number"
                                step="0.1"
                                className="font-mono"
                                placeholder="5.0"
                                data-testid="input-daily-loss-percent"
                              />
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">%</span>
                            </div>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {dailyLossLimit > 0 && (
                      <div className="mt-2 p-2 bg-muted rounded-md space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Daily Loss Limit</span>
                          <span className="font-mono font-medium" data-testid="text-daily-loss-limit">
                            ${dailyLossLimit.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Remaining Capacity</span>
                          <span className="font-mono text-profit" data-testid="text-daily-capacity">
                            ${dailyLossLimit.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <h3 className="text-sm font-medium mb-2">Trade Frequency Analyzer</h3>
                    <div className="grid grid-cols-2 gap-2">
                      <FormField
                        control={form.control}
                        name="tradesPerDay"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Trades/Day</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                type="number"
                                className="h-8 font-mono"
                                placeholder="3"
                                data-testid="input-trades-per-day"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="tradesPerWeek"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel className="text-xs">Trades/Week</FormLabel>
                            <FormControl>
                              <Input
                                {...field}
                                type="number"
                                className="h-8 font-mono"
                                placeholder="15"
                                data-testid="input-trades-per-week"
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    {riskPerTradeDaily > 0 && (
                      <div className="mt-2 p-2 bg-muted rounded-md space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Risk/Trade (Daily)</span>
                          <span className="font-mono font-medium" data-testid="text-risk-per-trade-daily">
                            ${riskPerTradeDaily.toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs">
                          <span className="text-muted-foreground">Risk/Trade (Weekly)</span>
                          <span className="font-mono font-medium" data-testid="text-risk-per-trade-weekly">
                            ${riskPerTradeWeekly.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <Button
                  type="submit"
                  className="w-full"
                  disabled={calculateMutation.isPending}
                  data-testid="button-calculate"
                >
                  {calculateMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Calculating...
                    </>
                  ) : (
                    "Calculate Position Size"
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        {calculateMutation.isPending && <ResultsSkeleton />}
        
        {calculateMutation.isError && !calculateMutation.isPending && (
          <ErrorState 
            error={calculateMutation.error as Error} 
            onRetry={() => form.handleSubmit(onSubmit)()} 
          />
        )}

        {result && !calculateMutation.isPending && !calculateMutation.isError && (
          <div className="space-y-4">
            <Card data-testid="card-results">
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2">
                  <span>Position Sizing Results</span>
                  <Badge
                    className={
                      riskLevel === "conservative"
                        ? "bg-chart-2"
                        : riskLevel === "moderate"
                        ? "bg-chart-3"
                        : "bg-chart-5"
                    }
                  >
                    {riskLevel}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2 p-4 bg-muted/50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-profit" />
                      <span className="font-medium">Recommended Contracts</span>
                    </div>
                    <span className="text-2xl font-mono font-semibold" data-testid="text-recommended-contracts">
                      {result.recommendedContracts}
                    </span>
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-sm text-muted-foreground">Account Value</span>
                      <span className="font-mono font-medium" data-testid="text-account-value">
                        ${result.accountValue.toLocaleString()}
                      </span>
                    </div>

                    <div className="flex justify-between items-center gap-2">
                      <span className="text-sm text-muted-foreground">Max Risk Per Position</span>
                      <span className="font-mono font-medium" data-testid="text-max-risk">
                        ${result.maxRiskPerPosition.toFixed(2)}
                      </span>
                    </div>

                    <div className="flex justify-between items-center gap-2">
                      <span className="text-sm text-muted-foreground">Total Position Cost</span>
                      <span className="font-mono font-medium text-chart-3" data-testid="text-total-cost">
                        ${result.totalCost.toFixed(2)}
                      </span>
                    </div>

                    <div className="flex justify-between items-center gap-2">
                      <span className="text-sm text-muted-foreground">Total Risk Exposure</span>
                      <span className="font-mono font-medium text-loss" data-testid="text-total-risk">
                        ${result.totalRisk.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm gap-2">
                      <span className="text-muted-foreground">Portfolio Impact</span>
                      <span className="font-mono">
                        {((result.totalCost / result.accountValue) * 100).toFixed(2)}%
                      </span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-chart-3"
                        style={{
                          width: `${Math.min((result.totalCost / result.accountValue) * 100, 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-warning" />
                  Risk Management Guidelines
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-profit mt-1.5" />
                  <p className="text-muted-foreground">
                    <strong className="text-foreground">Conservative (≤1%):</strong> Low risk, suitable for account preservation and beginners
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-chart-3 mt-1.5" />
                  <p className="text-muted-foreground">
                    <strong className="text-foreground">Moderate (1-2%):</strong> Balanced risk/reward, recommended for most traders
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-loss mt-1.5" />
                  <p className="text-muted-foreground">
                    <strong className="text-foreground">Aggressive ({'>'}2%):</strong> Higher risk, requires strong conviction and experience
                  </p>
                </div>
                <Separator className="my-4" />
                <p className="text-xs text-muted-foreground italic">
                  Note: These recommendations assume proper stop-loss placement and position monitoring. Always consider your overall portfolio exposure and risk tolerance.
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
