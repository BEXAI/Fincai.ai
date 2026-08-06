import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, TrendingUp, TrendingDown, Target, Shield } from "lucide-react";
import type { StrategyAnalysis } from "@shared/schema";

interface RiskManagementPanelProps {
  analysis: StrategyAnalysis;
  currentPrice: number;
}

export function RiskManagementPanel({ analysis, currentPrice }: RiskManagementPanelProps) {
  const { maxProfit, maxLoss, breakeven, greeks } = analysis;

  const isProfitable = maxProfit > Math.abs(maxLoss);
  const hasLoss = Math.abs(maxLoss) > 0;
  const riskRewardRatio = hasLoss ? maxProfit / Math.abs(maxLoss) : Infinity;

  const breakevenPrices = (Array.isArray(breakeven) ? breakeven : [breakeven]).filter((price): price is number => 
    typeof price === 'number' && !isNaN(price) && Number.isFinite(price)
  );

  const profitTarget = breakevenPrices.length > 0 && breakevenPrices[0] > 0
    ? currentPrice + (breakevenPrices[0] - currentPrice) * 1.5
    : currentPrice * 1.05;

  const stopLoss = breakevenPrices.length > 0 && breakevenPrices[0] > 0
    ? currentPrice - (currentPrice - breakevenPrices[0]) * 0.5
    : currentPrice * 0.95;

  const getRiskLevel = () => {
    if (!hasLoss) return { level: "Hedged", color: "bg-chart-2", variant: "secondary" as const };
    if (!Number.isFinite(riskRewardRatio) || riskRewardRatio < 0) {
      return { level: "Unfavorable", color: "bg-loss", variant: "destructive" as const };
    }
    if (riskRewardRatio >= 2) return { level: "Low", color: "bg-profit", variant: "default" as const };
    if (riskRewardRatio >= 1) return { level: "Moderate", color: "bg-chart-3", variant: "secondary" as const };
    return { level: "High", color: "bg-loss", variant: "destructive" as const };
  };

  const riskLevel = getRiskLevel();

  const calculateDistanceToBreakeven = (bePrice: number) => {
    const distance = ((bePrice - currentPrice) / currentPrice) * 100;
    return distance;
  };

  return (
    <Card data-testid="card-risk-management">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Risk Management
          </span>
          <Badge variant={riskLevel.variant} data-testid="badge-risk-level">
            {riskLevel.level} Risk
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1 p-4 bg-profit/10 border border-profit/20 rounded-lg">
            <div className="flex items-center gap-2 text-profit">
              <TrendingUp className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wide">Max Profit</span>
            </div>
            <p className="text-2xl font-mono font-bold text-profit" data-testid="text-max-profit">
              ${maxProfit === Infinity ? "Unlimited" : maxProfit.toFixed(2)}
            </p>
            {maxProfit !== Infinity && hasLoss && Number.isFinite(maxLoss) && maxProfit > 0 && (
              <p className="text-xs text-muted-foreground">
                +{((maxProfit / Math.abs(maxLoss)) * 100).toFixed(0)}% ROI
              </p>
            )}
            {maxProfit !== Infinity && !hasLoss && (
              <p className="text-xs text-muted-foreground">
                No risk
              </p>
            )}
          </div>

          <div className="space-y-1 p-4 bg-loss/10 border border-loss/20 rounded-lg">
            <div className="flex items-center gap-2 text-loss">
              <TrendingDown className="h-4 w-4" />
              <span className="text-xs font-medium uppercase tracking-wide">Max Loss</span>
            </div>
            <p className="text-2xl font-mono font-bold text-loss" data-testid="text-max-loss">
              -${!Number.isFinite(maxLoss) || maxLoss === Infinity ? "Unlimited" : Math.abs(maxLoss).toFixed(2)}
            </p>
            <p className="text-xs text-muted-foreground">
              Risk per trade
            </p>
          </div>
        </div>

        <Separator />

        {breakevenPrices.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Target className="h-4 w-4" />
              Breakeven Points
            </div>
            <div className="space-y-2">
              {breakevenPrices.map((bePrice, idx) => {
              const distance = calculateDistanceToBreakeven(bePrice);
              const isAbove = distance > 0;
              return (
                <div
                  key={idx}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-md"
                  data-testid={`breakeven-${idx}`}
                >
                  <span className="text-sm text-muted-foreground">
                    Breakeven {breakevenPrices.length > 1 ? `#${idx + 1}` : ""}
                  </span>
                  <div className="text-right">
                    <p className="font-mono font-medium" data-testid={`text-breakeven-price-${idx}`}>
                      ${bePrice.toFixed(2)}
                    </p>
                    <p className={`text-xs ${isAbove ? "text-profit" : "text-loss"}`}>
                      {isAbove ? "+" : ""}{distance.toFixed(2)}% from current
                    </p>
                  </div>
                </div>
              );
              })}
            </div>
          </div>
        )}

        {breakevenPrices.length > 0 && <Separator />}

        <div className="space-y-3">
          <div className="text-sm font-medium">Trade Management Levels</div>
          
          <div className="space-y-2">
            <div className="flex justify-between items-center p-3 bg-profit/10 border border-profit/20 rounded-md">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-profit" />
                <span className="text-sm">Profit Target</span>
              </div>
              <div className="text-right">
                <p className="font-mono font-medium text-profit" data-testid="text-profit-target">
                  ${profitTarget.toFixed(2)}
                </p>
                <p className="text-xs text-muted-foreground">
                  +{(((profitTarget - currentPrice) / currentPrice) * 100).toFixed(2)}%
                </p>
              </div>
            </div>

            <div className="flex justify-between items-center p-3 bg-muted/50 rounded-md">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-foreground" />
                <span className="text-sm">Current Price</span>
              </div>
              <p className="font-mono font-medium" data-testid="text-current-price">
                ${currentPrice.toFixed(2)}
              </p>
            </div>

            <div className="flex justify-between items-center p-3 bg-loss/10 border border-loss/20 rounded-md">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-loss" />
                <span className="text-sm">Stop Loss</span>
              </div>
              <div className="text-right">
                <p className="font-mono font-medium text-loss" data-testid="text-stop-loss">
                  ${stopLoss.toFixed(2)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {(((stopLoss - currentPrice) / currentPrice) * 100).toFixed(2)}%
                </p>
              </div>
            </div>
          </div>
        </div>

        <Separator />

        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <AlertTriangle className="h-4 w-4 text-warning" />
            Risk Metrics
          </div>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Risk/Reward Ratio</span>
              <span className="font-mono font-medium" data-testid="text-risk-reward">
                {!hasLoss 
                  ? "No Risk" 
                  : Number.isFinite(riskRewardRatio) && riskRewardRatio > 0 
                    ? `1:${riskRewardRatio.toFixed(2)}` 
                    : Number.isFinite(riskRewardRatio) && riskRewardRatio < 0
                      ? "Unfavorable"
                      : "1:Unlimited"}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Delta Exposure</span>
              <span className={`font-mono font-medium ${greeks.delta > 0 ? "text-profit" : "text-loss"}`} data-testid="text-delta-exposure">
                {greeks.delta > 0 ? "+" : ""}{greeks.delta.toFixed(4)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Theta Decay (Daily)</span>
              <span className="font-mono font-medium text-loss" data-testid="text-theta-decay">
                ${greeks.theta.toFixed(2)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Vega (IV Change)</span>
              <span className="font-mono font-medium" data-testid="text-vega">
                ${greeks.vega.toFixed(2)}/1%
              </span>
            </div>
          </div>
        </div>

        {riskLevel.level === "High" && (
          <>
            <Separator />
            <div className="p-3 bg-warning/10 border border-warning/20 rounded-md">
              <p className="text-xs text-foreground flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" />
                <span>
                  <strong>High Risk Strategy:</strong> This strategy has unfavorable risk/reward characteristics. 
                  Consider reducing position size or exploring alternative strategies.
                </span>
              </p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
