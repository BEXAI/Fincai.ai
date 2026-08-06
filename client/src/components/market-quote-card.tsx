import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkline } from "@/components/ui/sparkline";
import { cn } from "@/lib/utils";

interface MarketQuoteCardProps {
  symbol: string;
  price?: number;
  change?: number;
  changePercent?: number;
  isLoading?: boolean;
  showSparkline?: boolean;
  sparklineData?: number[];
  compact?: boolean;
}

export function MarketQuoteCard({
  symbol,
  price,
  change,
  changePercent,
  isLoading,
  showSparkline = true,
  sparklineData = [],
  compact = false,
}: MarketQuoteCardProps) {
  const isPositive = (change ?? 0) > 0;
  const isNegative = (change ?? 0) < 0;

  if (isLoading) {
    return (
      <Card className={cn(compact && "p-2")}>
        <CardHeader className={cn(
          "flex flex-row items-center justify-between space-y-0 gap-2",
          compact ? "pb-1 pt-0 px-0" : "pb-2"
        )}>
          <CardTitle className="text-sm font-medium uppercase tracking-wide">
            {symbol}
          </CardTitle>
          <Skeleton className="h-4 w-12" />
        </CardHeader>
        <CardContent className={compact ? "p-0" : undefined}>
          <div className="flex items-center justify-between gap-2">
            <div>
              <Skeleton className="h-7 w-20 mb-1" />
              <Skeleton className="h-4 w-14" />
            </div>
            {showSparkline && <Skeleton className="h-5 w-14" />}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card 
      data-testid={`card-quote-${symbol}`}
      className={cn("hover-elevate cursor-pointer transition-colors", compact && "p-2")}
    >
      <CardHeader className={cn(
        "flex flex-row items-center justify-between space-y-0 gap-2",
        compact ? "pb-1 pt-0 px-0" : "pb-2"
      )}>
        <CardTitle className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
          {symbol}
        </CardTitle>
        <div className={cn(
          "flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium",
          isPositive && "text-profit bg-profit/10",
          isNegative && "text-loss bg-loss/10",
          !isPositive && !isNegative && "text-muted-foreground bg-muted/50"
        )}>
          {isPositive && <ArrowUp className="h-3 w-3" />}
          {isNegative && <ArrowDown className="h-3 w-3" />}
          {!isPositive && !isNegative && <Minus className="h-3 w-3" />}
          <span>{isPositive && "+"}{changePercent?.toFixed(2) ?? "0.00"}%</span>
        </div>
      </CardHeader>
      <CardContent className={compact ? "p-0" : undefined}>
        <div className="flex items-end justify-between gap-2">
          <div>
            <div 
              className="text-xl font-medium font-mono" 
              data-testid={`text-price-${symbol}`}
            >
              ${price?.toFixed(2) ?? "--"}
            </div>
            <p
              className={cn(
                "text-xs font-mono",
                isPositive ? "text-profit" : isNegative ? "text-loss" : "text-muted-foreground"
              )}
              data-testid={`text-change-${symbol}`}
            >
              {isPositive && "+"}
              {change?.toFixed(2) ?? "--"}
            </p>
          </div>
          {showSparkline && sparklineData.length > 0 && (
            <Sparkline 
              data={sparklineData} 
              width={56} 
              height={24} 
              positive={isPositive || (!isPositive && !isNegative)}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
