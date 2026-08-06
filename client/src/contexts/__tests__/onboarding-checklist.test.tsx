import type { ReactNode } from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { OnboardingProvider, useOnboarding } from "@/contexts/OnboardingContext";

// The onboarding provider depends on the auth context for the walkthrough
// gating logic. We render as an anonymous, finished-loading visitor so the
// checklist behaviour is what's under test (not the auth flow).
vi.mock("@/contexts/AuthContext", () => ({
  useAuthContext: () => ({
    user: null,
    isAuthenticated: false,
    isLoading: false,
    justRegistered: false,
    clearJustRegistered: () => {},
  }),
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}));

const COMPLETED_KEY = "fincai:onboardingCompleted";

// Strategy runs returned by the mocked /api/strategy-runs query. Mutated per
// test before render to drive the "paper" step.
let runsData: unknown[] = [];

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
        queryFn: async ({ queryKey }) => {
          if (queryKey[0] === "/api/strategy-runs") return runsData;
          return [];
        },
      },
    },
  });
}

// Small consumer that lets a test open the checklist on demand (mirrors the
// real header/sidebar/mobile entry points which all call openChecklist()).
function OpenChecklistButton() {
  const { openChecklist } = useOnboarding();
  return (
    <button data-testid="test-open-checklist" onClick={openChecklist}>
      open
    </button>
  );
}

function renderOnboarding(initialPath: string) {
  const { hook, navigate } = memoryLocation({ path: initialPath, record: true });
  const client = makeClient();
  const utils = render(
    <QueryClientProvider client={client}>
      <Router hook={hook}>
        <OnboardingProvider>
          <OpenChecklistButton />
        </OnboardingProvider>
      </Router>
    </QueryClientProvider>,
  );
  return { ...utils, navigate };
}

beforeEach(() => {
  runsData = [];
  // Suppress the first-run walkthrough auto-open so it doesn't sit on top of
  // the checklist during these assertions.
  localStorage.setItem(COMPLETED_KEY, "1");
});

describe("Getting-started checklist auto-completion", () => {
  it("marks the agent step from the home route and checks off each surface as the user navigates", async () => {
    const { navigate } = renderOnboarding("/");
    fireEvent.click(screen.getByTestId("test-open-checklist"));

    expect(await screen.findByTestId("dialog-getting-started")).toBeInTheDocument();
    // "/" maps to the agent step.
    expect(screen.getByTestId("icon-done-agent")).toBeInTheDocument();
    // Other steps are still pending.
    expect(screen.getByTestId("icon-todo-chat")).toBeInTheDocument();
    expect(screen.getByTestId("icon-todo-analysis")).toBeInTheDocument();
    expect(screen.getByTestId("icon-todo-templates")).toBeInTheDocument();

    act(() => navigate("/chat"));
    expect(await screen.findByTestId("icon-done-chat")).toBeInTheDocument();

    act(() => navigate("/market-analysis"));
    expect(await screen.findByTestId("icon-done-analysis")).toBeInTheDocument();

    act(() => navigate("/strategy-templates"));
    expect(await screen.findByTestId("icon-done-templates")).toBeInTheDocument();
  });

  it("treats /agent sub-routes as the agent step", async () => {
    const { navigate } = renderOnboarding("/chat");
    fireEvent.click(screen.getByTestId("test-open-checklist"));
    expect(await screen.findByTestId("icon-done-chat")).toBeInTheDocument();
    // agent not yet visited
    expect(screen.getByTestId("icon-todo-agent")).toBeInTheDocument();

    act(() => navigate("/agent/connect"));
    expect(await screen.findByTestId("icon-done-agent")).toBeInTheDocument();
  });

  it("completes the paper step when a strategy run exists", async () => {
    runsData = [{ id: "run-1", status: "watching" }];
    renderOnboarding("/");
    fireEvent.click(screen.getByTestId("test-open-checklist"));

    expect(await screen.findByTestId("icon-done-paper")).toBeInTheDocument();
  });

  it("clicking a step's Go button navigates to its surface and checks it off", async () => {
    renderOnboarding("/");
    fireEvent.click(screen.getByTestId("test-open-checklist"));

    const goChat = await screen.findByTestId("button-go-chat");
    fireEvent.click(goChat);

    // Go closes the dialog; re-open and confirm the chat step is now complete.
    fireEvent.click(screen.getByTestId("test-open-checklist"));
    expect(await screen.findByTestId("icon-done-chat")).toBeInTheDocument();
  });

  it("Replay walkthrough reopens the tour without clearing completed steps", async () => {
    // Pre-seed two completed steps.
    localStorage.setItem(
      "fincai:onboardingSteps",
      JSON.stringify(["chat", "analysis"]),
    );
    renderOnboarding("/strategy-templates");
    fireEvent.click(screen.getByTestId("test-open-checklist"));

    expect(await screen.findByTestId("icon-done-chat")).toBeInTheDocument();
    expect(screen.getByTestId("icon-done-analysis")).toBeInTheDocument();
    // templates becomes done from the current route.
    expect(await screen.findByTestId("icon-done-templates")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("button-replay-walkthrough"));

    // Walkthrough opens, checklist closes.
    expect(await screen.findByTestId("dialog-onboarding-walkthrough")).toBeInTheDocument();
    expect(screen.queryByTestId("dialog-getting-started")).not.toBeInTheDocument();

    // Re-open the checklist: completion must be preserved.
    fireEvent.click(screen.getByTestId("test-open-checklist"));
    expect(await screen.findByTestId("icon-done-chat")).toBeInTheDocument();
    expect(screen.getByTestId("icon-done-analysis")).toBeInTheDocument();
    expect(screen.getByTestId("icon-done-templates")).toBeInTheDocument();
  });
});
