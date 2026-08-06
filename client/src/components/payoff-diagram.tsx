import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface PayoffPoint {
  underlyingPrice: number;
  profitLoss: number;
}

interface PayoffDiagramProps {
  data: PayoffPoint[];
  currentPrice?: number;
  breakeven?: number[];
  maxProfit?: number;
  maxLoss?: number;
  stopLossPercent?: number;
  profitTargetPercent?: number;
}

export function PayoffDiagram({
  data,
  currentPrice: providedCurrentPrice,
  breakeven = [],
  maxProfit,
  maxLoss,
  stopLossPercent,
  profitTargetPercent,
}: PayoffDiagramProps) {
  const formatCurrency = (value: number) => {
    return `$${value.toFixed(0)}`;
  };

  const formatPrice = (value: number) => {
    return `$${value.toFixed(2)}`;
  };

  const currentPrice = providedCurrentPrice ?? 
    (data.length > 0 ? data[Math.floor(data.length / 2)].underlyingPrice : 0);

  const stopLossPrice = stopLossPercent 
    ? currentPrice * (1 - stopLossPercent / 100) 
    : undefined;
  
  const profitTargetPrice = profitTargetPercent 
    ? currentPrice * (1 + profitTargetPercent / 100) 
    : undefined;

  return (
    <Card data-testid="card-payoff-diagram">
      <CardHeader>
        <CardTitle className="text-xl">Payoff Diagram</CardTitle>
        <div className="flex gap-4 text-sm">
          {maxProfit !== undefined && (
            <div>
              <span className="text-muted-foreground">Max Profit: </span>
              <span className="font-mono font-medium text-profit" data-testid="text-max-profit">
                {formatCurrency(maxProfit)}
              </span>
            </div>
          )}
          {maxLoss !== undefined && (
            <div>
              <span className="text-muted-foreground">Max Loss: </span>
              <span className="font-mono font-medium text-loss" data-testid="text-max-loss">
                {formatCurrency(maxLoss)}
              </span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis
              dataKey="underlyingPrice"
              tickFormatter={formatPrice}
              className="text-xs"
              tick={{ fill: "hsl(var(--muted-foreground))" }}
            />
            <YAxis
              tickFormatter={formatCurrency}
              className="text-xs"
              tick={{ fill: "hsl(var(--muted-foreground))" }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--popover))",
                border: "1px solid hsl(var(--popover-border))",
                borderRadius: "6px",
              }}
              formatter={(value: number) => [formatCurrency(value), "P/L"]}
              labelFormatter={(label: number) => `Price: ${formatPrice(label)}`}
            />
            <Legend />
            <ReferenceLine
              y={0}
              stroke="hsl(var(--muted-foreground))"
              strokeDasharray="3 3"
              strokeWidth={2}
            />
            <ReferenceLine
              x={currentPrice}
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              label={{
                value: "Current",
                position: "top",
                fill: "hsl(var(--primary))",
              }}
            />
            {breakeven.map((be, idx) => (
              <ReferenceLine
                key={idx}
                x={be}
                stroke="hsl(var(--chart-3))"
                strokeDasharray="5 5"
                label={{
                  value: "BE",
                  position: "top",
                  fill: "hsl(var(--chart-3))",
                }}
              />
            ))}
            {stopLossPrice && (
              <ReferenceLine
                x={stopLossPrice}
                stroke="hsl(var(--destructive))"
                strokeWidth={2}
                strokeDasharray="4 4"
                label={{
                  value: "Stop Loss",
                  position: "top",
                  fill: "hsl(var(--destructive))",
                  fontSize: 12,
                }}
              />
            )}
            {profitTargetPrice && (
              <ReferenceLine
                x={profitTargetPrice}
                stroke="hsl(var(--chart-2))"
                strokeWidth={2}
                strokeDasharray="4 4"
                label={{
                  value: "Target",
                  position: "top",
                  fill: "hsl(var(--chart-2))",
                  fontSize: 12,
                }}
              />
            )}
            <Line
              type="monotone"
              dataKey="profitLoss"
              stroke="hsl(var(--chart-1))"
              strokeWidth={3}
              dot={false}
              name="Profit/Loss"
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
