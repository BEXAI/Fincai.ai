import { Link } from "wouter";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Cpu,
  ArrowRight,
  TrendingUp,
  Shield,
  Clock,
  Target,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  STRATEGY_TEMPLATES,
  type RiskLevel,
  type StrategyTemplate,
} from "@shared/strategy-templates";
import { Seo } from "@/components/seo";

const riskDotClass: Record<RiskLevel, string> = {
  conservative: "bg-profit",
  moderate: "bg-primary",
  aggressive: "bg-loss",
};

const riskLabel: Record<RiskLevel, string> = {
  conservative: "Conservative",
  moderate: "Moderate",
  aggressive: "Aggressive",
};

function TemplateCard({ template }: { template: StrategyTemplate }) {
  const { preset } = template;
  const ratio = (preset.profitTargetPercent / preset.stopLossPercent).toFixed(1);

  return (
    <Card className="flex flex-col" data-testid={`card-template-${template.id}`}>
      <CardHeader className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle
            className="text-lg"
            data-testid={`text-template-name-${template.id}`}
          >
            {template.name}
          </CardTitle>
          <Badge variant="secondary" className="shrink-0 gap-1.5">
            <span
              className={cn("h-2 w-2 rounded-full", riskDotClass[template.riskLevel])}
              aria-hidden="true"
            />
            {riskLabel[template.riskLevel]}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">{template.tagline}</p>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Cpu className="h-3.5 w-3.5 text-primary" />
          <span data-testid={`text-template-source-${template.id}`}>
            {template.derivedFrom}
          </span>
        </div>
      </CardHeader>

      <CardContent className="flex-1 space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="gap-1">
            <Shield className="h-3 w-3" />
            Stop {preset.stopLossPercent}%
          </Badge>
          <Badge variant="outline" className="gap-1">
            <Target className="h-3 w-3" />
            Target {preset.profitTargetPercent}%
          </Badge>
          <Badge variant="outline" className="gap-1">
            <Activity className="h-3 w-3" />
            R:R {ratio}:1
          </Badge>
          {preset.useTrailingStop && (
            <Badge variant="outline" className="gap-1">
              <TrendingUp className="h-3 w-3" />
              Trailing stop
            </Badge>
          )}
          {preset.timeStopMinutes ? (
            <Badge variant="outline" className="gap-1">
              <Clock className="h-3 w-3" />
              {preset.timeStopMinutes}m time stop
            </Badge>
          ) : null}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            How it works
          </p>
          <ul className="space-y-1.5">
            {template.howItWorks.map((point, i) => (
              <li
                key={i}
                className="flex gap-2 text-sm text-muted-foreground"
                data-testid={`text-template-step-${template.id}-${i}`}
              >
                <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="grid gap-2 rounded-md border border-border p-3 text-sm">
          <div className="flex gap-2">
            <span className="shrink-0 text-muted-foreground">Best for:</span>
            <span>{template.bestFor}</span>
          </div>
          <div className="flex gap-2">
            <span className="shrink-0 text-muted-foreground">Sizing:</span>
            <span>{template.sizingMethod}</span>
          </div>
        </div>
      </CardContent>

      <CardFooter>
        <Button
          asChild
          className="w-full gap-2"
          data-testid={`button-use-template-${template.id}`}
        >
          <Link href={`/builder?template=${template.id}`}>
            Use This Template
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}

export default function StrategyTemplates() {
  return (
    <div className="space-y-6">
      <Seo path="/strategy-templates" />
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold" data-testid="text-page-title">
          Strategy Templates
        </h1>
        <p className="max-w-3xl text-muted-foreground">
          Battle-tested trading playbooks — some derived from our KalshiBot
          engine, others adapted from the quant methodologies used on
          institutional trading desks (trend following, factor momentum,
          statistical arbitrage, volatility risk premium, and risk parity). Pick
          one to pre-fill the Strategy Builder with its entry logic and risk
          rules, then review and save it as your own.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {STRATEGY_TEMPLATES.map((template) => (
          <TemplateCard key={template.id} template={template} />
        ))}
      </div>

      <p className="max-w-3xl text-xs text-muted-foreground">
        Templates are starting points for research, not financial advice. Manual
        trades require your review and confirmation; templates armed in the
        autonomous runner default to paper and go live only when you opt in,
        within the limits you set.
      </p>
    </div>
  );
}
