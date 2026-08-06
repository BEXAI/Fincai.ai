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
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, Circle, ArrowRight, PlayCircle, PartyPopper, EyeOff } from "lucide-react";
import { useOnboarding } from "@/contexts/OnboardingContext";

export function GettingStartedChecklist() {
  const {
    checklistOpen,
    setChecklistOpen,
    openWalkthrough,
    steps,
    isStepDone,
    hideHelp,
  } = useOnboarding();
  const [, navigate] = useLocation();

  const doneCount = steps.filter((s) => isStepDone(s.id)).length;
  const total = steps.length;
  const allDone = doneCount === total;
  const pct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  const handleGo = (href: string) => {
    setChecklistOpen(false);
    navigate(href);
  };

  return (
    <Dialog open={checklistOpen} onOpenChange={setChecklistOpen}>
      <DialogContent
        className="glass-panel border-[var(--glass-border)] sm:max-w-md"
        data-testid="dialog-getting-started"
      >
        <DialogHeader>
          <DialogTitle data-testid="text-checklist-title">Getting started</DialogTitle>
          <DialogDescription>
            A few first steps to get the most out of Fincai.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground" data-testid="text-checklist-progress">
              {doneCount} of {total} complete
            </span>
            {allDone && (
              <span className="flex items-center gap-1 text-primary">
                <PartyPopper className="h-4 w-4" />
                All done
              </span>
            )}
          </div>
          <Progress value={pct} className="h-2" data-testid="progress-checklist" />
        </div>

        <div className="space-y-2">
          {steps.map((step) => {
            const done = isStepDone(step.id);
            return (
              <div
                key={step.id}
                className="flex items-start gap-3 rounded-md border border-[var(--glass-border)] bg-card/30 p-3"
                data-testid={`checklist-item-${step.id}`}
              >
                {done ? (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" data-testid={`icon-done-${step.id}`} />
                ) : (
                  <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" data-testid={`icon-todo-${step.id}`} />
                )}
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-medium ${done ? "text-muted-foreground line-through" : ""}`}>
                    {step.label}
                  </p>
                  <p className="text-xs text-muted-foreground">{step.description}</p>
                </div>
                {!done && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleGo(step.href)}
                    className="shrink-0 gap-1"
                    data-testid={`button-go-${step.id}`}
                  >
                    Go
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        {allDone && (
          <div
            className="flex items-start gap-3 rounded-md border border-primary/30 bg-primary/10 p-3"
            data-testid="banner-checklist-complete"
          >
            <PartyPopper className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">You're all set!</p>
              <p className="text-xs text-muted-foreground">
                You've finished every step. Hide these shortcuts to keep your workspace tidy — you can
                still replay the walkthrough below.
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
          <Button
            variant="outline"
            onClick={openWalkthrough}
            className="w-full gap-2"
            data-testid="button-replay-walkthrough"
          >
            <PlayCircle className="h-4 w-4" />
            Replay walkthrough
          </Button>
          {allDone && (
            <Button
              variant="ghost"
              onClick={hideHelp}
              className="w-full gap-2 text-muted-foreground"
              data-testid="button-hide-getting-started"
            >
              <EyeOff className="h-4 w-4" />
              Hide getting started
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
