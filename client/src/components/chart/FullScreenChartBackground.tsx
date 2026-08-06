import { useMemo, useCallback, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { cn } from "@/lib/utils";
import { RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChartDataPoint {
  time: string;
  timestamp: number;
  price: number;
  formattedTime: string;
}

type TimeRange = "1D" | "1W" | "1M" | "3M" | "YTD" | "1Y" | "ALL";

interface FullScreenChartBackgroundProps {
  symbol?: string;
  timeRange?: TimeRange;
  isDimmed?: boolean;
  className?: string;
}

const timeRangeToPeriod: Record<TimeRange, string> = {
  "1D": "1d",
  "1W": "5d",
  "1M": "1mo",
  "3M": "3mo",
  "YTD": "ytd",
  "1Y": "1y",
  "ALL": "5y",
};

export function FullScreenChartBackground({
  symbol = "SPY",
  timeRange = "1D",
  isDimmed = false,
  className,
}: FullScreenChartBackgroundProps) {
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);

  const isIntraday = timeRange === "1D";
  const period = timeRangeToPeriod[timeRange];

  const { data: intradayResult, isLoading: isLoadingIntraday, isError: isErrorIntraday, refetch: refetchIntraday, isFetching: isFetchingIntraday } = useQuery<{ data: { time: string; price: number }[]; source: 'alpaca' | 'cache' | 'unavailable' }>({
    queryKey: ["/api/market/intraday", symbol],
    refetchInterval: 60000, // Refresh every 1 minute to respect rate limits
    staleTime: 55000, // Consider stale after 55 seconds
    enabled: isIntraday,
    retry: 2,
  });

  const intradayData = intradayResult?.data;
  const intradaySource = intradayResult?.source;

  const { data: historicalData, isLoading: isLoadingHistorical, isError: isErrorHistorical, refetch: refetchHistorical, isFetching: isFetchingHistorical } = useQuery<{ time: string; price: number }[]>({
    queryKey: ["/api/market/historical", symbol, period],
    enabled: !isIntraday,
    staleTime: 60000,
    refetchInterval: 60000, // 1 minute refresh
    retry: 2,
  });

  const { data: quoteData, dataUpdatedAt, refetch: refetchQuote, isFetching: isFetchingQuote } = useQuery<{
    symbol: string;
    price: number;
    change: number;
    changePercent: number;
  }>({
    queryKey: ["/api/market/quote", symbol],
    refetchInterval: 60000, // Refresh every 1 minute to respect rate limits
    staleTime: 55000, // Consider stale after 55 seconds
  });

  const isFetching = isFetchingIntraday || isFetchingHistorical || isFetchingQuote;

  const handleManualRefresh = useCallback(() => {
    if (isIntraday) {
      refetchIntraday();
    } else {
      refetchHistorical();
    }
    refetchQuote();
  }, [isIntraday, refetchIntraday, refetchHistorical, refetchQuote]);

  useEffect(() => {
    const rawData = isIntraday ? intradayData : historicalData;
    
    if (rawData && rawData.length > 0) {
      const formattedData = rawData.map((point, index) => {
        const date = new Date(point.time);
        let formattedTime: string;
        
        if (isIntraday) {
          formattedTime = date.toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
          });
        } else if (timeRange === "1W") {
          formattedTime = date.toLocaleDateString("en-US", {
            weekday: "short",
          });
        } else if (timeRange === "1M" || timeRange === "3M") {
          formattedTime = date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          });
        } else {
          formattedTime = date.toLocaleDateString("en-US", {
            month: "short",
            year: "2-digit",
          });
        }
        
        return {
          time: point.time,
          timestamp: index,
          price: point.price,
          formattedTime,
        };
      });
      setChartData(formattedData);
    }
  }, [intradayData, historicalData, isIntraday, timeRange]);

  const isPositive = useMemo(() => {
    if (quoteData?.change !== undefined) {
      return quoteData.change >= 0;
    }
    if (chartData.length >= 2) {
      return chartData[chartData.length - 1].price >= chartData[0].price;
    }
    return true;
  }, [quoteData, chartData]);

  const chartColor = isPositive ? "hsl(var(--profit))" : "hsl(var(--loss))";
  const gradientId = `chartGradient-${symbol}`;

  const { minPrice, maxPrice } = useMemo(() => {
    if (chartData.length === 0) {
      return { minPrice: 0, maxPrice: 100 };
    }
    const prices = chartData.map((d) => d.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const padding = (max - min) * 0.1;
    return {
      minPrice: min - padding,
      maxPrice: max + padding,
    };
  }, [chartData]);

  const formatPrice = useCallback((value: number) => {
    return `$${value.toFixed(2)}`;
  }, []);

  const isLoading = isIntraday ? isLoadingIntraday : isLoadingHistorical;
  const isError = isIntraday ? isErrorIntraday : isErrorHistorical;
  const refetch = isIntraday ? refetchIntraday : refetchHistorical;

  if (chartData.length === 0) {
    return (
      <div
        className={cn(
          "fixed inset-0 z-[1] bg-background transition-opacity duration-300",
          isDimmed && "opacity-40",
          className
        )}
        data-testid="chart-background-empty"
      >
        <div className="flex items-center justify-center h-full">
          <div className="text-center text-muted-foreground">
            {isLoading ? (
              <>
                <RefreshCw className="h-8 w-8 mx-auto mb-3 animate-spin text-primary/60" />
                <div className="text-lg font-medium mb-2">Loading {symbol} chart...</div>
                <div className="text-sm">Connecting to market data</div>
              </>
            ) : isError ? (
              <>
                <AlertTriangle className="h-8 w-8 mx-auto mb-3 text-amber-500" />
                <div className="text-lg font-medium mb-2">Unable to load {symbol} chart</div>
                <div className="text-sm mb-4">Market data temporarily unavailable</div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetch()}
                  data-testid="button-retry-chart"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry
                </Button>
              </>
            ) : (
              <>
                <div className="text-lg font-medium mb-2">No data for {symbol}</div>
                <div className="text-sm mb-4">Market may be closed</div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetch()}
                  data-testid="button-retry-chart"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "fixed inset-0 z-[1] transition-opacity duration-300",
        isDimmed && "opacity-40",
        className
      )}
      data-testid="chart-background"
    >
      {/* Controls row: Refresh button (right) */}
      <div className="absolute top-4 left-4 right-4 z-10 flex items-center justify-between">
        <div />
        <Button
          variant="ghost"
          size="sm"
          onClick={handleManualRefresh}
          disabled={isFetching}
          className="glass-header text-xs gap-1.5"
          data-testid="button-refresh-chart"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
          {isFetching ? "Updating..." : "Refresh"}
        </Button>
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={chartData}
          margin={{ top: 80, right: 0, left: 0, bottom: 220 }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={chartColor} stopOpacity={0.3} />
              <stop offset="50%" stopColor={chartColor} stopOpacity={0.1} />
              <stop offset="100%" stopColor={chartColor} stopOpacity={0} />
            </linearGradient>
          </defs>
          
          <XAxis
            dataKey="formattedTime"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            interval="preserveStartEnd"
            minTickGap={60}
          />
          
          <YAxis
            domain={[minPrice, maxPrice]}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
            tickFormatter={formatPrice}
            orientation="right"
            width={70}
          />
          
          <Tooltip
            content={({ active, payload }) => {
              if (active && payload && payload.length) {
                const data = payload[0].payload as ChartDataPoint;
                return (
                  <div className="glass-header rounded-lg px-3 py-2">
                    <div className="text-xs text-muted-foreground">{data.formattedTime}</div>
                    <div className="text-sm font-mono font-medium">
                      {formatPrice(data.price)}
                    </div>
                  </div>
                );
              }
              return null;
            }}
          />
          
          <Area
            type="monotone"
            dataKey="price"
            stroke={chartColor}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            className={isPositive ? "chart-glow-profit" : "chart-glow-loss"}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
