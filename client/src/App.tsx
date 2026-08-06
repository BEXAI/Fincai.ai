import { lazy, Suspense, useState, useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { ErrorBoundary } from "@/components/error-boundary";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { AuthProvider, useAuthContext } from "@/contexts/AuthContext";
import { ChatModeProvider } from "@/contexts/ChatModeContext";
import { OnboardingProvider, useOnboarding } from "@/contexts/OnboardingContext";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/NotificationBell";
import { SiteFooter } from "@/components/site-footer";
import { RouteSeo } from "@/components/seo";
import { Loader2, UserPlus, LogIn, User, HelpCircle } from "lucide-react";
import { isPromoCaptureMode } from "@/lib/promo-capture";
import AgentTerminal from "@/pages/agent-terminal";
import NotFound from "@/pages/not-found";
import { useViewportMetrics } from "@/hooks/use-viewport-metrics";

// Code-split secondary/heavy routes so they don't bloat the initial bundle.
// The landing (AgentTerminal) and not-found stay eager for instant paint.
// AuthPage is only shown after a user action (sign-in), so it's lazy too.
const AuthPage = lazy(() => import("@/pages/auth"));
const ImmersiveChat = lazy(() => import("@/pages/immersive-chat"));
const Dashboard = lazy(() => import("@/pages/dashboard"));
const StrategyBuilder = lazy(() => import("@/pages/strategy-builder"));
const StrategyTemplates = lazy(() => import("@/pages/strategy-templates"));
const StrategiesHub = lazy(() => import("@/pages/strategies-hub"));
const StrategyPerformance = lazy(() => import("@/pages/strategy-performance"));
const StrategyDetail = lazy(() => import("@/pages/strategy-detail"));
const WalmartCaseStudy = lazy(() => import("@/pages/walmart-case-study"));
const CompareStrategies = lazy(() => import("@/pages/compare-strategies"));
const Watchlist = lazy(() => import("@/pages/watchlist"));
const PositionSizing = lazy(() => import("@/pages/position-sizing"));
const TradingEducation = lazy(() => import("@/pages/trading-education"));
const TradeJournal = lazy(() => import("@/pages/trade-journal"));
const PerformanceDashboard = lazy(() => import("@/pages/performance-dashboard"));
const PsychologyTracker = lazy(() => import("@/pages/psychology-tracker"));
const MarketAnalysis = lazy(() => import("@/pages/market-analysis"));
const Alerts = lazy(() => import("@/pages/alerts"));
const OptionsChainPage = lazy(() => import("@/pages/options-chain"));
const AIRecommendationsPage = lazy(() => import("@/pages/ai-recommendations"));
const VolatilitySurfacePage = lazy(() => import("@/pages/volatility-surface"));
const PnLSimulator = lazy(() => import("@/pages/pnl-simulator"));
const VaRCalculator = lazy(() => import("@/pages/var-calculator"));
const GreeksVisualizer = lazy(() => import("@/pages/greeks-visualizer"));
const AiProviders = lazy(() => import("@/pages/ai-providers"));
const RobinhoodAiAgent = lazy(() => import("@/pages/robinhood-ai-agent"));
const AiOptionsTradingAssistant = lazy(() => import("@/pages/ai-options-trading-assistant"));
const AiStockAnalysisBot = lazy(() => import("@/pages/ai-stock-analysis-bot"));
const PaperTradingAiAgent = lazy(() => import("@/pages/paper-trading-ai-agent"));
const Promo = lazy(() => import("@/pages/promo"));
const SecurityPage = lazy(() => import("@/pages/security"));
const PrivacyPage = lazy(() => import("@/pages/privacy"));
const TermsPage = lazy(() => import("@/pages/terms"));
const DisclosuresPage = lazy(() => import("@/pages/disclosures"));

const SIDEBAR_STYLE = {
  "--sidebar-width": "16rem",
  "--sidebar-width-icon": "3rem",
} as React.CSSProperties;

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

function AuthGate({ 
  isAuthenticated, 
  onNavigateToAuth, 
  children,
  featureName = "this feature"
}: { 
  isAuthenticated: boolean; 
  onNavigateToAuth: (mode: 'login' | 'register') => void;
  children: React.ReactNode;
  featureName?: string;
}) {
  // In promo-capture mode we render the real feature so a clean screenshot can
  // be taken for the /promo tour, even for pages that normally require sign-in.
  if (!isAuthenticated && !isPromoCaptureMode()) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4" data-testid="auth-gate">
        <div className="glass-panel rounded-2xl p-8 max-w-md w-full text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <User className="w-8 h-8 text-primary" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">Sign in required</h2>
            <p className="text-muted-foreground text-sm">
              Please sign in to access {featureName}. Your data will be securely saved to your account.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <Button
              onClick={() => onNavigateToAuth('login')}
              className="gap-2 w-full min-h-[44px]"
              data-testid="button-auth-gate-login"
            >
              <LogIn className="w-4 h-4" />
              Sign In
            </Button>
            <Button
              variant="outline"
              onClick={() => onNavigateToAuth('register')}
              className="gap-2 w-full min-h-[44px]"
              data-testid="button-auth-gate-register"
            >
              <UserPlus className="w-4 h-4" />
              Create Account
            </Button>
          </div>
        </div>
      </div>
    );
  }
  
  return <>{children}</>;
}

function AppRouter({ isAuthenticated, onNavigateToAuth }: { isAuthenticated: boolean; onNavigateToAuth: (mode: 'login' | 'register') => void }) {
  return (
    <Switch>
      <Route path="/">{() => <AgentTerminal isAuthenticated={isAuthenticated} onNavigateToAuth={onNavigateToAuth} />}</Route>
      <Route path="/agent">{() => <AgentTerminal isAuthenticated={isAuthenticated} onNavigateToAuth={onNavigateToAuth} />}</Route>
      <Route path="/chat">{() => <ImmersiveChat isAnonymous={!isAuthenticated} onNavigateToAuth={onNavigateToAuth} />}</Route>
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/builder" component={StrategyBuilder} />
      <Route path="/strategy-templates" component={StrategyTemplates} />
      <Route path="/strategies" component={StrategiesHub} />
      <Route path="/strategy-performance" component={StrategyPerformance} />
      <Route path="/strategies/:id" component={StrategyDetail} />
      <Route path="/walmart" component={WalmartCaseStudy} />
      <Route path="/compare" component={CompareStrategies} />
      <Route path="/watchlist" component={Watchlist} />
      <Route path="/position-sizing" component={PositionSizing} />
      <Route path="/education" component={TradingEducation} />
      <Route path="/trade-journal">{() => <ProfilePage isAuthenticated={isAuthenticated} onNavigateToAuth={onNavigateToAuth} />}</Route>
      <Route path="/performance" component={PerformanceDashboard} />
      <Route path="/psychology" component={PsychologyTracker} />
      <Route path="/market-analysis" component={MarketAnalysis} />
      <Route path="/alerts">{() => (
        <AuthGate isAuthenticated={isAuthenticated} onNavigateToAuth={onNavigateToAuth} featureName="price alerts">
          <Alerts />
        </AuthGate>
      )}</Route>
      <Route path="/options">{() => (
        <AuthGate isAuthenticated={isAuthenticated} onNavigateToAuth={onNavigateToAuth} featureName="options chain">
          <OptionsChainPage />
        </AuthGate>
      )}</Route>
      <Route path="/ai-recommendations">{() => (
        <AuthGate isAuthenticated={isAuthenticated} onNavigateToAuth={onNavigateToAuth} featureName="AI recommendations">
          <AIRecommendationsPage />
        </AuthGate>
      )}</Route>
      <Route path="/volatility-surface">{() => (
        <AuthGate isAuthenticated={isAuthenticated} onNavigateToAuth={onNavigateToAuth} featureName="volatility surface">
          <VolatilitySurfacePage />
        </AuthGate>
      )}</Route>
      <Route path="/pnl-simulator" component={PnLSimulator} />
      <Route path="/var-calculator" component={VaRCalculator} />
      <Route path="/greeks-visualizer" component={GreeksVisualizer} />
      <Route path="/ai-providers" component={AiProviders} />
      <Route path="/robinhood-ai-agent" component={RobinhoodAiAgent} />
      <Route path="/ai-options-trading-assistant" component={AiOptionsTradingAssistant} />
      <Route path="/ai-stock-analysis-bot" component={AiStockAnalysisBot} />
      <Route path="/paper-trading-ai-agent" component={PaperTradingAiAgent} />
      <Route path="/promo" component={Promo} />
      <Route path="/security" component={SecurityPage} />
      <Route path="/privacy" component={PrivacyPage} />
      <Route path="/terms" component={TermsPage} />
      <Route path="/disclosures" component={DisclosuresPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function ProfilePage({ isAuthenticated, onNavigateToAuth }: { isAuthenticated: boolean; onNavigateToAuth: (mode: 'login' | 'register') => void }) {
  const { user, logout } = useAuthContext();
  
  if (isAuthenticated && user) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col items-center py-8 space-y-4">
          <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="w-10 h-10 text-primary" />
          </div>
          <div className="text-center">
            <h2 className="text-xl font-semibold">{user.firstName || user.email}</h2>
            <p className="text-sm text-muted-foreground">{user.email}</p>
          </div>
          <Button
            variant="outline"
            onClick={logout}
            className="gap-2"
            data-testid="button-profile-logout"
          >
            <LogIn className="w-4 h-4" />
            Sign Out
          </Button>
        </div>
        <TradeJournal />
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center py-8 space-y-4">
        <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
          <User className="w-10 h-10 text-muted-foreground" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-xl font-semibold">Guest</h2>
          <p className="text-muted-foreground text-sm max-w-xs">
            Sign in to save your data across sessions
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            onClick={() => onNavigateToAuth('login')}
            className="gap-2"
            data-testid="button-profile-login"
          >
            <LogIn className="w-4 h-4" />
            Sign In
          </Button>
          <Button
            variant="outline"
            onClick={() => onNavigateToAuth('register')}
            className="gap-2"
            data-testid="button-profile-signup"
          >
            <UserPlus className="w-4 h-4" />
            Create Account
          </Button>
        </div>
      </div>
    </div>
  );
}

function MainApp() {
  const { isAuthenticated, isLoading } = useAuthContext();
  const { openChecklist, helpHidden } = useOnboarding();

  // Keep viewport CSS vars in sync for mobile Safari (address bar + keyboard).
  useViewportMetrics();
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [location] = useLocation();
  
  const isImmersivePage = location === "/chat";

  // Once the visitor successfully authenticates, dismiss the auth screen and
  // return them to where they were (e.g. the agent landing) so any pending
  // action — like connecting their trading agent — can continue.
  useEffect(() => {
    if (isAuthenticated && showAuth) {
      setShowAuth(false);
    }
  }, [isAuthenticated, showAuth]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center app-min-h bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  const handleNavigateToAuth = (mode: 'login' | 'register') => {
    setAuthMode(mode);
    setShowAuth(true);
  };

  if (showAuth) {
    return (
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <AuthPage 
            initialMode={authMode} 
            onBack={() => setShowAuth(false)} 
          />
        </Suspense>
      </ErrorBoundary>
    );
  }

  if (isImmersivePage) {
    return (
      <ErrorBoundary>
        <Suspense fallback={<PageLoader />}>
          <ImmersiveChat isAnonymous={!isAuthenticated} onNavigateToAuth={handleNavigateToAuth} />
        </Suspense>
      </ErrorBoundary>
    );
  }

  return (
    <SidebarProvider style={SIDEBAR_STYLE}>
      <div className="flex app-shell w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1">
          <header className="flex items-center justify-between mobile-header border-b border-border px-3 md:px-4 py-2">
            <div className="flex items-center gap-2 md:gap-4">
              <SidebarTrigger data-testid="button-sidebar-toggle" className="h-9 w-9" />
            </div>
            <div className="flex items-center gap-2">
              {!helpHidden && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={openChecklist}
                  className="h-9 w-9"
                  aria-label="Getting started"
                  data-testid="button-help"
                >
                  <HelpCircle className="h-5 w-5" />
                </Button>
              )}
              <NotificationBell />
              <ThemeToggle />
            </div>
          </header>
          <main className="mobile-content-area px-3 pt-3 md:px-6 md:pt-6">
            <ErrorBoundary>
              <Suspense fallback={<PageLoader />}>
                <AppRouter isAuthenticated={isAuthenticated} onNavigateToAuth={handleNavigateToAuth} />
              </Suspense>
            </ErrorBoundary>
            <SiteFooter />
          </main>
          <MobileBottomNav onNavigateToAuth={handleNavigateToAuth} />
        </div>
      </div>
    </SidebarProvider>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <RouteSeo />
          <AuthProvider>
            <ChatModeProvider>
              <OnboardingProvider>
                <MainApp />
              </OnboardingProvider>
            </ChatModeProvider>
          </AuthProvider>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
