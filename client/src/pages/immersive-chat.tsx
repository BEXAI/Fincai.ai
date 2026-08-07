import { useState, useEffect } from "react";
import { FullScreenChartBackground } from "@/components/chart/FullScreenChartBackground";
import { ChartOverlayGradient } from "@/components/chart/ChartOverlayGradient";
import { TimeRangeSelector } from "@/components/chart/TimeRangeSelector";
import { TransparentChatOverlay } from "@/components/chat/TransparentChatOverlay";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { API_BASE_URL } from "@/lib/queryClient";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { ChevronDown, Menu, LayoutDashboard, TrendingUp, LineChart, BookOpen, Bell, Cpu, MessageSquare, Target } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { ThemeToggle } from "@/components/theme-toggle";
import { Seo } from "@/components/seo";

type TimeRange = "1D" | "1W" | "1M" | "3M" | "YTD" | "1Y" | "ALL";
type ChatMode = "minimized" | "expanded" | "fullscreen";

const WATCHLIST_SYMBOLS = ["SPY", "QQQ", "AAPL", "MSFT", "NVDA", "TSLA", "GOOGL", "AMZN"] as const;

let hasPrefetched = false;

function usePrefetchWatchlist() {
  useEffect(() => {
    if (hasPrefetched) return;
    
    const prefetch = async () => {
      try {
        hasPrefetched = true;
        await fetch(`${API_BASE_URL}/api/market/prefetch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ symbols: WATCHLIST_SYMBOLS }),
        });
      } catch (e) {
        hasPrefetched = false;
      }
    };
    
    const timer = setTimeout(prefetch, 500);
    return () => clearTimeout(timer);
  }, []);
}

interface ImmersiveChatProps {
  isAnonymous?: boolean;
  onNavigateToAuth?: (mode: 'login' | 'register') => void;
}

function CompactPriceBadge({ 
  symbol, 
  onTap,
  showPicker 
}: { 
  symbol: string; 
  onTap: () => void;
  showPicker: boolean;
}) {
  const { data: quoteData, isLoading, isFetching } = useQuery<{
    symbol: string;
    price: number;
    change: number;
    changePercent: number;
  }>({
    queryKey: ["/api/market/quote", symbol],
    refetchInterval: 10000, // Refresh every 10 seconds for live data
    staleTime: 5000,
  });

  const isPositive = (quoteData?.change ?? 0) >= 0;
  const changeSign = isPositive ? "+" : "";

  return (
    <button
      onClick={onTap}
      className={cn(
        "fixed z-[25] left-1/2 -translate-x-1/2 glass-key rounded-full px-3 sm:px-4 py-2.5 sm:py-2",
        "flex items-center gap-1.5 sm:gap-2 transition-all min-h-[44px] sm:min-h-[36px]",
        "hover:scale-[1.02] active:scale-[0.98]"
      )}
      style={{ top: "calc(env(safe-area-inset-top, 12px) + 12px)" }}
      data-testid="compact-price-badge"
    >
      <div className="relative flex items-center">
        <div className={cn(
          "w-1.5 h-1.5 rounded-full mr-1.5",
          isFetching ? "bg-amber-400 animate-pulse" : "bg-profit"
        )} />
        <span className="text-xs sm:text-sm font-semibold text-white">{symbol}</span>
      </div>
      {isLoading ? (
        <span className="text-xs sm:text-sm text-white/60">Loading...</span>
      ) : (
        <>
          <span className="text-xs sm:text-sm font-bold text-white tabular-nums">
            ${quoteData?.price?.toFixed(2) ?? "---"}
          </span>
          <span className={cn(
            "text-[10px] sm:text-xs font-medium tabular-nums",
            isPositive ? "text-profit" : "text-loss"
          )}>
            {changeSign}{quoteData?.changePercent?.toFixed(2) ?? "0.00"}%
          </span>
        </>
      )}
      <ChevronDown className={cn(
        "w-3 h-3 sm:w-3.5 sm:h-3.5 text-white/60 transition-transform",
        showPicker && "rotate-180"
      )} />
    </button>
  );
}

const PRIMARY_NAV = { href: "/", label: "Trading Agent", icon: Cpu };

const SECONDARY_NAV = [
  { href: "/chat", label: "AI Chat", icon: MessageSquare },
  { href: "/strategies", label: "Strategies", icon: Target },
];

const RESEARCH_NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/market-analysis", label: "Market Analysis", icon: TrendingUp },
  { href: "/builder", label: "Strategy Builder", icon: LineChart },
  { href: "/education", label: "Education", icon: BookOpen },
  { href: "/alerts", label: "Alerts", icon: Bell },
];

export default function ImmersiveChat({ 
  isAnonymous = false,
  onNavigateToAuth,
}: ImmersiveChatProps) {
  const [symbol, setSymbol] = useState("SPY");
  const [timeRange, setTimeRange] = useState<TimeRange>("1D");
  const [chatMode, setChatMode] = useState<ChatMode>("minimized");
  const [showSymbolPicker, setShowSymbolPicker] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [, navigate] = useLocation();
  
  usePrefetchWatchlist();
  
  const isChatActive = chatMode !== "minimized";
  
  const handleSymbolSelect = (newSymbol: string) => {
    setSymbol(newSymbol);
    setShowSymbolPicker(false);
  };
  
  return (
    <div 
      className="fixed inset-0 bg-background overflow-hidden"
      data-testid="immersive-chat-page"
    >
      <Seo path="/chat" />
      <FullScreenChartBackground
        symbol={symbol}
        timeRange={timeRange}
        isDimmed={isChatActive}
      />
      
      <ChartOverlayGradient 
        intensity={isChatActive ? 1 : 0.6} 
      />
      
      {/* Hamburger Menu Button - Top Left */}
      {/* zIndex must stay inline: Button's hover-elevate utility forces z-index: 0
          with higher specificity than Tailwind z-* classes, which dropped this button
          behind the fullscreen chart (z-[1]) and made it unclickable. */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setMenuOpen(true)}
        className="fixed glass-key rounded-full min-h-[44px] min-w-[44px]"
        style={{ 
          top: "calc(env(safe-area-inset-top, 12px) + 12px)",
          left: "12px",
          zIndex: 30
        }}
        data-testid="button-menu-toggle"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5 text-white" />
      </Button>
      
      {/* Slide-out Menu */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="w-[280px] glass-panel border-r border-white/10 p-0">
          <SheetHeader className="px-4 py-6 border-b border-white/10">
            <SheetTitle className="text-xl font-bold bg-gradient-to-r from-primary to-amber-400 bg-clip-text text-transparent">
              fincai.ai
            </SheetTitle>
            <SheetDescription className="sr-only">Main navigation menu</SheetDescription>
          </SheetHeader>
          <nav className="flex flex-col p-2" data-testid="slide-menu-nav">
            {/* Flagship: the trading agent */}
            <button
              onClick={() => {
                setMenuOpen(false);
                navigate(PRIMARY_NAV.href);
              }}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-sm font-semibold text-foreground hover-elevate transition-colors text-left"
              data-testid={`nav-link-${PRIMARY_NAV.label.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <PRIMARY_NAV.icon className="h-5 w-5 text-primary" />
              {PRIMARY_NAV.label}
            </button>

            {/* Secondary AI features */}
            {SECONDARY_NAV.map((item) => (
              <button
                key={item.href}
                onClick={() => {
                  setMenuOpen(false);
                  navigate(item.href);
                }}
                className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-sm font-medium text-foreground/80 hover-elevate transition-colors text-left"
                data-testid={`nav-link-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <item.icon className="h-5 w-5 text-primary" />
                {item.label}
              </button>
            ))}

            {/* De-emphasized research & analysis */}
            <p className="px-4 pt-4 pb-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Research &amp; Analysis
            </p>
            {RESEARCH_NAV.map((item) => (
              <button
                key={item.href}
                onClick={() => {
                  setMenuOpen(false);
                  navigate(item.href);
                }}
                className="flex items-center gap-3 w-full px-4 py-2.5 rounded-lg text-sm text-muted-foreground hover-elevate transition-colors text-left"
                data-testid={`nav-link-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </button>
            ))}
          </nav>
          <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-white/10">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Theme</span>
              <ThemeToggle />
            </div>
          </div>
        </SheetContent>
      </Sheet>
      
      <CompactPriceBadge 
        symbol={symbol}
        onTap={() => setShowSymbolPicker(!showSymbolPicker)}
        showPicker={showSymbolPicker}
      />
      
      {showSymbolPicker && (
        <div 
          className="fixed z-[24] left-3 right-3 sm:left-4 sm:right-4 glass-panel rounded-2xl p-2.5 sm:p-3"
          style={{ top: "calc(env(safe-area-inset-top, 12px) + 56px)" }}
          data-testid="symbol-picker"
          role="listbox"
          aria-label="Select stock symbol"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setShowSymbolPicker(false);
            }
          }}
        >
          <div className="flex flex-wrap gap-1.5 sm:gap-2" role="group" aria-label="Stock symbols">
            {WATCHLIST_SYMBOLS.map((s, index) => (
              <button
                key={s}
                onClick={() => handleSymbolSelect(s)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleSymbolSelect(s);
                  }
                }}
                className={cn(
                  "px-3 sm:px-4 py-2.5 sm:py-2 rounded-xl text-xs sm:text-sm font-medium transition-all focus:outline-none focus:ring-2 focus:ring-profit/50 min-h-[44px] sm:min-h-[36px]",
                  s === symbol
                    ? "bg-profit text-black"
                    : "glass-key hover:scale-[1.02] active:scale-[0.98]"
                )}
                data-testid={`symbol-${s}`}
                role="option"
                aria-selected={s === symbol}
                tabIndex={0}
                autoFocus={index === 0}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}
      
      {chatMode !== "fullscreen" && (
        <TimeRangeSelector
          selected={timeRange}
          onChange={setTimeRange}
          className="fixed z-[15] left-4 right-4"
          style={{ 
            bottom: chatMode === "minimized" ? "230px" : "calc(50vh + 60px)",
            transition: "bottom 0.3s cubic-bezier(0.32, 0.72, 0, 1)"
          }}
        />
      )}
      
      <TransparentChatOverlay
        onModeChange={setChatMode}
        bottomOffset={48}
        isAnonymous={isAnonymous}
        onNavigateToAuth={onNavigateToAuth}
      />
      
      <MobileBottomNav onNavigateToAuth={onNavigateToAuth} />
    </div>
  );
}
