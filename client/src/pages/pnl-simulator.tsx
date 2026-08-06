import { useState } from "react";
import { useForm } from "react-hook-form";
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
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  ReferenceLine,
  Area,
  AreaChart,
} from "recharts";
import {
  Activity,
  TrendingUp,
  TrendingDown,
  Target,
  Zap,
  BarChart3,
  Percent,
  DollarSign,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const simulationSchema = z.object({
  symbol: z.string().min(1, "Symbol is required"),
  optionType: z.enum(["call", "put"]),
  action: z.enum(["long", "short"]),
  strike: z.number().positive("Strike must be positive"),
  expiration: z.string().min(1, "Expiration is required"),
  entryPrice: z.number().positive("Entry price must be positive"),
  quantity: z.number().int().positive("Quantity must be positive"),
  currentIV: z.number().min(0.01).max(5).optional(),
  timeHorizonDays: z.number().int().positive().max(365),
  numSimulations: z.number().int().min(1000).max(100000).optional(),
});

type SimulationForm = z.infer<typeof simulationSchema>;

interface MonteCarloResult {
  symbol: string;
  currentPrice: number;
  timeHorizonDays: number;
  numSimulations: number;
  statistics: {
    meanPnL: number;
    medianPnL: number;
    stdDevPnL: number;
    minPnL: number;
    maxPnL: number;
    skewness: number;
    kurtosis: number;
  };
  percentiles: {
    p1: number;
    p5: number;
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
    p95: number;
    p99: number;
  };
  probabilities: {
    profitProbability: number;
    lossProbability: number;
    breakEvenProbability: number;
  };
  distribution: Array<{ pnl: number; frequency: number }>;
  priceDistribution: Array<{ price: number; probability: number }>;
}

interface WhatIfResult {
  scenarios: Array<{
    name: string;
    description: string;
    pnl: number;
    percentChange: number;
    newOptionValue: number;
  }>;
  position: {
    symbol: string;
    optionType: string;
    strike: number;
    currentValue: number;
  };
}

const POPULAR_SYMBOLS = ["SPY", "QQQ", "AAPL", "TSLA", "NVDA", "MSFT", "AMZN", "META"];

import { useSeo } from "@/components/seo";

export default function PnLSimulator() {
  useSeo({ path: "/pnl-simulator" });
  const { toast } = useToast();
  const [monteCarloResult, setMonteCarloResult] = useState<MonteCarloResult | null>(null);
  const [whatIfResult, setWhatIfResult] = useState<WhatIfResult | null>(null);
  const [activeTab, setActiveTab] = useState("monte-carlo");

  const form = useForm<SimulationForm>({
    resolver: zodResolver(simulationSchema),
    defaultValues: {
      symbol: "SPY",
      optionType: "call",
      action: "long",
      strike: 600,
      expiration: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      entryPrice: 15.0,
      quantity: 1,
      currentIV: 0.25,
      timeHorizonDays: 7,
      numSimulations: 10000,
    },
  });

  const monteCarloMutation = useMutation({
    mutationFn: async (data: SimulationForm) => {
      const quoteResponse = await fetch(`/api/market/quote/${data.symbol}`);
      const quoteData = await quoteResponse.json();
      const currentPrice = quoteData?.price || data.strike * 0.95;
      
      const payload = {
        position: {
          symbol: data.symbol,
          optionType: data.optionType,
          action: data.action,
          strike: data.strike,
          expiration: data.expiration,
          entryPrice: data.entryPrice,
          quantity: data.quantity,
          currentIV: data.currentIV,
        },
        currentPrice,
        params: {
          timeHorizonDays: data.timeHorizonDays,
          numSimulations: data.numSimulations || 10000,
        },
      };
      const response = await apiRequest("POST", "/api/pricing/simulation/montecarlo", payload);
      return await response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setMonteCarloResult(data.data);
        toast({
          title: "Simulation Complete",
          description: `Ran ${data.data.numSimulations.toLocaleString()} simulations`,
        });
      } else {
        throw new Error(data.error);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Simulation Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const whatIfMutation = useMutation({
    mutationFn: async (data: SimulationForm) => {
      const quoteResponse = await fetch(`/api/market/quote/${data.symbol}`);
      const quoteData = await quoteResponse.json();
      const currentPrice = quoteData?.price || data.strike * 0.95;
      
      const payload = {
        position: {
          symbol: data.symbol,
          optionType: data.optionType,
          action: data.action,
          strike: data.strike,
          expiration: data.expiration,
          entryPrice: data.entryPrice,
          quantity: data.quantity,
          currentIV: data.currentIV,
        },
        currentPrice,
      };
      const response = await apiRequest("POST", "/api/pricing/simulation/whatif", payload);
      return await response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setWhatIfResult(data.data);
      } else {
        throw new Error(data.error);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "What-If Analysis Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleRunSimulation = (data: SimulationForm) => {
    if (activeTab === "monte-carlo") {
      monteCarloMutation.mutate(data);
    } else {
      whatIfMutation.mutate(data);
    }
  };

  const formatCurrency = (value: number) => {
    const absValue = Math.abs(value);
    const sign = value >= 0 ? "" : "-";
    return `${sign}$${absValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatPercent = (value: number) => {
    const sign = value >= 0 ? "+" : "";
    return `${sign}${(value * 100).toFixed(1)}%`;
  };

  return (
    <div className="container mx-auto p-4 space-y-6 max-w-7xl" data-testid="page-pnl-simulator">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Activity className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">P/L Simulator</h1>
          <p className="text-sm text-muted-foreground">
            Monte Carlo simulation and what-if scenario analysis
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1" data-testid="card-simulation-config">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Position Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Symbol</Label>
              <div className="flex gap-2 flex-wrap mb-2">
                {POPULAR_SYMBOLS.slice(0, 4).map((sym) => (
                  <Badge
                    key={sym}
                    variant={form.watch("symbol") === sym ? "default" : "outline"}
                    className="cursor-pointer toggle-elevate"
                    onClick={() => form.setValue("symbol", sym)}
                    data-testid={`badge-symbol-${sym}`}
                  >
                    {sym}
                  </Badge>
                ))}
              </div>
              <Input
                {...form.register("symbol")}
                placeholder="Enter symbol"
                data-testid="input-symbol"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Option Type</Label>
                <Select
                  value={form.watch("optionType")}
                  onValueChange={(v) => form.setValue("optionType", v as "call" | "put")}
                >
                  <SelectTrigger data-testid="select-option-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="call">Call</SelectItem>
                    <SelectItem value="put">Put</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Action</Label>
                <Select
                  value={form.watch("action")}
                  onValueChange={(v) => form.setValue("action", v as "long" | "short")}
                >
                  <SelectTrigger data-testid="select-action">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="long">Long</SelectItem>
                    <SelectItem value="short">Short</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Strike Price</Label>
                <Input
                  type="number"
                  step="0.5"
                  {...form.register("strike", { valueAsNumber: true })}
                  data-testid="input-strike"
                />
              </div>

              <div className="space-y-2">
                <Label>Entry Price</Label>
                <Input
                  type="number"
                  step="0.01"
                  {...form.register("entryPrice", { valueAsNumber: true })}
                  data-testid="input-entry-price"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  {...form.register("quantity", { valueAsNumber: true })}
                  data-testid="input-quantity"
                />
              </div>

              <div className="space-y-2">
                <Label>IV (optional)</Label>
                <Input
                  type="number"
                  step="0.01"
                  {...form.register("currentIV", { valueAsNumber: true })}
                  placeholder="0.25"
                  data-testid="input-iv"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Expiration Date</Label>
              <Input
                type="date"
                {...form.register("expiration")}
                data-testid="input-expiration"
              />
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>Time Horizon (days)</Label>
              <Input
                type="number"
                {...form.register("timeHorizonDays", { valueAsNumber: true })}
                data-testid="input-time-horizon"
              />
            </div>

            <div className="space-y-2">
              <Label>Simulations</Label>
              <Select
                value={String(form.watch("numSimulations") || 10000)}
                onValueChange={(v) => form.setValue("numSimulations", parseInt(v))}
              >
                <SelectTrigger data-testid="select-simulations">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1000">1,000</SelectItem>
                  <SelectItem value="5000">5,000</SelectItem>
                  <SelectItem value="10000">10,000</SelectItem>
                  <SelectItem value="50000">50,000</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={form.handleSubmit(handleRunSimulation)}
              className="w-full"
              disabled={monteCarloMutation.isPending || whatIfMutation.isPending}
              data-testid="button-run-simulation"
            >
              {monteCarloMutation.isPending || whatIfMutation.isPending ? (
                <>
                  <Activity className="h-4 w-4 mr-2 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4 mr-2" />
                  Run {activeTab === "monte-carlo" ? "Monte Carlo" : "What-If"}
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2" data-testid="card-simulation-results">
          <CardHeader>
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="monte-carlo" data-testid="tab-monte-carlo">
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Monte Carlo
                </TabsTrigger>
                <TabsTrigger value="what-if" data-testid="tab-what-if">
                  <Target className="h-4 w-4 mr-2" />
                  What-If Scenarios
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent>
            {activeTab === "monte-carlo" ? (
              monteCarloResult ? (
                <MonteCarloResults result={monteCarloResult} formatCurrency={formatCurrency} formatPercent={formatPercent} />
              ) : (
                <EmptyState
                  icon={BarChart3}
                  title="Run Monte Carlo Simulation"
                  description="Configure your position and run the simulation to see probability distributions and risk metrics"
                />
              )
            ) : whatIfResult ? (
              <WhatIfResults result={whatIfResult} formatCurrency={formatCurrency} formatPercent={formatPercent} />
            ) : (
              <EmptyState
                icon={Target}
                title="Run What-If Analysis"
                description="See how your position performs under 14 different market scenarios including price moves, IV changes, and time decay"
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MonteCarloResults({
  result,
  formatCurrency,
  formatPercent,
}: {
  result: MonteCarloResult;
  formatCurrency: (v: number) => string;
  formatPercent: (v: number) => string;
}) {
  const { statistics, percentiles, probabilities, distribution } = result;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Expected P/L"
          value={formatCurrency(statistics.meanPnL)}
          icon={DollarSign}
          isPositive={statistics.meanPnL >= 0}
        />
        <StatCard
          label="Profit Probability"
          value={formatPercent(probabilities.profitProbability)}
          icon={Percent}
          isPositive={probabilities.profitProbability >= 0.5}
        />
        <StatCard
          label="Std Deviation"
          value={formatCurrency(statistics.stdDevPnL)}
          icon={Activity}
        />
        <StatCard
          label="Max Drawdown"
          value={formatCurrency(statistics.minPnL)}
          icon={TrendingDown}
          isPositive={false}
        />
      </div>

      <Card data-testid="card-distribution-chart">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">P/L Distribution</CardTitle>
          <CardDescription>
            {result.numSimulations.toLocaleString()} simulations over {result.timeHorizonDays} days
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={distribution}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="pnl"
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  className="text-xs"
                />
                <YAxis
                  tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
                  className="text-xs"
                />
                <Tooltip
                  formatter={(value: number) => [`${(value * 100).toFixed(2)}%`, "Probability"]}
                  labelFormatter={(label) => formatCurrency(label as number)}
                />
                <ReferenceLine x={0} stroke="hsl(var(--muted-foreground))" strokeDasharray="5 5" />
                <Area
                  type="monotone"
                  dataKey="frequency"
                  stroke="hsl(var(--primary))"
                  fill="hsl(var(--primary) / 0.3)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card data-testid="card-percentiles">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Risk Percentiles</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {[
                { label: "1st (Worst case)", value: percentiles.p1 },
                { label: "5th (VaR 95%)", value: percentiles.p5 },
                { label: "25th", value: percentiles.p25 },
                { label: "50th (Median)", value: percentiles.p50 },
                { label: "75th", value: percentiles.p75 },
                { label: "95th", value: percentiles.p95 },
                { label: "99th (Best case)", value: percentiles.p99 },
              ].map((p) => (
                <div key={p.label} className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">{p.label}</span>
                  <span
                    className={cn(
                      "font-mono text-sm",
                      p.value >= 0 ? "text-profit" : "text-loss"
                    )}
                  >
                    {formatCurrency(p.value)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card data-testid="card-statistics">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Statistical Measures</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {[
                { label: "Mean P/L", value: formatCurrency(statistics.meanPnL) },
                { label: "Median P/L", value: formatCurrency(statistics.medianPnL) },
                { label: "Std Deviation", value: formatCurrency(statistics.stdDevPnL) },
                { label: "Min P/L", value: formatCurrency(statistics.minPnL) },
                { label: "Max P/L", value: formatCurrency(statistics.maxPnL) },
                { label: "Skewness", value: statistics.skewness.toFixed(3) },
                { label: "Kurtosis", value: statistics.kurtosis.toFixed(3) },
              ].map((stat) => (
                <div key={stat.label} className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">{stat.label}</span>
                  <span className="font-mono text-sm">{stat.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function WhatIfResults({
  result,
  formatCurrency,
  formatPercent,
}: {
  result: WhatIfResult;
  formatCurrency: (v: number) => string;
  formatPercent: (v: number) => string;
}) {
  const { scenarios, position } = result;

  const sortedScenarios = [...scenarios].sort((a, b) => b.pnl - a.pnl);
  const bestScenario = sortedScenarios[0];
  const worstScenario = sortedScenarios[sortedScenarios.length - 1];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Position Value"
          value={formatCurrency(position.currentValue)}
          icon={DollarSign}
        />
        <StatCard
          label="Best Scenario"
          value={formatCurrency(bestScenario?.pnl || 0)}
          icon={TrendingUp}
          isPositive={true}
          subtext={bestScenario?.name}
        />
        <StatCard
          label="Worst Scenario"
          value={formatCurrency(worstScenario?.pnl || 0)}
          icon={TrendingDown}
          isPositive={false}
          subtext={worstScenario?.name}
        />
        <StatCard
          label="Scenarios"
          value={String(scenarios.length)}
          icon={Target}
        />
      </div>

      <Card data-testid="card-scenario-chart">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Scenario Analysis</CardTitle>
          <CardDescription>
            P/L under different market conditions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={scenarios} layout="vertical" margin={{ left: 100 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" tickFormatter={(v) => formatCurrency(v)} />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  width={100}
                />
                <Tooltip
                  formatter={(value: number) => [formatCurrency(value), "P/L"]}
                  labelFormatter={(label) => label}
                />
                <ReferenceLine x={0} stroke="hsl(var(--muted-foreground))" />
                <Bar dataKey="pnl" radius={[0, 4, 4, 0]}>
                  {scenarios.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.pnl >= 0 ? "hsl(var(--profit))" : "hsl(var(--loss))"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-scenario-details">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Scenario Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {scenarios.map((scenario) => (
              <div
                key={scenario.name}
                className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                data-testid={`scenario-${scenario.name}`}
              >
                <div>
                  <p className="font-medium text-sm">{scenario.name}</p>
                  <p className="text-xs text-muted-foreground">{scenario.description}</p>
                </div>
                <div className="text-right">
                  <p
                    className={cn(
                      "font-mono font-medium",
                      scenario.pnl >= 0 ? "text-profit" : "text-loss"
                    )}
                  >
                    {formatCurrency(scenario.pnl)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    New Value: {formatCurrency(scenario.newOptionValue)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  isPositive,
  subtext,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  isPositive?: boolean;
  subtext?: string;
}) {
  return (
    <Card className="bg-card/50" data-testid={`stat-${label.toLowerCase().replace(/\s/g, "-")}`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        <p
          className={cn(
            "font-mono text-lg font-semibold",
            isPositive === true && "text-profit",
            isPositive === false && "text-loss"
          )}
        >
          {value}
        </p>
        {subtext && (
          <p className="text-xs text-muted-foreground mt-1 truncate">{subtext}</p>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="p-4 rounded-full bg-muted mb-4">
        <Icon className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="font-medium mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-md">{description}</p>
    </div>
  );
}
