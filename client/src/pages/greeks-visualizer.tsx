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
import { ScrollArea } from "@/components/ui/scroll-area";
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
  Legend,
  ReferenceLine,
  Area,
  ComposedChart,
} from "recharts";
import {
  TrendingUp,
  Activity,
  Clock,
  Zap,
  Percent,
  BookOpen,
  ChevronRight,
  GraduationCap,
  Target,
} from "lucide-react";
import { cn } from "@/lib/utils";

const greekFormSchema = z.object({
  symbol: z.string().min(1, "Symbol is required"),
  optionType: z.enum(["call", "put"]),
  strike: z.number().positive(),
  expiration: z.string(),
  spotPrice: z.number().positive(),
  volatility: z.number().min(0.01).max(3),
  greek: z.enum(["delta", "gamma", "theta", "vega", "rho"]),
  variable: z.enum(["price", "time", "volatility"]),
});

type GreekForm = z.infer<typeof greekFormSchema>;

interface VisualizationResult {
  greek: string;
  variable: string;
  baseValue: number;
  data: Array<{
    x: number;
    value: number;
    label?: string;
  }>;
  education: {
    name: string;
    symbol: string;
    description: string;
    interpretation: string;
    tradingImplications: string[];
    keyInsights: string[];
  };
}

const GREEK_COLORS: Record<string, string> = {
  delta: "hsl(210, 100%, 50%)",
  gamma: "hsl(280, 100%, 60%)",
  theta: "hsl(45, 100%, 50%)",
  vega: "hsl(180, 100%, 45%)",
  rho: "hsl(120, 70%, 45%)",
};

const GREEK_DESCRIPTIONS: Record<string, { symbol: string; icon: React.ComponentType<{ className?: string }> }> = {
  delta: { symbol: "Δ", icon: TrendingUp },
  gamma: { symbol: "Γ", icon: Activity },
  theta: { symbol: "Θ", icon: Clock },
  vega: { symbol: "ν", icon: Zap },
  rho: { symbol: "ρ", icon: Percent },
};

const VARIABLE_LABELS: Record<string, string> = {
  price: "Underlying Price",
  time: "Days to Expiration",
  volatility: "Implied Volatility",
};

const POPULAR_SYMBOLS = ["SPY", "QQQ", "AAPL", "TSLA", "NVDA"];

import { useSeo } from "@/components/seo";

export default function GreeksVisualizer() {
  useSeo({ path: "/greeks-visualizer" });
  const { toast } = useToast();
  const [result, setResult] = useState<VisualizationResult | null>(null);
  const [activeEducationTab, setActiveEducationTab] = useState("overview");

  const form = useForm<GreekForm>({
    resolver: zodResolver(greekFormSchema),
    defaultValues: {
      symbol: "SPY",
      optionType: "call",
      strike: 600,
      expiration: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      spotPrice: 590,
      volatility: 0.20,
      greek: "delta",
      variable: "price",
    },
  });

  const visualizeMutation = useMutation({
    mutationFn: async (data: GreekForm) => {
      const payload = {
        symbol: data.symbol,
        spotPrice: data.spotPrice,
        strike: data.strike,
        expiration: data.expiration,
        optionType: data.optionType,
        iv: data.volatility,
        xAxis: data.variable === "volatility" ? "iv" : data.variable,
      };
      const response = await apiRequest("POST", "/api/pricing/greeks/visualize", payload);
      return await response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setResult(data.data);
      } else {
        throw new Error(data.error);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Visualization Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleVisualize = (data: GreekForm) => {
    visualizeMutation.mutate(data);
  };

  const selectedGreek = form.watch("greek");
  const GreekIcon = GREEK_DESCRIPTIONS[selectedGreek]?.icon || TrendingUp;

  return (
    <div className="container mx-auto p-4 space-y-6 max-w-7xl" data-testid="page-greeks-visualizer">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <GraduationCap className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Greeks Visualizer</h1>
          <p className="text-sm text-muted-foreground">
            Interactive education and visualization of option Greeks
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <Card className="lg:col-span-1" data-testid="card-greek-config">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Symbol</Label>
              <div className="flex gap-1 flex-wrap mb-2">
                {POPULAR_SYMBOLS.map((sym) => (
                  <Badge
                    key={sym}
                    variant={form.watch("symbol") === sym ? "default" : "outline"}
                    className="cursor-pointer toggle-elevate text-xs"
                    onClick={() => form.setValue("symbol", sym)}
                    data-testid={`badge-symbol-${sym}`}
                  >
                    {sym}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">Option Type</Label>
                <Select
                  value={form.watch("optionType")}
                  onValueChange={(v) => form.setValue("optionType", v as "call" | "put")}
                >
                  <SelectTrigger className="h-8 text-base md:text-sm" data-testid="select-option-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="call">Call</SelectItem>
                    <SelectItem value="put">Put</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Strike</Label>
                <Input
                  type="number"
                  step="1"
                  className="h-8 text-base md:text-sm"
                  {...form.register("strike", { valueAsNumber: true })}
                  data-testid="input-strike"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">Spot Price</Label>
                <Input
                  type="number"
                  step="0.5"
                  className="h-8 text-base md:text-sm"
                  {...form.register("spotPrice", { valueAsNumber: true })}
                  data-testid="input-spot"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs">IV</Label>
                <Input
                  type="number"
                  step="0.01"
                  className="h-8 text-base md:text-sm"
                  {...form.register("volatility", { valueAsNumber: true })}
                  data-testid="input-iv"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Expiration</Label>
              <Input
                type="date"
                className="h-8 text-base md:text-sm"
                {...form.register("expiration")}
                data-testid="input-expiration"
              />
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>Greek to Visualize</Label>
              <div className="grid grid-cols-5 gap-1">
                {(["delta", "gamma", "theta", "vega", "rho"] as const).map((g) => {
                  const Icon = GREEK_DESCRIPTIONS[g].icon;
                  return (
                    <Button
                      key={g}
                      type="button"
                      variant={form.watch("greek") === g ? "default" : "outline"}
                      size="sm"
                      className="flex flex-col h-12 p-1"
                      onClick={() => form.setValue("greek", g)}
                      data-testid={`button-greek-${g}`}
                    >
                      <span className="text-lg font-mono">{GREEK_DESCRIPTIONS[g].symbol}</span>
                      <span className="text-[10px] capitalize">{g}</span>
                    </Button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Variable</Label>
              <Select
                value={form.watch("variable")}
                onValueChange={(v) => form.setValue("variable", v as "price" | "time" | "volatility")}
              >
                <SelectTrigger data-testid="select-variable">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="price">vs Price</SelectItem>
                  <SelectItem value="time">vs Time</SelectItem>
                  <SelectItem value="volatility">vs Volatility</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={form.handleSubmit(handleVisualize)}
              className="w-full"
              disabled={visualizeMutation.isPending}
              data-testid="button-visualize"
            >
              {visualizeMutation.isPending ? (
                <>
                  <Activity className="h-4 w-4 mr-2 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <GreekIcon className="h-4 w-4 mr-2" />
                  Visualize {GREEK_DESCRIPTIONS[selectedGreek]?.symbol}
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-3" data-testid="card-visualization">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                {result ? (
                  <>
                    <span
                      className="text-2xl font-mono"
                      style={{ color: GREEK_COLORS[result.greek] }}
                    >
                      {GREEK_DESCRIPTIONS[result.greek]?.symbol}
                    </span>
                    <span className="capitalize">{result.greek}</span>
                    <span className="text-muted-foreground">vs</span>
                    <span>{VARIABLE_LABELS[result.variable]}</span>
                  </>
                ) : (
                  "Greek Visualization"
                )}
              </CardTitle>
              {result && (
                <Badge variant="outline" className="font-mono">
                  Current: {result.baseValue.toFixed(4)}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {result ? (
              <div className="space-y-6">
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={result.data}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        dataKey="x"
                        tickFormatter={(v) => {
                          if (result.variable === "price") return `$${v}`;
                          if (result.variable === "time") return `${v}d`;
                          if (result.variable === "volatility") return `${(v * 100).toFixed(0)}%`;
                          return v;
                        }}
                      />
                      <YAxis
                        tickFormatter={(v) => v.toFixed(3)}
                        domain={["auto", "auto"]}
                      />
                      <Tooltip
                        formatter={(value: number) => [value.toFixed(4), result.greek]}
                        labelFormatter={(label) => {
                          if (result.variable === "price") return `Price: $${label}`;
                          if (result.variable === "time") return `DTE: ${label} days`;
                          if (result.variable === "volatility") return `IV: ${(label * 100).toFixed(1)}%`;
                          return label;
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="value"
                        fill={`${GREEK_COLORS[result.greek]}20`}
                        stroke="none"
                      />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke={GREEK_COLORS[result.greek]}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                      <ReferenceLine
                        y={result.baseValue}
                        stroke="hsl(var(--muted-foreground))"
                        strokeDasharray="5 5"
                        label={{
                          value: `Current: ${result.baseValue.toFixed(4)}`,
                          position: "right",
                          fill: "hsl(var(--muted-foreground))",
                          fontSize: 11,
                        }}
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>

                <GreekEducation education={result.education} />
              </div>
            ) : (
              <div className="h-72 flex items-center justify-center">
                <div className="text-center">
                  <div className="p-4 rounded-full bg-muted inline-block mb-4">
                    <BookOpen className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <h3 className="font-medium mb-2">Select a Greek to Visualize</h3>
                  <p className="text-sm text-muted-foreground max-w-md">
                    Configure your option and choose how the Greek changes with price, time, or volatility
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <GreekEducationOverview />
    </div>
  );
}

function GreekEducation({ education }: { education: VisualizationResult["education"] }) {
  return (
    <Card className="bg-muted/30" data-testid="card-greek-education">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <BookOpen className="h-4 w-4" />
          Understanding {education.name} ({education.symbol})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">{education.description}</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h4 className="font-medium text-sm mb-2">Interpretation</h4>
            <p className="text-sm text-muted-foreground">{education.interpretation}</p>
          </div>

          <div>
            <h4 className="font-medium text-sm mb-2">Trading Implications</h4>
            <ul className="space-y-1">
              {education.tradingImplications.map((impl, idx) => (
                <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                  <ChevronRight className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  {impl}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div>
          <h4 className="font-medium text-sm mb-2">Key Insights</h4>
          <div className="flex flex-wrap gap-2">
            {education.keyInsights.map((insight, idx) => (
              <Badge key={idx} variant="secondary" className="text-xs">
                {insight}
              </Badge>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function GreekEducationOverview() {
  const greekEducation = [
    {
      greek: "delta",
      symbol: "Δ",
      name: "Delta",
      description: "Measures sensitivity of option price to $1 change in underlying",
      range: "Calls: 0 to 1, Puts: -1 to 0",
      keyPoint: "Often used as probability proxy for ITM at expiration",
    },
    {
      greek: "gamma",
      symbol: "Γ",
      name: "Gamma",
      description: "Rate of change of Delta per $1 move in underlying",
      range: "Always positive for long options",
      keyPoint: "Highest for ATM options near expiration",
    },
    {
      greek: "theta",
      symbol: "Θ",
      name: "Theta",
      description: "Time decay - how much value option loses per day",
      range: "Usually negative for long options",
      keyPoint: "Accelerates as expiration approaches",
    },
    {
      greek: "vega",
      symbol: "ν",
      name: "Vega",
      description: "Sensitivity to 1% change in implied volatility",
      range: "Positive for long options",
      keyPoint: "Highest for ATM options with more time",
    },
    {
      greek: "rho",
      symbol: "ρ",
      name: "Rho",
      description: "Sensitivity to 1% change in interest rates",
      range: "Positive for calls, negative for puts",
      keyPoint: "More significant for LEAPS and deep ITM options",
    },
  ];

  return (
    <Card data-testid="card-greeks-overview">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <GraduationCap className="h-5 w-5" />
          Greeks Quick Reference
        </CardTitle>
        <CardDescription>
          Understanding option sensitivities for better trading decisions
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {greekEducation.map((g) => (
            <div
              key={g.greek}
              className="p-3 rounded-lg bg-muted/50 space-y-2"
              data-testid={`overview-${g.greek}`}
            >
              <div className="flex items-center gap-2">
                <span
                  className="text-2xl font-mono"
                  style={{ color: GREEK_COLORS[g.greek] }}
                >
                  {g.symbol}
                </span>
                <span className="font-medium">{g.name}</span>
              </div>
              <p className="text-xs text-muted-foreground">{g.description}</p>
              <div className="text-xs">
                <span className="text-muted-foreground">Range: </span>
                <span>{g.range}</span>
              </div>
              <Badge variant="outline" className="text-xs">
                {g.keyPoint}
              </Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
