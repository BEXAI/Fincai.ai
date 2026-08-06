import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  Cpu,
  MessageSquare,
  Activity,
  Rocket,
  ArrowRight,
  ArrowLeft,
  Check,
  type LucideIcon,
} from "lucide-react";
import { useOnboarding } from "@/contexts/OnboardingContext";

interface WalkStep {
  icon: LucideIcon;
  title: string;
  body: string;
  href?: string;
  cta?: string;
}

// Educational/navigational copy only — no personalized financial advice.
const WALK_STEPS: WalkStep[] = [
  {
    icon: Sparkles,
    title: "Welcome to Fincai",
    body: "Your AI trading workspace. Here's a quick 30-second tour of the core flow so you know where to start. You can skip any time.",
  },
  {
    icon: Cpu,
    title: "Meet your AI Trading Agent",
    body: "Connect securely through Robinhood's official flow and watch the agent analyze markets. Manual trades execute only after you confirm, and autonomous strategies run in paper by default — you stay in control.",
    href: "/agent",
    cta: "Open the Agent",
  },
  {
    icon: MessageSquare,
    title: "Chat with the AI",
    body: "Ask about any stock or idea in plain English. The assistant explains markets and pulls live data to help you learn.",
    href: "/chat",
    cta: "Open AI Chat",
  },
  {
    icon: Activity,
    title: "Run a market analysis",
    body: "Pick a symbol to pull live prices and technical signals — pivots, Fibonacci, ATR, and Bollinger bands — in one click.",
    href: "/market-analysis",
    cta: "Open Market Analysis",
  },
  {
    icon: Rocket,
    title: "Explore strategy templates",
    body: "Browse ready-made, rules-based strategies. Practice them in paper mode with no real money before ever going live.",
    href: "/strategy-templates",
    cta: "Browse Templates",
  },
];

export function OnboardingWalkthrough() {
  const { walkthroughOpen, closeWalkthrough, completeWalkthrough } = useOnboarding();
  const [, navigate] = useLocation();
  const [stepIndex, setStepIndex] = useState(0);

  // Always restart from the beginning whenever it (re)opens.
  useEffect(() => {
    if (walkthroughOpen) setStepIndex(0);
  }, [walkthroughOpen]);

  const total = WALK_STEPS.length;
  const step = WALK_STEPS[stepIndex];
  const isLast = stepIndex === total - 1;
  const StepIcon = step.icon;

  const handleNext = () => {
    if (isLast) {
      completeWalkthrough();
    } else {
      setStepIndex((i) => Math.min(i + 1, total - 1));
    }
  };

  const handleVisit = () => {
    if (step.href) {
      completeWalkthrough();
      navigate(step.href);
    }
  };

  return (
    <Dialog open={walkthroughOpen} onOpenChange={(open) => !open && closeWalkthrough()}>
      <DialogContent
        className="glass-panel border-[var(--glass-border)] sm:max-w-md"
        data-testid="dialog-onboarding-walkthrough"
      >
        <DialogHeader>
          <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <StepIcon className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle data-testid="text-walkthrough-title">{step.title}</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed" data-testid="text-walkthrough-body">
            {step.body}
          </DialogDescription>
        </DialogHeader>

        {step.href && step.cta && (
          <Button
            variant="outline"
            onClick={handleVisit}
            className="w-full justify-between gap-2"
            data-testid="button-walkthrough-visit"
          >
            {step.cta}
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5 py-1" aria-hidden="true">
          {WALK_STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === stepIndex ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/30"
              }`}
            />
          ))}
        </div>

        <DialogFooter className="flex-row items-center justify-between gap-2 sm:justify-between">
          <div className="flex items-center gap-2">
            {stepIndex > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStepIndex((i) => Math.max(i - 1, 0))}
                className="gap-1"
                data-testid="button-walkthrough-back"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                onClick={completeWalkthrough}
                data-testid="button-walkthrough-skip"
              >
                Skip
              </Button>
            )}
          </div>
          <Button onClick={handleNext} className="gap-1" data-testid="button-walkthrough-next">
            {isLast ? (
              <>
                Get started
                <Check className="h-4 w-4" />
              </>
            ) : (
              <>
                Next
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
