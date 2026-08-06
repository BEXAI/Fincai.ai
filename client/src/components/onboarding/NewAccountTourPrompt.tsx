import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOnboarding } from "@/contexts/OnboardingContext";

export function NewAccountTourPrompt() {
  const { newAccountPromptOpen, startTourFromPrompt, dismissNewAccountPrompt } = useOnboarding();

  if (!newAccountPromptOpen) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-[60] w-[calc(100%-2rem)] max-w-sm"
      role="dialog"
      aria-label="Take the quick tour"
      data-testid="prompt-new-account-tour"
    >
      <div className="glass-panel rounded-md border border-[var(--glass-border)] p-4 shadow-lg">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Sparkles className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold" data-testid="text-new-account-tour-title">
              New here? Take the 30-second tour
            </p>
            <p className="mt-1 text-sm text-muted-foreground" data-testid="text-new-account-tour-body">
              See how the AI agent, chat, and strategy tools fit together so you know where to start.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                onClick={startTourFromPrompt}
                data-testid="button-new-account-tour-start"
              >
                Start the tour
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={dismissNewAccountPrompt}
                data-testid="button-new-account-tour-dismiss"
              >
                Maybe later
              </Button>
            </div>
          </div>
          <Button
            size="icon"
            variant="ghost"
            onClick={dismissNewAccountPrompt}
            aria-label="Dismiss"
            data-testid="button-new-account-tour-close"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
