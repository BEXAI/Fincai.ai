import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  BookOpen,
  Search,
  AlertTriangle,
  TrendingUp,
  Target,
  Award,
  BarChart3,
  Brain,
  Shield,
  Zap,
} from "lucide-react";
import type { KnowledgeBase } from "@shared/schema";
import { Seo } from "@/components/seo";

export default function TradingEducation() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");

  const { data: documents, isLoading } = useQuery<KnowledgeBase[]>({
    queryKey: ["/api/knowledge"],
  });

  const filteredDocuments = useMemo(() => {
    if (!documents) return [];

    return documents.filter((doc) => {
      const matchesSearch =
        searchQuery === "" ||
        doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        doc.sourceTitle.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCategory =
        activeCategory === "all" || doc.category === activeCategory;

      return matchesSearch && matchesCategory;
    });
  }, [documents, searchQuery, activeCategory]);

  const categories = useMemo(() => {
    if (!documents) return ["all"];
    const cats = new Set(documents.map((doc) => doc.category));
    return ["all", ...Array.from(cats)];
  }, [documents]);

  const extractPowerPrinciples = (content: any): string[] => {
    if (!content) return [];
    
    if (content.power_principles?.principles) {
      return content.power_principles.principles.map((p: any) => 
        typeof p === 'string' ? p : p.principle || p.title || p.description || String(p)
      );
    }
    
    if (content.sections) {
      const principlesSection = content.sections.find(
        (s: any) => s.id === "power_principles" || s.title?.toLowerCase().includes("principle")
      );
      if (principlesSection?.bullets) {
        return principlesSection.bullets;
      }
    }
    
    return [];
  };

  const extractDeadlyMistakes = (content: any): string[] => {
    if (!content) return [];
    
    if (content.deadly_mistakes?.mistakes) {
      return content.deadly_mistakes.mistakes.map((m: any) => 
        typeof m === 'string' ? m : m.mistake || m.title || m.description || String(m)
      );
    }
    
    if (content.sections) {
      const mistakesSection = content.sections.find(
        (s: any) => s.id === "deadly_mistakes" || s.title?.toLowerCase().includes("mistake")
      );
      if (mistakesSection?.bullets) {
        return mistakesSection.bullets;
      }
    }
    
    return [];
  };

  const extractPerformanceMetrics = (content: any) => {
    if (!content) return null;
    
    if (content.performance_benchmarks) {
      return content.performance_benchmarks;
    }
    
    if (content.sections) {
      const metricsSection = content.sections.find(
        (s: any) => s.id === "performance_metrics" || s.title?.toLowerCase().includes("performance")
      );
      return metricsSection;
    }
    
    return null;
  };

  const extractMarketSelection = (content: any) => {
    if (!content) return null;
    return content.market_selection_criteria || null;
  };

  const extractStrategyConcepts = (content: any): any[] => {
    if (!content) return [];
    
    if (content.sections) {
      return content.sections.filter((s: any) => 
        s.id === "strategy_design" || 
        s.id === "trading_styles_and_trend_concepts" ||
        s.title?.toLowerCase().includes("strategy") ||
        s.title?.toLowerCase().includes("entry") ||
        s.title?.toLowerCase().includes("exit")
      );
    }
    
    return [];
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 bg-muted/20 animate-pulse rounded" />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-96 bg-muted/20 animate-pulse rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Seo path="/education" />
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <BookOpen className="h-6 w-6" />
          Trading Education Center
        </h1>
        <p className="text-muted-foreground mt-2">
          Advanced trading mechanics, strategies, and best practices from professional traders
        </p>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search by title, category, or source..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
            data-testid="input-search"
          />
        </div>
      </div>

      <Tabs value={activeCategory} onValueChange={setActiveCategory}>
        <TabsList data-testid="tabs-category-filter">
          {categories.map((cat) => (
            <TabsTrigger
              key={cat}
              value={cat}
              data-testid={`tab-${cat}`}
              className="capitalize"
            >
              {cat === "all" ? "All" : cat.replace(/_/g, " ")}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={activeCategory} className="mt-6 space-y-6">
          {filteredDocuments.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center">
                <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No documents found</h3>
                <p className="text-muted-foreground">
                  Try adjusting your search or category filter
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-6 md:grid-cols-1">
              {filteredDocuments.map((doc) => {
                const content = doc.content as any;
                const powerPrinciples = extractPowerPrinciples(content);
                const deadlyMistakes = extractDeadlyMistakes(content);
                const performanceMetrics = extractPerformanceMetrics(content);
                const marketSelection = extractMarketSelection(content);
                const strategyConcepts = extractStrategyConcepts(content);

                return (
                  <Card key={doc.id} data-testid={`card-document-${doc.id}`}>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <CardTitle className="text-xl mb-2">{doc.title}</CardTitle>
                          <div className="flex flex-wrap gap-2 items-center text-sm text-muted-foreground">
                            <Badge variant="secondary" data-testid={`badge-category-${doc.category}`}>
                              {doc.category.replace(/_/g, " ")}
                            </Badge>
                            <span>•</span>
                            <span>{doc.sourceTitle}</span>
                            {doc.sourceAuthor && (
                              <>
                                <span>•</span>
                                <span>by {doc.sourceAuthor}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent>
                      <Accordion type="multiple" className="w-full">
                        {powerPrinciples.length > 0 && (
                          <AccordionItem value="principles" data-testid="accordion-power-principles">
                            <AccordionTrigger>
                              <div className="flex items-center gap-2">
                                <Award className="h-4 w-4 text-primary" />
                                <span className="font-medium">Power Principles</span>
                                <Badge variant="outline" className="ml-2">
                                  {powerPrinciples.length}
                                </Badge>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent>
                              <ol className="space-y-4 pl-4">
                                {powerPrinciples.map((principle, idx) => (
                                  <li
                                    key={idx}
                                    className="flex gap-4"
                                    data-testid={`principle-${idx}`}
                                  >
                                    <span className="font-mono text-sm font-semibold text-primary min-w-[2rem]">
                                      {idx + 1}.
                                    </span>
                                    <span className="text-sm leading-relaxed">{principle}</span>
                                  </li>
                                ))}
                              </ol>
                            </AccordionContent>
                          </AccordionItem>
                        )}

                        {deadlyMistakes.length > 0 && (
                          <AccordionItem value="mistakes" data-testid="accordion-deadly-mistakes">
                            <AccordionTrigger>
                              <div className="flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 text-destructive" />
                                <span className="font-medium">7 Deadly Mistakes</span>
                                <Badge variant="outline" className="ml-2">
                                  {deadlyMistakes.length}
                                </Badge>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent>
                              <div className="space-y-4">
                                {deadlyMistakes.map((mistake, idx) => (
                                  <Card
                                    key={idx}
                                    className="border-destructive/20"
                                    data-testid={`mistake-${idx}`}
                                  >
                                    <CardContent className="p-4">
                                      <div className="flex gap-4">
                                        <span className="font-mono text-sm font-semibold text-destructive min-w-[2rem]">
                                          {idx + 1}.
                                        </span>
                                        <span className="text-sm leading-relaxed">{mistake}</span>
                                      </div>
                                    </CardContent>
                                  </Card>
                                ))}
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        )}

                        {performanceMetrics && (
                          <AccordionItem value="metrics" data-testid="accordion-performance-metrics">
                            <AccordionTrigger>
                              <div className="flex items-center gap-2">
                                <BarChart3 className="h-4 w-4 text-primary" />
                                <span className="font-medium">Performance Metrics</span>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent>
                              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                {performanceMetrics.win_rate && (
                                  <Card data-testid="metric-win-rate">
                                    <CardContent className="p-4">
                                      <div className="text-xs font-medium text-muted-foreground mb-2">
                                        Win Rate
                                      </div>
                                      <div className="font-mono text-xl font-semibold text-primary">
                                        {performanceMetrics.win_rate}
                                      </div>
                                    </CardContent>
                                  </Card>
                                )}
                                {performanceMetrics.profit_factor && (
                                  <Card data-testid="metric-profit-factor">
                                    <CardContent className="p-4">
                                      <div className="text-xs font-medium text-muted-foreground mb-2">
                                        Profit Factor
                                      </div>
                                      <div className="font-mono text-xl font-semibold text-primary">
                                        {performanceMetrics.profit_factor}
                                      </div>
                                    </CardContent>
                                  </Card>
                                )}
                                {performanceMetrics.max_drawdown && (
                                  <Card data-testid="metric-drawdown">
                                    <CardContent className="p-4">
                                      <div className="text-xs font-medium text-muted-foreground mb-2">
                                        Max Drawdown
                                      </div>
                                      <div className="font-mono text-xl font-semibold text-destructive">
                                        {performanceMetrics.max_drawdown}
                                      </div>
                                    </CardContent>
                                  </Card>
                                )}
                                {performanceMetrics.bullets && performanceMetrics.bullets.length > 0 && (
                                  <Card className="md:col-span-2 lg:col-span-3">
                                    <CardContent className="p-4">
                                      <ul className="space-y-2 text-sm">
                                        {performanceMetrics.bullets.map((bullet: string, idx: number) => (
                                          <li key={idx} className="flex gap-2">
                                            <span className="text-muted-foreground">•</span>
                                            <span className="font-mono text-xs">{bullet}</span>
                                          </li>
                                        ))}
                                      </ul>
                                    </CardContent>
                                  </Card>
                                )}
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        )}

                        {marketSelection && marketSelection.markets && (
                          <AccordionItem value="market-selection" data-testid="accordion-market-selection">
                            <AccordionTrigger>
                              <div className="flex items-center gap-2">
                                <TrendingUp className="h-4 w-4 text-primary" />
                                <span className="font-medium">Market Selection Criteria</span>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent>
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="border-b">
                                      <th className="text-left p-2 font-medium">Market</th>
                                      <th className="text-left p-2 font-medium">Capital</th>
                                      <th className="text-left p-2 font-medium">Leverage</th>
                                      <th className="text-left p-2 font-medium">Liquidity</th>
                                      <th className="text-left p-2 font-medium">Notes</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {marketSelection.markets.map((market: any, idx: number) => (
                                      <tr key={idx} className="border-b last:border-0" data-testid={`market-row-${idx}`}>
                                        <td className="p-2 font-medium">{market.market_type}</td>
                                        <td className="p-2 font-mono text-xs">
                                          {market.capital_required?.amount || market.capital_required}
                                        </td>
                                        <td className="p-2 font-mono text-xs">
                                          {market.leverage?.ratio || market.leverage}
                                        </td>
                                        <td className="p-2 text-xs">{market.liquidity}</td>
                                        <td className="p-2 text-xs text-muted-foreground">
                                          {market.pros && market.pros.length > 0 && (
                                            <span>{market.pros[0]}</span>
                                          )}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        )}

                        {strategyConcepts.length > 0 && (
                          <AccordionItem value="strategy" data-testid="accordion-entry-exit-rules">
                            <AccordionTrigger>
                              <div className="flex items-center gap-2">
                                <Target className="h-4 w-4 text-primary" />
                                <span className="font-medium">Entry/Exit Rules & Strategy Design</span>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent>
                              <div className="space-y-4">
                                {strategyConcepts.map((section: any, idx: number) => (
                                  <Card key={idx}>
                                    <CardHeader className="pb-4">
                                      <CardTitle className="text-sm font-medium flex items-center gap-2">
                                        <Zap className="h-4 w-4" />
                                        {section.title}
                                      </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                      {section.bullets && (
                                        <ul className="space-y-2 text-sm">
                                          {section.bullets.map((bullet: string, bidx: number) => (
                                            <li key={bidx} className="flex gap-2">
                                              <span className="text-primary mt-2">•</span>
                                              <span className="leading-relaxed">{bullet}</span>
                                            </li>
                                          ))}
                                        </ul>
                                      )}
                                    </CardContent>
                                  </Card>
                                ))}
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        )}

                        {content.sections && (
                          <AccordionItem value="all-sections" data-testid="accordion-all-sections">
                            <AccordionTrigger>
                              <div className="flex items-center gap-2">
                                <Brain className="h-4 w-4 text-primary" />
                                <span className="font-medium">All Topics</span>
                                <Badge variant="outline" className="ml-2">
                                  {content.sections.length}
                                </Badge>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent>
                              <div className="space-y-4">
                                {content.sections.map((section: any, idx: number) => (
                                  <Card key={idx}>
                                    <CardHeader className="pb-2">
                                      <CardTitle className="text-sm font-medium">
                                        {section.title}
                                      </CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                      {section.bullets && (
                                        <ul className="space-y-2 text-sm">
                                          {section.bullets.map((bullet: string, bidx: number) => (
                                            <li key={bidx} className="flex gap-2">
                                              <span className="text-muted-foreground mt-2">•</span>
                                              <span className="text-xs leading-relaxed">{bullet}</span>
                                            </li>
                                          ))}
                                        </ul>
                                      )}
                                    </CardContent>
                                  </Card>
                                ))}
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        )}
                      </Accordion>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
