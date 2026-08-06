import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { TimelineVisualizer } from "@/components/timeline-visualizer";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Seo } from "@/components/seo";
import {
  TrendingUp,
  AlertTriangle,
  Target,
  DollarSign,
  Calendar,
  Info,
} from "lucide-react";

export default function WalmartCaseStudy() {
  const [activeTab, setActiveTab] = useState("conservative");

  const timeline = [
    {
      date: "2025-12-09",
      label: "Walmart Nasdaq Listing",
      description: "WMT begins trading on Nasdaq Global Select Market",
      type: "listing" as const,
    },
    {
      date: "2025-12-13",
      label: "Nasdaq-100 Announcement",
      description: "Expected reconstitution announcement (typically 2nd Friday)",
      type: "announcement" as const,
    },
    {
      date: "2025-12-20",
      label: "Reconstitution Effective",
      description: "Index changes take effect (after 3rd Friday of December)",
      type: "reconstitution" as const,
    },
  ];

  const strategies = {
    conservative: {
      name: "QQQ January 2026 Call Debit Spread",
      structure: [
        "Buy QQQ Jan 16, 2026 $510 calls",
        "Sell QQQ Jan 16, 2026 $520 calls",
        "Net Debit: ~$2.50-$3.00 per spread ($250-300 per contract)",
      ],
      rationale: [
        "Caps risk while capturing upside through the reconstitution period",
        "Lower breakeven point than naked calls",
        "Profits if QQQ moves ~2-3% higher by January",
      ],
      entryTiming: "November 25-29 (before Thanksgiving week)",
      exitTargets: [
        "Exit if spread value reaches $5.00+ (67-100% gain)",
        "Stop loss if QQQ drops below $500",
      ],
      riskFactors: [
        "Limited upside capped at $520 strike",
        "Time decay on both legs",
        "News already priced in",
      ],
      maxProfit: "$200-250 per spread (67-100% ROI)",
      maxLoss: "$250-300 (premium paid)",
      breakeven: "$512.50-513.00",
    },
    moderate: {
      name: "QQQ December 31, 2025 At-the-Money Calls",
      structure: [
        "Buy QQQ Dec 31, 2025 $505 calls",
        "Premium: ~$6.00-7.00 per contract ($600-700)",
      ],
      rationale: [
        "Captures both Dec 9 listing event and Dec reconstitution announcement",
        "Shorter duration = lower premium than January options",
        "Direct play on increased QQQ demand from index tracking requirements",
      ],
      entryTiming: "November 25-29 (optimal window before event premium spike)",
      exitTargets: [
        "Exit if QQQ reaches $515-520 (2-3% move) for ~50-100% gain",
        "Scale out at 50% gain, trail stop on remainder",
      ],
      riskFactors: [
        "Accelerated time decay in final 30 days",
        "QQQ already up significantly in 2025",
        "General market risk if year-end rally falters",
      ],
      maxProfit: "$350-1000 per contract (50-150% ROI)",
      maxLoss: "$600-700 (premium paid)",
      breakeven: "$511-512",
    },
    aggressive: {
      name: "QQQ January 2026 Out-of-the-Money Calls",
      structure: [
        "Buy QQQ Jan 16, 2026 $520 calls",
        "Premium: ~$3.00-4.00 per contract ($300-400)",
      ],
      rationale: [
        "Highest delta leverage if QQQ breaks above $520",
        "Captures momentum from both Walmart addition and year-end rally",
        "Limited risk (premium paid) with asymmetric upside",
      ],
      entryTiming: "November 25-29 before event premium increases",
      exitTargets: [
        "Scale out at 100% gain",
        "Trail stop on remainder above $525",
        "Exit all positions by Dec 18-20",
      ],
      riskFactors: [
        "Requires QQQ to move >3% to be profitable",
        "Higher probability of total loss",
        "Implied volatility risk",
      ],
      maxProfit: "Unlimited above $520 (200%+ potential)",
      maxLoss: "$300-400 (premium paid)",
      breakeven: "$523-524",
    },
  };

  const currentStrategy = strategies[activeTab as keyof typeof strategies];

  return (
    <div className="space-y-6">
      <Seo path="/walmart" />
      <div>
        <h1 className="text-2xl font-semibold">Walmart Nasdaq Case Study</h1>
        <p className="text-muted-foreground">
          Options strategies for Walmart's historic exchange transfer and Nasdaq-100
          inclusion
        </p>
        <p className="text-sm text-muted-foreground mt-2" data-testid="text-hypothetical-illustration">
          Hypothetical illustration of options mechanics only — not a projection of
          results, not past performance, and not a recommendation. All figures are
          illustrative.
        </p>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Key Insight</AlertTitle>
        <AlertDescription>
          With an $852B market cap, Walmart will be a top 10 holding in Nasdaq-100 upon
          inclusion. Passive funds tracking QQQ will need to purchase ~$8-12B in WMT
          shares, potentially driving 2-5% QQQ gains during the rebalancing week.
        </AlertDescription>
      </Alert>

      <TimelineVisualizer events={timeline} title="Event Timeline" />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Strategy Comparison
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="conservative" data-testid="tab-conservative">
                Conservative
              </TabsTrigger>
              <TabsTrigger value="moderate" data-testid="tab-moderate">
                Moderate
              </TabsTrigger>
              <TabsTrigger value="aggressive" data-testid="tab-aggressive">
                Aggressive
              </TabsTrigger>
            </TabsList>

            {(["conservative", "moderate", "aggressive"] as const).map((profile) => (
              <TabsContent key={profile} value={profile} className="space-y-6 mt-6">
                <div>
                  <h3 className="text-lg font-medium mb-2">{strategies[profile].name}</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    {profile === "conservative" &&
                      "Lower cost, defined risk, moderate upside"}
                    {profile === "moderate" &&
                      "Balanced risk/reward for the specific event"}
                    {profile === "aggressive" && "Maximum leverage for strong conviction"}
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Target className="h-4 w-4" />
                        Structure
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2 text-sm">
                        {strategies[profile].structure.map((item, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-muted-foreground mt-0.5">•</span>
                            <span className="font-mono text-xs">{item}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <DollarSign className="h-4 w-4" />
                        Risk/Reward
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Max Profit</span>
                        <span className="font-mono text-profit font-medium">
                          {strategies[profile].maxProfit}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Max Loss</span>
                        <span className="font-mono text-loss font-medium">
                          {strategies[profile].maxLoss}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Breakeven</span>
                        <span className="font-mono font-medium">
                          {strategies[profile].breakeven}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Info className="h-4 w-4" />
                      Rationale
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2 text-sm">
                      {strategies[profile].rationale.map((item, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="text-muted-foreground mt-0.5">•</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>

                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        Entry & Exit
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <div>
                        <p className="text-muted-foreground mb-1">Entry Timing</p>
                        <p className="font-medium">{strategies[profile].entryTiming}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground mb-1">Exit Targets</p>
                        <ul className="space-y-1">
                          {strategies[profile].exitTargets.map((target, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                              <span className="text-muted-foreground">•</span>
                              <span>{target}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-destructive" />
                        Risk Factors
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2 text-sm">
                        {strategies[profile].riskFactors.map((risk, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            <span className="text-destructive mt-0.5">•</span>
                            <span>{risk}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Disclaimer</AlertTitle>
        <AlertDescription>
          Every figure on this page is a hypothetical illustration, not a projection
          of results or past performance. Options trading involves substantial risk.
          This is not financial advice. Do your own research, consider your risk
          tolerance, and consult with a licensed financial advisor before trading.
        </AlertDescription>
      </Alert>
    </div>
  );
}
