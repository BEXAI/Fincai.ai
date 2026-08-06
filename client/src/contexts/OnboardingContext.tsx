import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import type { StrategyRun } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { useAuthContext } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { OnboardingWalkthrough } from "@/components/onboarding/OnboardingWalkthrough";
import { GettingStartedChecklist } from "@/components/onboarding/GettingStartedChecklist";
import { NewAccountTourPrompt } from "@/components/onboarding/NewAccountTourPrompt";
import { isPromoCaptureMode } from "@/lib/promo-capture";

const COMPLETED_KEY = "fincai:onboardingCompleted";
const STEPS_KEY = "fincai:onboardingSteps";
const CELEBRATED_KEY = "fincai:onboardingCelebrated";
const HELP_HIDDEN_KEY = "fincai:onboardingHelpHidden";

export interface OnboardingStep {
  id: string;
  label: string;
  description: string;
  href: string;
}

// The handful of first actions surfaced in both the walkthrough and the
// getting-started checklist. Copy stays educational/navigational only — no
// personalized financial advice — consistent with the app's compliance stance.
export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "agent",
    label: "Meet your AI Trading Agent",
    description: "See how the agent connects securely and runs manual trades only with your confirmation.",
    href: "/agent",
  },
  {
    id: "chat",
    label: "Try the AI Chat",
    description: "Ask about any stock or market idea in plain English.",
    href: "/chat",
  },
  {
    id: "analysis",
    label: "Run a market analysis",
    description: "Pull live data and technical signals for a symbol you care about.",
    href: "/market-analysis",
  },
  {
    id: "templates",
    label: "Explore strategy templates",
    description: "Browse ready-made, rules-based strategies you can learn from.",
    href: "/strategy-templates",
  },
  {
    id: "paper",
    label: "Arm a paper strategy",
    description: "Practice automated trading with simulated funds — no real money at stake.",
    href: "/builder",
  },
];

function routeToStepId(loc: string): string | null {
  if (loc === "/" || loc.startsWith("/agent")) return "agent";
  if (loc.startsWith("/chat")) return "chat";
  if (loc.startsWith("/market-analysis")) return "analysis";
  if (loc.startsWith("/strategy-templates")) return "templates";
  return null;
}

interface OnboardingContextType {
  walkthroughOpen: boolean;
  checklistOpen: boolean;
  openWalkthrough: () => void;
  closeWalkthrough: () => void;
  completeWalkthrough: () => void;
  openChecklist: () => void;
  setChecklistOpen: (open: boolean) => void;
  steps: OnboardingStep[];
  completedSteps: string[];
  isStepDone: (id: string) => boolean;
  markStep: (id: string) => void;
  newAccountPromptOpen: boolean;
  startTourFromPrompt: () => void;
  dismissNewAccountPrompt: () => void;
  allStepsDone: boolean;
  helpHidden: boolean;
  hideHelp: () => void;
  showHelp: () => void;
}

const OnboardingContext = createContext<OnboardingContextType | null>(null);

function readCompletedFlag(): boolean {
  try {
    return localStorage.getItem(COMPLETED_KEY) === "1";
  } catch {
    return false;
  }
}

function readCompletedSteps(): string[] {
  try {
    const raw = localStorage.getItem(STEPS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string") : [];
  } catch {
    return [];
  }
}

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, isLoading, justRegistered, clearJustRegistered } =
    useAuthContext();
  const [location] = useLocation();
  const { toast } = useToast();

  const [localCompleted, setLocalCompleted] = useState<boolean>(() => readCompletedFlag());
  const [walkthroughOpen, setWalkthroughOpen] = useState(false);
  const [checklistOpen, setChecklistOpen] = useState(false);
  const [completedSteps, setCompletedSteps] = useState<string[]>(() => readCompletedSteps());
  const [newAccountPromptOpen, setNewAccountPromptOpen] = useState(false);
  const [helpHidden, setHelpHidden] = useState<boolean>(() => readFlag(HELP_HIDDEN_KEY));
  const autoOpenedRef = useRef(false);

  const allStepsDone =
    ONBOARDING_STEPS.length > 0 &&
    ONBOARDING_STEPS.every((s) => completedSteps.includes(s.id));

  // Fire a one-time celebratory toast the moment the final checklist item is
  // completed. We track the previous "all done" state so a returning user who
  // already finished everything in a prior session never sees a delayed toast,
  // and a persisted flag guards against re-firing across reloads.
  const celebratedRef = useRef<boolean>(readFlag(CELEBRATED_KEY));
  const prevAllDoneRef = useRef<boolean | null>(null);
  useEffect(() => {
    const wasAllDone = prevAllDoneRef.current;
    prevAllDoneRef.current = allStepsDone;
    if (wasAllDone === null) return; // skip the initial render
    if (captureMode) return; // no toasts while capturing screenshots
    if (!wasAllDone && allStepsDone && !celebratedRef.current) {
      celebratedRef.current = true;
      try {
        localStorage.setItem(CELEBRATED_KEY, "1");
      } catch {
        // ignore storage failures (private mode, etc.)
      }
      toast({
        title: "You're all set!",
        description:
          "You've completed every getting-started step. You can hide the help shortcuts anytime from the checklist.",
      });
    }
  }, [allStepsDone, toast]);

  const hideHelp = useCallback(() => {
    setHelpHidden(true);
    setChecklistOpen(false);
    try {
      localStorage.setItem(HELP_HIDDEN_KEY, "1");
    } catch {
      // ignore
    }
  }, []);

  // Restore the getting-started entry points (sidebar footer, mobile quick menu)
  // after a user has hidden them, and reopen the checklist so the action is
  // visibly confirmed.
  const showHelp = useCallback(() => {
    setHelpHidden(false);
    try {
      localStorage.removeItem(HELP_HIDDEN_KEY);
    } catch {
      // ignore
    }
    setChecklistOpen(true);
  }, []);

  // A logged-in account flag wins so the walkthrough never re-triggers across
  // devices; anonymous users fall back to the local flag.
  const completed = localCompleted || (isAuthenticated && !!user?.onboardingCompleted);

  // In promo-capture mode, suppress every onboarding overlay so the clean
  // product screenshots aren't obscured by the walkthrough/checklist/prompt.
  const captureMode = isPromoCaptureMode();

  // Auto-launch the walkthrough once per load for users who haven't seen it.
  useEffect(() => {
    if (captureMode || isLoading || completed || autoOpenedRef.current) return;
    autoOpenedRef.current = true;
    setWalkthroughOpen(true);
  }, [captureMode, isLoading, completed]);

  // Welcome brand-new account holders back into the tour. This specifically
  // catches the user who skipped the walkthrough while anonymous (so the local
  // flag is set and it won't re-auto-open) and then created an account. We never
  // nudge if onboarding is already completed on the account, and the prompt is
  // shown once per registration (cleared as soon as it's handled).
  useEffect(() => {
    if (!justRegistered) return;
    clearJustRegistered();
    if (user?.onboardingCompleted) return;
    if (!localCompleted) return; // they haven't dismissed it yet — auto-open handles it
    if (walkthroughOpen) return;
    setNewAccountPromptOpen(true);
  }, [justRegistered, clearJustRegistered, user?.onboardingCompleted, localCompleted, walkthroughOpen]);

  const markStep = useCallback((id: string) => {
    setCompletedSteps((prev) => {
      if (prev.includes(id)) return prev;
      const next = [...prev, id];
      try {
        localStorage.setItem(STEPS_KEY, JSON.stringify(next));
      } catch {
        // ignore storage failures (private mode, etc.)
      }
      return next;
    });
  }, []);

  // Mark checklist items complete as the user actually visits those surfaces.
  useEffect(() => {
    const id = routeToStepId(location);
    if (id) markStep(id);
  }, [location, markStep]);

  // Derive the "armed a paper strategy" item from existing strategy-run signal.
  const { data: runs } = useQuery<StrategyRun[]>({
    queryKey: ["/api/strategy-runs"],
    staleTime: 30_000,
  });
  useEffect(() => {
    if (runs && runs.length > 0) markStep("paper");
  }, [runs, markStep]);

  const persistCompleted = useCallback(() => {
    setLocalCompleted(true);
    try {
      localStorage.setItem(COMPLETED_KEY, "1");
    } catch {
      // ignore
    }
    if (isAuthenticated) {
      apiRequest("POST", "/api/auth/onboarding/complete").catch(() => {
        // Best-effort; local flag still prevents re-triggering this session.
      });
    }
  }, [isAuthenticated]);

  const completeWalkthrough = useCallback(() => {
    setWalkthroughOpen(false);
    persistCompleted();
  }, [persistCompleted]);

  const openWalkthrough = useCallback(() => {
    setChecklistOpen(false);
    setWalkthroughOpen(true);
  }, []);

  // Closing via the X / overlay counts as dismissing it for good.
  const closeWalkthrough = useCallback(() => {
    setWalkthroughOpen(false);
    persistCompleted();
  }, [persistCompleted]);

  const openChecklist = useCallback(() => setChecklistOpen(true), []);

  const startTourFromPrompt = useCallback(() => {
    setNewAccountPromptOpen(false);
    setWalkthroughOpen(true);
  }, []);

  // Dismissing is a gentle "not now" — it does not mark onboarding complete, but
  // since the local flag is already set the tour won't auto-reopen, and the
  // one-shot registration signal is cleared, so the prompt won't reappear.
  const dismissNewAccountPrompt = useCallback(() => {
    setNewAccountPromptOpen(false);
  }, []);

  const isStepDone = useCallback(
    (id: string) => completedSteps.includes(id),
    [completedSteps],
  );

  const value = useMemo<OnboardingContextType>(
    () => ({
      walkthroughOpen,
      checklistOpen,
      openWalkthrough,
      closeWalkthrough,
      completeWalkthrough,
      openChecklist,
      setChecklistOpen,
      steps: ONBOARDING_STEPS,
      completedSteps,
      isStepDone,
      markStep,
      newAccountPromptOpen,
      startTourFromPrompt,
      dismissNewAccountPrompt,
      allStepsDone,
      helpHidden,
      hideHelp,
      showHelp,
    }),
    [
      walkthroughOpen,
      checklistOpen,
      openWalkthrough,
      closeWalkthrough,
      completeWalkthrough,
      openChecklist,
      completedSteps,
      isStepDone,
      markStep,
      newAccountPromptOpen,
      startTourFromPrompt,
      dismissNewAccountPrompt,
      allStepsDone,
      helpHidden,
      hideHelp,
      showHelp,
    ],
  );

  return (
    <OnboardingContext.Provider value={value}>
      {children}
      {!captureMode && (
        <>
          <OnboardingWalkthrough />
          <GettingStartedChecklist />
          <NewAccountTourPrompt />
        </>
      )}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error("useOnboarding must be used within an OnboardingProvider");
  }
  return ctx;
}
