import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Sparkles,
  TrendingUp,
  TrendingDown,
  Minus,
  Target,
  ShieldCheck,
  Clock,
  AlertTriangle,
  ChevronRight,
  RefreshCw,
  Check,
  X,
  Loader2,
  BarChart3,
  Lightbulb,
  Zap,
} from "lucide-react";
import type { AiStrategyRecommendation } from "@shared/schema";

interface StrategyRecommendationsProps {
  onSelectRecommendation?: (recommendation: AiStrategyRecommendation) => void;
}

const DIRECTION_CONFIG = {
  bullish: { icon: TrendingUp, color: "text-profit", bgColor: "bg-profit/10", label: "Bullish" },
  bearish: { icon: TrendingDown, color: "text-loss", bgColor: "bg-loss/10", label: "Bearish" },
  neutral: { icon: Minus, color: "text-muted-foreground", bgColor: "bg-muted", label: "Neutral" },
};

const RISK_PROFILE_CONFIG = {
  conservative: { color: "bg-muted text-muted-foreground", label: "Conservative" },
  moderate: { color: "bg-[hsl(var(--gold-primary)/0.15)] text-[hsl(var(--gold-primary))]", label: "Moderate" },
  aggressive: { color: "bg-loss/15 text-loss", label: "Aggressive" },
};

const TIME_HORIZON_CONFIG = {
  intraday: { label: "Intraday", icon: Zap },
  swing: { label: "Swing", icon: Clock },
  position: { label: "Position", icon: BarChart3 },
  long_term: { label: "Long-term", icon: Target },
};

function formatStrategyType(type: string): string {
  return type
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatConfidence(score: number): { label: string; color: string } {
  if (score >= 0.8) return { label: "High", color: "text-profit" };
  if (score >= 0.6) return { label: "Moderate", color: "text-[hsl(var(--gold-primary))]" };
  return { label: "Low", color: "text-muted-foreground" };
}

function RecommendationCard({
  recommendation,
  onAccept,
  onReject,
  onIgnore,
  isUpdating,
}: {
  recommendation: AiStrategyRecommendation;
  onAccept: () => void;
  onReject: () => void;
  onIgnore: () => void;
  isUpdating: boolean;
}) {
  const directionConfig = DIRECTION_CONFIG[recommendation.direction as keyof typeof DIRECTION_CONFIG] || DIRECTION_CONFIG.neutral;
  const riskConfig = RISK_PROFILE_CONFIG[recommendation.riskProfile as keyof typeof RISK_PROFILE_CONFIG] || RISK_PROFILE_CONFIG.moderate;
  const timeConfig = TIME_HORIZON_CONFIG[recommendation.timeHorizon as keyof typeof TIME_HORIZON_CONFIG] || TIME_HORIZON_CONFIG.swing;
  const confidence = formatConfidence(recommendation.confidenceScore);
  const DirectionIcon = directionConfig.icon;
  const TimeIcon = timeConfig.icon;

  const showActions = recommendation.status === "active";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="group"
    >
      <Card
        className="p-4 border-[hsl(var(--glass-border))] bg-card/50 backdrop-blur-sm 
                   hover:border-[hsl(var(--gold-primary)/0.3)] transition-colors"
        data-testid={`card-recommendation-${recommendation.id}`}
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-md ${directionConfig.bgColor}`}>
              <DirectionIcon className={`w-4 h-4 ${directionConfig.color}`} />
            </div>
            <div>
              <h3 className="font-medium text-sm" data-testid={`text-rec-title-${recommendation.id}`}>
                {recommendation.title}
              </h3>
              <span className="text-xs text-muted-foreground font-mono">
                {recommendation.primarySymbol}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge variant="secondary" className={riskConfig.color}>
              {riskConfig.label}
            </Badge>
            <Badge variant="outline" className="text-xs">
              <TimeIcon className="w-3 h-3 mr-1" />
              {timeConfig.label}
            </Badge>
          </div>
        </div>

        <p className="text-sm text-muted-foreground mb-3" data-testid={`text-rec-thesis-${recommendation.id}`}>
          {recommendation.thesis}
        </p>

        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="text-center p-2 rounded-md bg-muted/30">
            <span className="text-xs text-muted-foreground block">Strategy</span>
            <span className="text-sm font-medium">{formatStrategyType(recommendation.strategyType)}</span>
          </div>
          <div className="text-center p-2 rounded-md bg-muted/30">
            <span className="text-xs text-muted-foreground block">Entry</span>
            <span className="text-sm font-mono font-medium">
              ${recommendation.suggestedEntryPrice?.toFixed(2) || "—"}
            </span>
          </div>
          <div className="text-center p-2 rounded-md bg-muted/30">
            <span className="text-xs text-muted-foreground block">Confidence</span>
            <span className={`text-sm font-medium ${confidence.color}`}>
              {(recommendation.confidenceScore * 100).toFixed(0)}%
            </span>
          </div>
        </div>

        {(recommendation.stopLossPercent || recommendation.profitTargetPercent) && (
          <div className="flex items-center gap-4 text-xs mb-3">
            {recommendation.stopLossPercent && (
              <div className="flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-loss" />
                <span className="text-muted-foreground">Stop:</span>
                <span className="text-loss font-mono">-{recommendation.stopLossPercent.toFixed(1)}%</span>
              </div>
            )}
            {recommendation.profitTargetPercent && (
              <div className="flex items-center gap-1">
                <Target className="w-3 h-3 text-profit" />
                <span className="text-muted-foreground">Target:</span>
                <span className="text-profit font-mono">+{recommendation.profitTargetPercent.toFixed(1)}%</span>
              </div>
            )}
          </div>
        )}

        {recommendation.keyFactors && recommendation.keyFactors.length > 0 && (
          <div className="mb-3">
            <div className="flex flex-wrap gap-1">
              {recommendation.keyFactors.slice(0, 3).map((factor, i) => (
                <Badge key={i} variant="outline" className="text-xs font-normal">
                  <Lightbulb className="w-3 h-3 mr-1 text-[hsl(var(--gold-primary))]" />
                  {factor}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {showActions && (
          <>
            <Separator className="my-3" />
            <div className="flex items-center justify-between gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={onIgnore}
                disabled={isUpdating}
                className="text-muted-foreground hover:text-foreground"
                data-testid={`button-ignore-${recommendation.id}`}
              >
                <X className="w-4 h-4 mr-1" />
                Dismiss
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onReject}
                  disabled={isUpdating}
                  className="border-loss/30 text-loss hover:bg-loss/10"
                  data-testid={`button-reject-${recommendation.id}`}
                >
                  Not Now
                </Button>
                <Button
                  size="sm"
                  onClick={onAccept}
                  disabled={isUpdating}
                  className="bg-gradient-to-r from-[hsl(var(--gold-dark))] via-[hsl(var(--gold-primary))] to-[hsl(var(--gold-light))] 
                           text-black hover:opacity-90"
                  data-testid={`button-accept-${recommendation.id}`}
                >
                  {isUpdating ? (
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4 mr-1" />
                  )}
                  Accept
                </Button>
              </div>
            </div>
          </>
        )}

        {!showActions && (
          <div className="flex items-center justify-end">
            <Badge 
              variant={recommendation.status === "executed" ? "default" : "secondary"}
              className={recommendation.status === "executed" ? "bg-profit/20 text-profit" : ""}
            >
              {recommendation.status.charAt(0).toUpperCase() + recommendation.status.slice(1)}
            </Badge>
          </div>
        )}
      </Card>
    </motion.div>
  );
}

export function StrategyRecommendations({ onSelectRecommendation }: StrategyRecommendationsProps) {
  const { toast } = useToast();
  const [symbol, setSymbol] = useState("SPY");
  const [riskProfile, setRiskProfile] = useState<"conservative" | "moderate" | "aggressive">("moderate");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const { data: recommendations = [], isLoading } = useQuery<AiStrategyRecommendation[]>({
    queryKey: ["/api/recommendations"],
    refetchInterval: 60000,
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/recommendations/generate", { symbol, riskProfile });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recommendations"] });
      toast({ title: "Recommendation generated", description: `New recommendation for ${symbol}` });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to generate recommendation", variant: "destructive" });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await apiRequest("PATCH", `/api/recommendations/${id}/status`, { status });
      return res.json();
    },
    onSuccess: (data, { status }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/recommendations"] });
      setUpdatingId(null);
      const action = status === "accepted" ? "accepted" : status === "rejected" ? "rejected" : "dismissed";
      toast({ title: "Updated", description: `Recommendation ${action}` });
      
      if (status === "accepted" && onSelectRecommendation && data) {
        onSelectRecommendation(data);
      }
    },
    onError: () => {
      setUpdatingId(null);
      toast({ title: "Error", description: "Failed to update recommendation", variant: "destructive" });
    },
  });

  const handleStatusUpdate = (id: string, status: "accepted" | "rejected" | "ignored") => {
    setUpdatingId(id);
    updateStatusMutation.mutate({ id, status });
  };

  const activeRecommendations = recommendations.filter((r) => r.status === "active");
  const historyRecommendations = recommendations.filter((r) => r.status !== "active").slice(0, 5);

  return (
    <div className="space-y-4" data-testid="container-strategy-recommendations">
      <Card className="p-4 border-[hsl(var(--glass-border))] bg-card/50 backdrop-blur-sm">
        <div className="flex items-center gap-2 mb-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-[hsl(var(--gold-dark))] to-[hsl(var(--gold-primary))]">
            <Sparkles className="w-4 h-4 text-black" />
          </div>
          <div>
            <h2 className="text-base font-semibold">AI Strategy Recommendations</h2>
            <p className="text-xs text-muted-foreground">Market-driven trading ideas</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <Input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            placeholder="Symbol (e.g., SPY)"
            className="h-9 w-full sm:w-24 font-mono"
            data-testid="input-recommendation-symbol"
          />
          <Select value={riskProfile} onValueChange={(v) => setRiskProfile(v as typeof riskProfile)}>
            <SelectTrigger className="h-9 w-full sm:w-32" data-testid="select-risk-profile">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="conservative">Conservative</SelectItem>
              <SelectItem value="moderate">Moderate</SelectItem>
              <SelectItem value="aggressive">Aggressive</SelectItem>
            </SelectContent>
          </Select>
          <Button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending || !symbol}
            className="h-9 bg-gradient-to-r from-[hsl(var(--gold-dark))] via-[hsl(var(--gold-primary))] to-[hsl(var(--gold-light))] 
                     text-black hover:opacity-90"
            data-testid="button-generate-recommendation"
          >
            {generateMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 mr-2" />
            )}
            Generate
          </Button>
        </div>
      </Card>

      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && activeRecommendations.length === 0 && (
        <Card className="p-6 border-dashed border-[hsl(var(--glass-border))] bg-transparent text-center">
          <Lightbulb className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No active recommendations. Generate one to get started.
          </p>
        </Card>
      )}

      <AnimatePresence mode="popLayout">
        {activeRecommendations.map((rec) => (
          <RecommendationCard
            key={rec.id}
            recommendation={rec}
            onAccept={() => handleStatusUpdate(rec.id, "accepted")}
            onReject={() => handleStatusUpdate(rec.id, "rejected")}
            onIgnore={() => handleStatusUpdate(rec.id, "ignored")}
            isUpdating={updatingId === rec.id}
          />
        ))}
      </AnimatePresence>

      {historyRecommendations.length > 0 && (
        <div className="pt-4">
          <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Recent History
          </h3>
          <div className="space-y-2 opacity-75">
            {historyRecommendations.map((rec) => (
              <RecommendationCard
                key={rec.id}
                recommendation={rec}
                onAccept={() => {}}
                onReject={() => {}}
                onIgnore={() => {}}
                isUpdating={false}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default StrategyRecommendations;
