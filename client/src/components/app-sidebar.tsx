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
  LogOut,
  ClipboardList,
  PieChart,
  ArrowUpDown,
  Layers,
  User,
  History,
  Sparkles,
  BarChart3,
  Shield,
  Sigma,
  Cpu,
  Rocket,
  Target,
  KeyRound,
  PlayCircle,
  HelpCircle,
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { useOnboarding } from "@/contexts/OnboardingContext";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";

// The trading agent is the flagship destination, presented on its own up top.
const primaryItem = {
  title: "Trading Agent",
  url: "/",
  icon: Cpu,
};

// Secondary AI feature — the conversational assistant.
const secondaryItems = [
  {
    title: "AI Chat",
    url: "/chat",
    icon: Bot,
  },
  {
    title: "Watch Demo",
    url: "/promo",
    icon: PlayCircle,
  },
  {
    title: "Strategies",
    url: "/strategies",
    icon: Target,
  },
  {
    title: "Runner Performance",
    url: "/strategy-performance",
    icon: History,
  },
  {
    title: "AI Recommendations",
    url: "/ai-recommendations",
    icon: Sparkles,
  },
  {
    title: "AI Providers",
    url: "/ai-providers",
    icon: KeyRound,
  },
];

// De-emphasized research & analysis tools, grouped together below the agent.
const researchItems = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "Options Chain",
    url: "/options",
    icon: Layers,
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
    title: "Strategy Templates",
    url: "/strategy-templates",
    icon: Rocket,
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
  {
    title: "P/L Simulator",
    url: "/pnl-simulator",
    icon: BarChart3,
  },
  {
    title: "VaR Calculator",
    url: "/var-calculator",
    icon: Shield,
  },
  {
    title: "Greeks Visualizer",
    url: "/greeks-visualizer",
    icon: Sigma,
  },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { openChecklist, helpHidden, showHelp } = useOnboarding();

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-2">
          <img 
            src="/logo.jpeg" 
            alt="Fincai" 
            className="h-8 w-8 rounded-lg object-cover"
          />
          <div>
            <h1 className="text-base font-semibold text-sidebar-foreground">
              Fincai
            </h1>
            <p className="text-xs text-muted-foreground">AI Trading Assistant</p>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {/* Flagship: the trading agent, given top billing on its own. */}
        <SidebarGroup>
          <SidebarGroupLabel>Flagship</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={location === primaryItem.url || location === "/agent"}
                  className="data-[active=true]:bg-sidebar-accent"
                  data-testid={`link-${primaryItem.title.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  <Link href={primaryItem.url}>
                    <primaryItem.icon className="h-4 w-4 text-primary" />
                    <span className="font-medium">{primaryItem.title}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Secondary AI features. */}
        <SidebarGroup>
          <SidebarGroupLabel>AI Features</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {secondaryItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                    data-testid={`link-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <Link href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* De-emphasized research & analysis tools. */}
        <SidebarGroup>
          <SidebarGroupLabel>Research &amp; Analysis</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {researchItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                    className="text-muted-foreground"
                    data-testid={`link-${item.title.toLowerCase().replace(/\s+/g, "-")}`}
                  >
                    <Link href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-4 gap-1">
        {helpHidden ? (
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 text-muted-foreground"
            onClick={showHelp}
            data-testid="button-show-getting-started"
          >
            <HelpCircle className="h-4 w-4" />
            <span>Show getting started</span>
          </Button>
        ) : (
          <Button
            variant="ghost"
            className="w-full justify-start gap-2"
            onClick={openChecklist}
            data-testid="button-getting-started"
          >
            <HelpCircle className="h-4 w-4" />
            <span>Getting started</span>
          </Button>
        )}
        <Button
          variant="ghost"
          className="w-full justify-start gap-2"
          onClick={() => window.location.href = '/api/logout'}
          data-testid="button-logout"
        >
          <LogOut className="h-4 w-4" />
          <span>Sign Out</span>
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
