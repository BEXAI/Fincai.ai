import { StrategyRecommendations } from "@/components/ai/StrategyRecommendations";
import { useEffect } from "react";

export default function AIRecommendationsPage() {
  useEffect(() => {
    document.title = "AI Strategy Recommendations | Fincai";
  }, []);

  return (
    <div className="container max-w-3xl mx-auto py-4 px-4" data-testid="page-ai-recommendations">
      <StrategyRecommendations />
    </div>
  );
}
