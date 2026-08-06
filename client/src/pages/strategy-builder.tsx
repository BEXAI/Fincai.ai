import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { PayoffDiagram } from "@/components/payoff-diagram";
import { GreeksDisplay } from "@/components/greeks-display";
import { PositionSizing } from "@/components/position-sizing";
import { RiskManagementPanel } from "@/components/risk-management-panel";
import { StrategyRunnerPanel } from "@/components/strategy-runner-panel";
import { DefaultAgentButton } from "@/components/default-agent-button";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Calculator, AlertCircle, Sparkles } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { StrategyAnalysis, PayoffPoint } from "@shared/schema";
import { getStrategyTemplate } from "@shared/strategy-templates";

const legSchema = z.object({
  optionType: z.enum(["call", "put"]),
  action: z.enum(["buy", "sell"]),
  strike: z.number().positive(),
  quantity: z.number().int().positive(),
  premium: z.number().positive(),
  expirationDate: z.string(),
});

const strategyFormSchema = z.object({
  name: z.string().min(1, "Strategy name is required"),
  underlyingSymbol: z.string().min(1, "Ticker is required"),
  strategyType: z.enum(['call', 'put', 'call_spread', 'put_spread', 'straddle', 'strangle', 'iron_condor', 'butterfly']),
  riskProfile: z.enum(["conservative", "moderate", "aggressive"]),
  description: z.string().optional(),
  stopLossPercent: z.number().positive().optional(),
  profitTargetPercent: z.number().positive().optional(),
  timeStopMinutes: z.number().int().positive().optional(),
  useTrailingStop: z.boolean().optional(),
  legs: z.array(legSchema).min(1),
}).refine((data) => {
  if (data.stopLossPercent && data.profitTargetPercent) {
    return data.profitTargetPercent / data.stopLossPercent >= 1.5;
  }
  return true;
}, {
  message: "Risk/Reward ratio must be at least 1:1.5 (Profit Target ≥ 1.5x Stop Loss)",
  path: ["profitTargetPercent"],
});

type StrategyFormData = z.infer<typeof strategyFormSchema>;

import { useSeo } from "@/components/seo";

export default function StrategyBuilder() {
  useSeo({ path: "/builder" });
  const { toast } = useToast();

  const appliedTemplate =
    typeof window !== "undefined"
      ? getStrategyTemplate(
          new URLSearchParams(window.location.search).get("template") ?? "",
        )
      : undefined;

  const [legs, setLegs] = useState([
    {
      optionType: (appliedTemplate?.preset.legType ?? "call") as "call" | "put",
      action: "buy" as "buy" | "sell",
      strike: 500,
      quantity: 1,
      premium: 5.0,
      expirationDate: "2026-01-16",
    },
  ]);

  const [analysis, setAnalysis] = useState<StrategyAnalysis | null>(null);

  const form = useForm<StrategyFormData>({
    resolver: zodResolver(strategyFormSchema),
    defaultValues: {
      name: appliedTemplate?.name ?? "",
      underlyingSymbol: appliedTemplate?.preset.defaultSymbol ?? "QQQ",
      strategyType: appliedTemplate?.preset.strategyType ?? "call",
      riskProfile: appliedTemplate?.preset.riskProfile ?? "moderate",
      description: appliedTemplate?.preset.description ?? "",
      stopLossPercent: appliedTemplate?.preset.stopLossPercent,
      profitTargetPercent: appliedTemplate?.preset.profitTargetPercent,
      timeStopMinutes: appliedTemplate?.preset.timeStopMinutes,
      useTrailingStop: appliedTemplate?.preset.useTrailingStop ?? false,
      legs: legs,
    },
  });

  const analyzeMutation = useMutation({
    mutationFn: async (data: StrategyFormData) => {
      const response = await apiRequest("POST", "/api/strategies/analyze", data);
      return await response.json();
    },
    onSuccess: (data) => {
      setAnalysis(data);
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (data: StrategyFormData) => {
      const response = await apiRequest("POST", "/api/strategies", data);
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Strategy saved",
        description: "Your strategy has been saved successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/strategies"] });
      form.reset();
      setLegs([
        {
          optionType: "call",
          action: "buy",
          strike: 500,
          quantity: 1,
          premium: 5.0,
          expirationDate: "2026-01-16",
        },
      ]);
      setAnalysis(null);
    },
  });

  const addLeg = () => {
    setLegs([
      ...legs,
      {
        optionType: "call",
        action: "buy",
        strike: 500,
        quantity: 1,
        premium: 5.0,
        expirationDate: "2026-01-16",
      },
    ]);
  };

  const removeLeg = (index: number) => {
    setLegs(legs.filter((_, i) => i !== index));
  };

  const updateLeg = (index: number, field: string, value: any) => {
    const newLegs = [...legs];
    newLegs[index] = { ...newLegs[index], [field]: value };
    setLegs(newLegs);
  };

  const handleAnalyze = () => {
    const formData = form.getValues();
    formData.legs = legs;
    analyzeMutation.mutate(formData);
  };

  const handleSave = () => {
    const formData = form.getValues();
    formData.legs = legs;
    saveMutation.mutate(formData);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Strategy Builder</h1>
        <p className="text-muted-foreground">
          Design and analyze custom options strategies
        </p>
      </div>

      {appliedTemplate && (
        <Card className="border-primary/30">
          <CardContent className="flex items-start gap-3 p-4">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div className="space-y-0.5">
              <p className="font-medium" data-testid="text-applied-template">
                Template applied: {appliedTemplate.name}
              </p>
              <p className="text-sm text-muted-foreground">
                {appliedTemplate.tagline} Adjust the legs below, then Analyze and Save.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Live Strategy Runner</h2>
          <p className="text-sm text-muted-foreground">
            Let a template trade stocks for you automatically — paper (simulated) by default, or live
            through your connected Robinhood agent.
          </p>
        </div>
        <DefaultAgentButton />
      </div>
      <StrategyRunnerPanel initialTemplateId={appliedTemplate?.id} />

      <Separator />

      <div>
        <h2 className="text-lg font-semibold">Options Strategy Builder</h2>
        <p className="text-sm text-muted-foreground">
          Design and analyze a custom options strategy (analysis only).
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Strategy Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Strategy Name</Label>
              <Input
                id="name"
                {...form.register("name")}
                placeholder="e.g., QQQ Bull Call Spread"
                data-testid="input-strategy-name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="symbol">Underlying Symbol</Label>
              <Input
                id="symbol"
                {...form.register("underlyingSymbol")}
                placeholder="e.g., QQQ, WMT"
                className="uppercase"
                data-testid="input-underlying-symbol"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="risk">Risk Profile</Label>
              <Select
                value={form.watch("riskProfile")}
                onValueChange={(value: any) => form.setValue("riskProfile", value)}
              >
                <SelectTrigger data-testid="select-risk-profile">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="conservative">Conservative</SelectItem>
                  <SelectItem value="moderate">Moderate</SelectItem>
                  <SelectItem value="aggressive">Aggressive</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Textarea
                id="description"
                {...form.register("description")}
                placeholder="Strategy rationale..."
                rows={3}
                data-testid="input-description"
              />
            </div>

            <div className="space-y-2 border-t pt-4">
              <Label className="text-sm font-medium">Stop Rules (Optional)</Label>
              
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <Label htmlFor="stopLoss" className="text-xs">Stop Loss %</Label>
                  <Input
                    id="stopLoss"
                    type="number"
                    step="0.1"
                    placeholder="e.g., 2.0"
                    className="h-8 font-mono"
                    {...form.register("stopLossPercent", { 
                      setValueAs: v => v === "" ? undefined : parseFloat(v) 
                    })}
                    data-testid="input-stop-loss"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="profitTarget" className="text-xs">Profit Target %</Label>
                  <Input
                    id="profitTarget"
                    type="number"
                    step="0.1"
                    placeholder="e.g., 5.0"
                    className="h-8 font-mono"
                    {...form.register("profitTargetPercent", { 
                      setValueAs: v => v === "" ? undefined : parseFloat(v) 
                    })}
                    data-testid="input-profit-target"
                  />
                </div>
              </div>

              {form.watch("stopLossPercent") && form.watch("profitTargetPercent") && (
                <div className="p-2 bg-muted rounded-md">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Risk/Reward Ratio:</span>
                    <span className="font-mono font-medium" data-testid="text-risk-reward">
                      {(form.watch("profitTargetPercent")! / form.watch("stopLossPercent")!).toFixed(2)}:1
                    </span>
                  </div>
                  {form.formState.errors.profitTargetPercent && (
                    <div className="flex items-center gap-2 mt-2 text-xs text-destructive">
                      <AlertCircle className="h-3 w-3" />
                      <span>{form.formState.errors.profitTargetPercent.message}</span>
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="timeStop" className="text-xs">Time Stop (Minutes)</Label>
                <Input
                  id="timeStop"
                  type="number"
                  placeholder="e.g., 60"
                  className="h-8 font-mono"
                  {...form.register("timeStopMinutes", { 
                    setValueAs: v => v === "" ? undefined : parseInt(v) 
                  })}
                  data-testid="input-time-stop"
                />
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="trailingStop"
                  checked={form.watch("useTrailingStop")}
                  onCheckedChange={(checked) => form.setValue("useTrailingStop", !!checked)}
                  data-testid="checkbox-trailing-stop"
                />
                <Label htmlFor="trailingStop" className="text-xs cursor-pointer">
                  Use Trailing Stop
                </Label>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Options Legs</Label>
                <Button size="sm" variant="outline" onClick={addLeg} data-testid="button-add-leg">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {legs.map((leg, index) => (
                <div key={index} className="p-4 border rounded-md space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Leg {index + 1}</span>
                    {legs.length > 1 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeLeg(index)}
                        data-testid={`button-remove-leg-${index}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Type</Label>
                      <Select
                        value={leg.optionType}
                        onValueChange={(value: any) =>
                          updateLeg(index, "optionType", value)
                        }
                      >
                        <SelectTrigger className="h-8" data-testid={`select-leg-type-${index}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="call">Call</SelectItem>
                          <SelectItem value="put">Put</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label className="text-xs">Action</Label>
                      <Select
                        value={leg.action}
                        onValueChange={(value: any) =>
                          updateLeg(index, "action", value)
                        }
                      >
                        <SelectTrigger className="h-8" data-testid={`select-leg-action-${index}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="buy">Buy</SelectItem>
                          <SelectItem value="sell">Sell</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs">Strike Price</Label>
                    <Input
                      type="number"
                      value={leg.strike}
                      onChange={(e) =>
                        updateLeg(index, "strike", parseFloat(e.target.value))
                      }
                      className="h-8 font-mono"
                      step="1"
                      data-testid={`input-leg-strike-${index}`}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Quantity</Label>
                      <Input
                        type="number"
                        value={leg.quantity}
                        onChange={(e) =>
                          updateLeg(index, "quantity", parseInt(e.target.value))
                        }
                        className="h-8 font-mono"
                        data-testid={`input-leg-quantity-${index}`}
                      />
                    </div>

                    <div>
                      <Label className="text-xs">Premium</Label>
                      <Input
                        type="number"
                        value={leg.premium}
                        onChange={(e) =>
                          updateLeg(index, "premium", parseFloat(e.target.value))
                        }
                        className="h-8 font-mono"
                        step="0.01"
                        data-testid={`input-leg-premium-${index}`}
                      />
                    </div>
                  </div>

                  <div>
                    <Label className="text-xs">Expiration</Label>
                    <Input
                      type="date"
                      value={leg.expirationDate}
                      onChange={(e) =>
                        updateLeg(index, "expirationDate", e.target.value)
                      }
                      className="h-8"
                      data-testid={`input-leg-expiration-${index}`}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                onClick={handleAnalyze}
                disabled={analyzeMutation.isPending}
                className="flex-1"
                data-testid="button-analyze"
              >
                <Calculator className="h-4 w-4 mr-2" />
                Analyze
              </Button>
              <Button
                onClick={handleSave}
                disabled={saveMutation.isPending || !analysis}
                variant="outline"
                className="flex-1"
                data-testid="button-save"
              >
                Save
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="lg:col-span-2 space-y-6">
          {analysis ? (
            <>
              <PayoffDiagram
                data={analysis.payoffDiagram}
                currentPrice={analysis.currentPrice}
                breakeven={analysis.breakeven}
                maxProfit={analysis.maxProfit}
                maxLoss={analysis.maxLoss}
                stopLossPercent={form.watch("stopLossPercent")}
                profitTargetPercent={form.watch("profitTargetPercent")}
              />
              <div className="grid gap-6 md:grid-cols-2">
                <RiskManagementPanel 
                  analysis={analysis} 
                  currentPrice={analysis.currentPrice} 
                />
                <GreeksDisplay {...analysis.greeks} />
              </div>
              <PositionSizing
                premiumPerContract={
                  legs.reduce((sum, leg) => sum + leg.premium * 100, 0) / legs.length
                }
                maxLossPerContract={Math.abs(analysis.maxLoss)}
              />
            </>
          ) : (
            <Card className="h-full flex items-center justify-center min-h-[400px]">
              <div className="text-center p-8">
                <Calculator className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">Ready to Analyze</h3>
                <p className="text-muted-foreground">
                  Configure your strategy and click "Analyze" to see the payoff diagram
                  and Greeks
                </p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
