import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface GreeksDisplayProps {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
}

export function GreeksDisplay({ delta, gamma, theta, vega, rho }: GreeksDisplayProps) {
  const greeks = [
    {
      symbol: "Δ",
      name: "Delta",
      value: delta,
      description: "Price sensitivity",
      range: [-1, 1] as [number, number],
      color: delta > 0 ? "text-profit" : "text-loss",
    },
    {
      symbol: "Γ",
      name: "Gamma",
      value: gamma,
      description: "Delta change rate",
      range: [0, 0.1] as [number, number],
      color: "text-chart-3",
    },
    {
      symbol: "Θ",
      name: "Theta",
      value: theta,
      description: "Time decay",
      range: [-1, 0] as [number, number],
      color: "text-loss",
    },
    {
      symbol: "ν",
      name: "Vega",
      value: vega,
      description: "Volatility sensitivity",
      range: [0, 1] as [number, number],
      color: "text-chart-4",
    },
    {
      symbol: "ρ",
      name: "Rho",
      value: rho,
      description: "Interest rate sensitivity",
      range: [-0.5, 0.5] as [number, number],
      color: "text-chart-5",
    },
  ];

  const normalizeValue = (value: number, range: [number, number]) => {
    const [min, max] = range;
    return ((value - min) / (max - min)) * 100;
  };

  return (
    <Card data-testid="card-greeks">
      <CardHeader>
        <CardTitle className="text-xl">Greeks Analysis</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {greeks.map((greek) => (
          <div key={greek.name} className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`text-2xl font-mono ${greek.color}`}>
                  {greek.symbol}
                </span>
                <div>
                  <p className="text-sm font-medium">{greek.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {greek.description}
                  </p>
                </div>
              </div>
              <span
                className={`text-lg font-mono font-medium ${greek.color}`}
                data-testid={`text-greek-${greek.name.toLowerCase()}`}
              >
                {greek.value.toFixed(4)}
              </span>
            </div>
            <Progress
              value={normalizeValue(greek.value, greek.range)}
              className="h-1"
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
