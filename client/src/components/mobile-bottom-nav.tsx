import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  User,
  Menu,
  X,
  Bell,
  Moon,
  Sun,
  LogIn,
  UserPlus,
  Bot,
  Cpu,
  MessageSquare,
  BarChart3,
  GraduationCap,
  Target,
  LineChart,
  HelpCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "@/components/theme-provider";
import { useAuthContext } from "@/contexts/AuthContext";
import { useOnboarding } from "@/contexts/OnboardingContext";

interface PriceAlert {
  id: number;
  status: string;
}

const navItems = [
  { title: "Agent", url: "/", icon: Cpu, primary: true },
  { title: "AI Chat", url: "/chat", icon: MessageSquare },
  { title: "Portfolio", url: "/dashboard", icon: LayoutDashboard },
  { title: "Profile", url: "/trade-journal", icon: User },
];

interface MobileBottomNavProps {
  onNavigateToAuth?: (mode: 'login' | 'register') => void;
}

export function MobileBottomNav({ onNavigateToAuth }: MobileBottomNavProps) {
  const [location] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const { isAuthenticated } = useAuthContext();
  const { openChecklist, helpHidden, showHelp } = useOnboarding();

  const { data: alerts } = useQuery<PriceAlert[]>({
    queryKey: ["/api/alerts"],
    refetchInterval: 60000,
  });

  const unreadCount = alerts?.filter(a => a.status === "triggered").length || 0;

  useEffect(() => {
    if (menuOpen) {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === "Escape") setMenuOpen(false);
      };
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [menuOpen]);

  return (
    <>
      {menuOpen && (
        <div
          className="fixed inset-0 z-[48] bg-black/50 backdrop-blur-sm md:hidden"
          onClick={() => setMenuOpen(false)}
          data-testid="menu-backdrop-mobile"
        />
      )}

      {menuOpen && (
        <div
          className="fixed bottom-[calc(64px+env(safe-area-inset-bottom,0px))] left-2 right-2 z-[49] glass-panel rounded-2xl p-3 md:hidden safe-area-bottom"
          data-testid="mobile-quick-menu"
          role="menu"
        >
          <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-white/10">
            <div className="flex items-center gap-2.5">
              <img 
                src="/logo.jpeg" 
                alt="Fincai" 
                className="w-7 h-7 rounded-lg object-cover"
              />
              <div>
                <h3 className="text-sm font-semibold">Fincai</h3>
                <p className="text-[10px] text-muted-foreground">AI Trading Assistant</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <Link
                href="/alerts"
                onClick={() => setMenuOpen(false)}
                className="relative mobile-touch-target-sm rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                data-testid="button-alerts-quick-menu"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <Badge 
                    className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 text-[10px] bg-loss text-white border-0"
                  >
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </Badge>
                )}
              </Link>
              <button
                onClick={() => {
                  setMenuOpen(false);
                  if (helpHidden) {
                    showHelp();
                  } else {
                    openChecklist();
                  }
                }}
                className="mobile-touch-target-sm rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                data-testid={helpHidden ? "button-show-help-quick-menu" : "button-help-quick-menu"}
                aria-label={helpHidden ? "Show getting started" : "Getting started"}
              >
                <HelpCircle className="w-4 h-4" />
              </button>
              <button
                onClick={() => setTheme(theme === "light" ? "dark" : "light")}
                className="mobile-touch-target-sm rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
                data-testid="button-theme-quick-menu"
              >
                {theme === "dark" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-1.5 mb-3">
            <Link
              href="/strategies"
              onClick={() => setMenuOpen(false)}
              className="flex flex-col items-center gap-0.5 p-2 rounded-xl hover:bg-white/5 transition-colors mobile-touch-target"
              data-testid="quick-link-strategies"
            >
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                <Target className="w-4 h-4 text-primary" />
              </div>
              <span className="text-[10px] text-muted-foreground">Strategies</span>
            </Link>
            <Link
              href="/market-analysis"
              onClick={() => setMenuOpen(false)}
              className="flex flex-col items-center gap-0.5 p-2 rounded-xl hover:bg-white/5 transition-colors mobile-touch-target"
              data-testid="quick-link-analysis"
            >
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                <BarChart3 className="w-4 h-4 text-primary" />
              </div>
              <span className="text-[10px] text-muted-foreground">Analysis</span>
            </Link>
            <Link
              href="/education"
              onClick={() => setMenuOpen(false)}
              className="flex flex-col items-center gap-0.5 p-2 rounded-xl hover:bg-white/5 transition-colors mobile-touch-target"
              data-testid="quick-link-learn"
            >
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                <GraduationCap className="w-4 h-4 text-primary" />
              </div>
              <span className="text-[10px] text-muted-foreground">Learn</span>
            </Link>
            <Link
              href="/builder"
              onClick={() => setMenuOpen(false)}
              className="flex flex-col items-center gap-0.5 p-2 rounded-xl hover:bg-white/5 transition-colors mobile-touch-target"
              data-testid="quick-link-strategy"
            >
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                <LineChart className="w-4 h-4 text-primary" />
              </div>
              <span className="text-[10px] text-muted-foreground">Builder</span>
            </Link>
          </div>

          {!isAuthenticated && onNavigateToAuth && (
            <div className="flex gap-2 pt-2.5 border-t border-white/10">
              <Button
                onClick={() => {
                  setMenuOpen(false);
                  onNavigateToAuth('login');
                }}
                variant="outline"
                size="sm"
                className="flex-1 gap-1.5 mobile-btn-sm"
                data-testid="button-quick-login"
              >
                <LogIn className="w-3.5 h-3.5" />
                Sign In
              </Button>
              <Button
                onClick={() => {
                  setMenuOpen(false);
                  onNavigateToAuth('register');
                }}
                size="sm"
                className="flex-1 gap-1.5 bg-profit hover:bg-profit/90 text-black mobile-btn-sm"
                data-testid="button-quick-signup"
              >
                <UserPlus className="w-3.5 h-3.5" />
                Sign Up
              </Button>
            </div>
          )}
        </div>
      )}

      <nav
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur-md md:hidden safe-area-bottom"
        data-testid="mobile-bottom-nav"
        role="navigation"
        aria-label="Main navigation"
      >
        <div className="flex items-center h-14 px-1">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className={cn(
              "flex flex-col items-center justify-center gap-0.5 mobile-touch-target px-1.5 rounded-xl transition-all touch-manipulation",
              menuOpen
                ? "text-profit"
                : "text-muted-foreground hover:text-foreground active:bg-muted/50"
            )}
            data-testid="nav-menu-toggle"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
          >
            <div className="relative">
              {menuOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <>
                  <Menu className="h-5 w-5" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-loss rounded-full" />
                  )}
                </>
              )}
            </div>
            <span className="text-[10px] font-medium">Menu</span>
          </button>

          <div className="flex-1 flex items-center justify-around">
            {navItems.map((item) => {
              const isActive = location === item.url || 
                (item.url === "/" && (location === "/" || location === "/agent")) ||
                (item.url !== "/" && location.startsWith(item.url));
              
              const accent = item.primary ? "text-primary" : "text-profit";
              return (
                <Link 
                  key={item.url} 
                  href={item.url}
                  className={cn(
                    "relative flex flex-col items-center justify-center gap-0.5 mobile-touch-target px-1.5 rounded-xl transition-all touch-manipulation",
                    isActive
                      ? accent
                      : item.primary
                        ? "text-primary/70 hover:text-primary active:bg-muted/50"
                        : "text-muted-foreground hover:text-foreground active:bg-muted/50"
                  )}
                  data-testid={`nav-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
                  aria-current={isActive ? "page" : undefined}
                  aria-label={item.title}
                >
                  <div className="relative">
                    <item.icon className={cn("h-5 w-5", isActive && "scale-110")} aria-hidden="true" />
                  </div>
                  <span className={cn(
                    "text-[10px] font-medium transition-all",
                    (isActive || item.primary) && "font-semibold"
                  )}>
                    {item.title}
                  </span>
                  {isActive && (
                    <div className={cn("absolute -bottom-0.5 w-1 h-1 rounded-full", item.primary ? "bg-primary" : "bg-profit")} aria-hidden="true" />
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>
    </>
  );
}
