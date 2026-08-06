import { useState, useEffect, useCallback, useRef } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  TrendingUp,
  LineChart,
  Calculator,
  BookOpen,
  Eye,
  GraduationCap,
  Scale,
  BookText,
  Brain,
  Activity,
  Bot,
  Menu,
  X,
  LogIn,
  UserPlus,
  Moon,
  Sun,
  Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/components/theme-provider";
import { useAuthContext } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";

interface PriceAlert {
  id: number;
  status: string;
}

const menuItems = [
  {
    title: "AI Trader",
    url: "/",
    icon: Bot,
  },
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "Trading Education",
    url: "/education",
    icon: GraduationCap,
  },
  {
    title: "Strategy Builder",
    url: "/builder",
    icon: Calculator,
  },
  {
    title: "Market Analysis",
    url: "/market-analysis",
    icon: Activity,
  },
  {
    title: "Position Sizing",
    url: "/position-sizing",
    icon: Scale,
  },
  {
    title: "Trade Journal",
    url: "/trade-journal",
    icon: BookText,
  },
  {
    title: "Performance",
    url: "/performance",
    icon: TrendingUp,
  },
  {
    title: "Psychology Tracker",
    url: "/psychology",
    icon: Brain,
  },
  {
    title: "Walmart Case Study",
    url: "/walmart",
    icon: BookOpen,
  },
  {
    title: "Compare Strategies",
    url: "/compare",
    icon: LineChart,
  },
  {
    title: "Watchlist",
    url: "/watchlist",
    icon: Eye,
  },
];

interface ToggleableMenuProps {
  className?: string;
  onNavigateToAuth?: (mode: 'login' | 'register') => void;
}

export function ToggleableMenu({ className, onNavigateToAuth }: ToggleableMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [location] = useLocation();
  const menuRef = useRef<HTMLDivElement>(null);
  const toggleButtonRef = useRef<HTMLButtonElement>(null);
  const { theme, setTheme } = useTheme();
  const { isAuthenticated } = useAuthContext();

  const { data: alerts } = useQuery<PriceAlert[]>({
    queryKey: ["/api/alerts"],
    refetchInterval: 60000,
  });

  const unreadCount = alerts?.filter(a => a.status === "triggered").length || 0;

  const closeMenu = useCallback(() => {
    setIsOpen(false);
    toggleButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        closeMenu();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      const firstLink = menuRef.current?.querySelector('a');
      firstLink?.focus();
    }

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, closeMenu]);

  const handleAuthClick = (mode: 'login' | 'register') => {
    closeMenu();
    onNavigateToAuth?.(mode);
  };

  return (
    <>
      <button
        ref={toggleButtonRef}
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "fixed z-[30] w-12 h-12 rounded-full flex items-center justify-center",
          "glass-header backdrop-blur-xl",
          "transition-all duration-300 touch-manipulation",
          "hover:scale-105 active:scale-95",
          "motion-safe:transition-transform",
          className
        )}
        style={{ 
          top: "calc(env(safe-area-inset-top, 20px) + 16px)",
          left: "16px"
        }}
        data-testid="button-toggle-menu"
        aria-label={isOpen ? "Close menu" : "Open menu"}
        aria-expanded={isOpen}
        aria-controls="main-navigation"
      >
        {isOpen ? (
          <X className="w-5 h-5 text-foreground" />
        ) : (
          <Menu className="w-5 h-5 text-foreground" />
        )}
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-[28] bg-black/40 backdrop-blur-sm motion-safe:transition-opacity"
          onClick={closeMenu}
          data-testid="menu-backdrop"
          aria-hidden="true"
        />
      )}

      <div
        ref={menuRef}
        id="main-navigation"
        role="navigation"
        aria-label="Main navigation"
        className={cn(
          "fixed z-[29] top-0 left-0 h-full w-[280px] max-w-[85vw]",
          "glass-header backdrop-blur-xl border-r border-white/10",
          "motion-safe:transition-transform duration-300 ease-out",
          "overflow-y-auto flex flex-col",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
        style={{ paddingTop: "calc(env(safe-area-inset-top, 20px) + 80px)" }}
        data-testid="toggleable-menu-panel"
      >
        <div className="p-4 border-b border-white/10 mb-2">
          <div className="flex items-center gap-3">
            <img 
              src="/logo.jpeg" 
              alt="Fincai" 
              className="w-10 h-10 rounded-xl object-cover"
            />
            <div className="flex-1">
              <h2 className="text-base font-semibold text-foreground">
                Fincai
              </h2>
              <p className="text-xs text-muted-foreground">AI Trading Assistant</p>
            </div>
            <Link
              href="/alerts"
              onClick={closeMenu}
              className="relative w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
              data-testid="button-alerts-menu"
              aria-label={unreadCount > 0 ? `Alerts, ${unreadCount} notifications` : "Alerts"}
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <Badge 
                  className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 text-xs bg-loss text-white border-0 font-semibold"
                  data-testid="notification-badge-menu"
                >
                  {unreadCount > 9 ? "9+" : unreadCount}
                </Badge>
              )}
            </Link>
            <button
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
              data-testid="button-theme-toggle-menu"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? (
                <Moon className="w-4 h-4" />
              ) : (
                <Sun className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        <div className="px-3 py-2 flex-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-3 mb-2">
            Analysis Tools
          </p>
          
          <nav className="space-y-1">
            {menuItems.map((item) => {
              const isActive = location === item.url;
              const Icon = item.icon;
              
              return (
                <Link
                  key={item.title}
                  href={item.url}
                  onClick={closeMenu}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-xl",
                    "transition-all duration-200 touch-manipulation",
                    "min-h-[44px]",
                    isActive
                      ? "bg-profit/20 text-profit"
                      : "text-foreground/80 hover:bg-white/5 active:bg-white/10"
                  )}
                  data-testid={`menu-link-${item.title.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <Icon className={cn(
                    "w-5 h-5 flex-shrink-0",
                    isActive ? "text-profit" : "text-muted-foreground"
                  )} />
                  <span className="text-sm font-medium">{item.title}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {!isAuthenticated && onNavigateToAuth && (
          <div className="p-4 border-t border-white/10 space-y-2">
            <Button
              onClick={() => handleAuthClick('login')}
              variant="outline"
              className="w-full gap-2 justify-start"
              data-testid="button-menu-login"
            >
              <LogIn className="w-4 h-4" />
              Sign In
            </Button>
            <Button
              onClick={() => handleAuthClick('register')}
              className="w-full gap-2 justify-start bg-profit hover:bg-profit/90 text-black"
              data-testid="button-menu-signup"
            >
              <UserPlus className="w-4 h-4" />
              Create Account
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
