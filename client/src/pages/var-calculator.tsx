import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
  PieChart,
  Pie,
  Legend,
} from "recharts";
import {
  Shield,
  AlertTriangle,
  TrendingDown,
  Percent,
  DollarSign,
  Plus,
  Trash2,
  Calculator,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";

const positionSchema = z.object({
  symbol: z.string().min(1),
  optionType: z.enum(["call", "put"]),
  action: z.enum(["long", "short"]),
  strike: z.number().positive(),
  expiration: z.string(),
  entryPrice: z.number().positive(),
  quantity: z.number().int().positive(),
  currentIV: z.number().optional(),
});

const varFormSchema = z.object({
  positions: z.array(positionSchema).min(1, "At least one position is required"),
  confidenceLevel: z.number().min(0.9).max(0.999),
  timeHorizon: z.number().int().positive().max(30),
  method: z.enum(["historical", "parametric", "monteCarlo"]),
});

type VaRForm = z.infer<typeof varFormSchema>;

interface VaRResult {
  portfolioValue: number;
  var: {
    absolute: number;
    percentage: number;
    confidenceLevel: number;
  };
  expectedShortfall: {
    absolute: number;
    percentage: number;
  };
  componentVaR: Array<{
    symbol: string;
    strike: number;
    optionType: string;
    var: number;
    contribution: number;
    marginalVar: number;
  }>;
  stressTests: Array<{
    name: string;
    description: string;
    portfolioChange: number;
    percentChange: number;
  }>;
  method: string;
  timeHorizon: number;
}

import { useSeo } from "@/components/seo";

export default function VaRCalculator() {
  useSeo({ path: "/var-calculator" });
  const { toast } = useToast();
  const [result, setResult] = useState<VaRResult | null>(null);

  const form = useForm<VaRForm>({
    resolver: zodResolver(varFormSchema),
    defaultValues: {
      positions: [
        {
          symbol: "SPY",
          optionType: "call",
          action: "long",
          strike: 600,
          expiration: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          entryPrice: 15.0,
          quantity: 1,
          currentIV: 0.25,
        },
      ],
      confidenceLevel: 0.95,
      timeHorizon: 1,
      method: "parametric",
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "positions",
  });

  const varMutation = useMutation({
    mutationFn: async (data: VaRForm) => {
      const transformedPositions = data.positions.map(pos => ({
        symbol: pos.symbol,
        positionType: "option" as const,
        quantity: pos.quantity * (pos.action === "short" ? -1 : 1),
        currentValue: pos.entryPrice * pos.quantity * 100,
        optionDetails: {
          optionType: pos.optionType,
          strike: pos.strike,
          expiration: pos.expiration,
          iv: pos.currentIV || 0.25,
        },
      }));
      
      const payload = {
        positions: transformedPositions,
        params: {
          confidenceLevel: data.confidenceLevel,
          timeHorizonDays: data.timeHorizon,
          method: data.method === "monteCarlo" ? "montecarlo" : data.method,
        },
      };
      
      const response = await apiRequest("POST", "/api/pricing/risk/var", payload);
      return await response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setResult(data.data);
        toast({
          title: "VaR Calculated",
          description: `${(data.data.var.confidenceLevel * 100).toFixed(0)}% VaR: ${formatCurrency(data.data.var.absolute)}`,
        });
      } else {
        throw new Error(data.error);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Calculation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleCalculate = (data: VaRForm) => {
    varMutation.mutate(data);
  };

  const addPosition = () => {
    append({
      symbol: "QQQ",
      optionType: "call",
      action: "long",
      strike: 500,
      expiration: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      entryPrice: 10.0,
      quantity: 1,
      currentIV: 0.25,
    });
  };

  const formatCurrency = (value: number) => {
    const absValue = Math.abs(value);
    const sign = value >= 0 ? "" : "-";
    return `${sign}$${absValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatPercent = (value: number) => {
    const sign = value >= 0 ? "+" : "";
    return `${sign}${(value * 100).toFixed(2)}%`;
  };

  return (
    <div className="container mx-auto p-4 space-y-6 max-w-7xl" data-testid="page-var-calculator">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-destructive/10">
          <Shield className="h-6 w-6 text-destructive" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Value at Risk Calculator</h1>
          <p className="text-sm text-muted-foreground">
            Portfolio risk assessment with historical, parametric, and Monte Carlo VaR
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1" data-testid="card-var-config">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Portfolio Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
              {fields.map((field, index) => (
                <div
                  key={field.id}
                  className="p-3 rounded-lg border bg-muted/30 space-y-3"
                  data-testid={`position-${index}`}
                >
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="text-xs">
                      Position {index + 1}
                    </Badge>
                    {fields.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => remove(index)}
                        data-testid={`button-remove-position-${index}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      {...form.register(`positions.${index}.symbol`)}
                      placeholder="Symbol"
                      className="h-8 text-base md:text-sm"
                      data-testid={`input-symbol-${index}`}
                    />
                    <Select
                      value={form.watch(`positions.${index}.optionType`)}
                      onValueChange={(v) =>
                        form.setValue(`positions.${index}.optionType`, v as "call" | "put")
                      }
                    >
                      <SelectTrigger className="h-8 text-base md:text-sm" data-testid={`select-option-type-${index}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="call">Call</SelectItem>
                        <SelectItem value="put">Put</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Select
                      value={form.watch(`positions.${index}.action`)}
                      onValueChange={(v) =>
                        form.setValue(`positions.${index}.action`, v as "long" | "short")
                      }
                    >
                      <SelectTrigger className="h-8 text-base md:text-sm" data-testid={`select-action-${index}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="long">Long</SelectItem>
                        <SelectItem value="short">Short</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      {...form.register(`positions.${index}.strike`, { valueAsNumber: true })}
                      placeholder="Strike"
                      className="h-8 text-base md:text-sm"
                      data-testid={`input-strike-${index}`}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      type="number"
                      step="0.01"
                      {...form.register(`positions.${index}.entryPrice`, { valueAsNumber: true })}
                      placeholder="Price"
                      className="h-8 text-base md:text-sm"
                      data-testid={`input-price-${index}`}
                    />
                    <Input
                      type="number"
                      {...form.register(`positions.${index}.quantity`, { valueAsNumber: true })}
                      placeholder="Qty"
                      className="h-8 text-base md:text-sm"
                      data-testid={`input-qty-${index}`}
                    />
                  </div>

                  <Input
                    type="date"
                    {...form.register(`positions.${index}.expiration`)}
                    className="h-8 text-base md:text-sm"
                    data-testid={`input-expiration-${index}`}
                  />
                </div>
              ))}
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={addPosition}
              className="w-full"
              data-testid="button-add-position"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Position
            </Button>

            <Separator />

            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Confidence Level</Label>
                <Select
                  value={String(form.watch("confidenceLevel"))}
                  onValueChange={(v) => form.setValue("confidenceLevel", parseFloat(v))}
                >
                  <SelectTrigger data-testid="select-confidence">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0.90">90%</SelectItem>
                    <SelectItem value="0.95">95%</SelectItem>
                    <SelectItem value="0.99">99%</SelectItem>
                    <SelectItem value="0.995">99.5%</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Time Horizon (days)</Label>
                <Select
                  value={String(form.watch("timeHorizon"))}
                  onValueChange={(v) => form.setValue("timeHorizon", parseInt(v))}
                >
                  <SelectTrigger data-testid="select-time-horizon">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 Day</SelectItem>
                    <SelectItem value="5">5 Days (1 Week)</SelectItem>
                    <SelectItem value="10">10 Days</SelectItem>
                    <SelectItem value="21">21 Days (1 Month)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>VaR Method</Label>
                <Select
                  value={form.watch("method")}
                  onValueChange={(v) =>
                    form.setValue("method", v as "historical" | "parametric" | "monteCarlo")
                  }
                >
                  <SelectTrigger data-testid="select-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="parametric">Parametric (Delta-Normal)</SelectItem>
                    <SelectItem value="historical">Historical Simulation</SelectItem>
                    <SelectItem value="monteCarlo">Monte Carlo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button
              onClick={form.handleSubmit(handleCalculate)}
              className="w-full"
              disabled={varMutation.isPending}
              data-testid="button-calculate-var"
            >
              {varMutation.isPending ? (
                <>
                  <Activity className="h-4 w-4 mr-2 animate-spin" />
                  Calculating...
                </>
              ) : (
                <>
                  <Shield className="h-4 w-4 mr-2" />
                  Calculate VaR
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        <div className="lg:col-span-2 space-y-6">
          {result ? (
            <VaRResults result={result} formatCurrency={formatCurrency} formatPercent={formatPercent} />
          ) : (
            <Card className="h-full flex items-center justify-center">
              <CardContent className="text-center py-16">
                <div className="p-4 rounded-full bg-muted inline-block mb-4">
                  <Shield className="h-8 w-8 text-muted-foreground" />
                </div>
                <h3 className="font-medium mb-2">Configure Portfolio & Calculate VaR</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  Add your option positions and select parameters to calculate Value at Risk,
                  Expected Shortfall, and run stress tests
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function VaRResults({
  result,
  formatCurrency,
  formatPercent,
}: {
  result: VaRResult;
  formatCurrency: (v: number) => string;
  formatPercent: (v: number) => string;
}) {
  const methodLabels: Record<string, string> = {
    historical: "Historical Simulation",
    parametric: "Parametric (Delta-Normal)",
    monteCarlo: "Monte Carlo Simulation",
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card/50" data-testid="stat-portfolio-value">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Portfolio Value</span>
            </div>
            <p className="font-mono text-lg font-semibold">
              {formatCurrency(result.portfolioValue)}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-destructive/5 border-destructive/20" data-testid="stat-var">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span className="text-xs text-muted-foreground">
                {(result.var.confidenceLevel * 100).toFixed(0)}% VaR
              </span>
            </div>
            <p className="font-mono text-lg font-semibold text-destructive">
              {formatCurrency(result.var.absolute)}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatPercent(-result.var.percentage)}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-destructive/5 border-destructive/20" data-testid="stat-es">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="h-4 w-4 text-destructive" />
              <span className="text-xs text-muted-foreground">Expected Shortfall</span>
            </div>
            <p className="font-mono text-lg font-semibold text-destructive">
              {formatCurrency(result.expectedShortfall.absolute)}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatPercent(-result.expectedShortfall.percentage)}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card/50" data-testid="stat-method">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Calculator className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Method</span>
            </div>
            <p className="text-sm font-medium">{methodLabels[result.method] || result.method}</p>
            <p className="text-xs text-muted-foreground">{result.timeHorizon} day horizon</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card data-testid="card-component-var">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Component VaR</CardTitle>
            <CardDescription>Contribution of each position to total VaR</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={result.componentVaR}
                    dataKey="contribution"
                    nameKey="symbol"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={2}
                    label={({ symbol, contribution }) =>
                      `${symbol}: ${(contribution * 100).toFixed(1)}%`
                    }
                    labelLine={false}
                  >
                    {result.componentVaR.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={`hsl(${(index * 360) / result.componentVaR.length}, 70%, 50%)`}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => [
                      `${(value * 100).toFixed(1)}%`,
                      "Contribution",
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="space-y-2 mt-4">
              {result.componentVaR.map((comp, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{
                        backgroundColor: `hsl(${(idx * 360) / result.componentVaR.length}, 70%, 50%)`,
                      }}
                    />
                    <span>
                      {comp.symbol} ${comp.strike} {comp.optionType}
                    </span>
                  </div>
                  <span className="font-mono text-destructive">{formatCurrency(comp.var)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-stress-tests">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Stress Test Results</CardTitle>
            <CardDescription>Portfolio performance under extreme scenarios</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={result.stressTests}
                  layout="vertical"
                  margin={{ left: 80 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    type="number"
                    tickFormatter={(v) => formatCurrency(v)}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    tick={{ fontSize: 11 }}
                    width={80}
                  />
                  <Tooltip
                    formatter={(value: number) => [formatCurrency(value), "P/L Impact"]}
                  />
                  <ReferenceLine x={0} stroke="hsl(var(--muted-foreground))" />
                  <Bar dataKey="portfolioChange" radius={[0, 4, 4, 0]}>
                    {result.stressTests.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={
                          entry.portfolioChange >= 0
                            ? "hsl(var(--profit))"
                            : "hsl(var(--loss))"
                        }
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="space-y-2 mt-4 max-h-32 overflow-y-auto">
              {result.stressTests.map((test, idx) => (
                <div key={idx} className="flex items-center justify-between text-sm">
                  <div>
                    <span className="font-medium">{test.name}</span>
                    <p className="text-xs text-muted-foreground">{test.description}</p>
                  </div>
                  <span
                    className={cn(
                      "font-mono",
                      test.portfolioChange >= 0 ? "text-profit" : "text-loss"
                    )}
                  >
                    {formatCurrency(test.portfolioChange)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
