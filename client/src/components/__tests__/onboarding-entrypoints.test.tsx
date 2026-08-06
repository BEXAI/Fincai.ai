import type { ReactNode } from "react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { OnboardingProvider } from "@/contexts/OnboardingContext";
import { ThemeProvider } from "@/components/theme-provider";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";

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
const HELP_HIDDEN_KEY = "fincai:onboardingHelpHidden";

function makeClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, queryFn: async () => [] },
    },
  });
}

function renderWithProviders(ui: ReactNode) {
  const { hook } = memoryLocation({ path: "/dashboard", record: true });
  return render(
    <QueryClientProvider client={makeClient()}>
      <ThemeProvider>
        <Router hook={hook}>
          <SidebarProvider>
            <OnboardingProvider>{ui}</OnboardingProvider>
          </SidebarProvider>
        </Router>
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  // Suppress the first-run walkthrough so it doesn't sit on top of the checklist.
  localStorage.setItem(COMPLETED_KEY, "1");
});

describe("Getting-started checklist re-open entry points", () => {
  it("opens the checklist from the sidebar footer button", async () => {
    renderWithProviders(<AppSidebar />);
    expect(screen.queryByTestId("dialog-getting-started")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("button-getting-started"));

    expect(await screen.findByTestId("dialog-getting-started")).toBeInTheDocument();
  });

  it("opens the checklist from the mobile quick menu", async () => {
    renderWithProviders(<MobileBottomNav />);

    // Open the quick menu, then tap the help action.
    fireEvent.click(screen.getByTestId("nav-menu-toggle"));
    expect(await screen.findByTestId("mobile-quick-menu")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("button-help-quick-menu"));
    expect(await screen.findByTestId("dialog-getting-started")).toBeInTheDocument();
  });

  it("hides the help entry points once the user opts to hide them", async () => {
    localStorage.setItem(HELP_HIDDEN_KEY, "1");
    renderWithProviders(
      <>
        <AppSidebar />
        <MobileBottomNav />
      </>,
    );

    // Sidebar footer entry point is gone.
    expect(screen.queryByTestId("button-getting-started")).not.toBeInTheDocument();

    // Mobile quick-menu help action is gone too.
    fireEvent.click(screen.getByTestId("nav-menu-toggle"));
    expect(await screen.findByTestId("mobile-quick-menu")).toBeInTheDocument();
    expect(screen.queryByTestId("button-help-quick-menu")).not.toBeInTheDocument();
  });
});
