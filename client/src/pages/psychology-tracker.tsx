import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { PsychologyEntry } from "@shared/schema";
import {
  Brain,
  RefreshCw,
  AlertCircle,
  BookOpen,
  CheckCircle2,
  Smile,
  Frown,
  Meh,
  DollarSign,
  ShieldCheck,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";

const DEADLY_MISTAKES = [
  "Overleveraging - Taking positions that are too large relative to account size",
  "Revenge trading - Trading emotionally after a loss to 'get even'",
  "No stop loss - Entering trades without predetermined exit points",
  "Moving stop loss - Adjusting stop loss to avoid being stopped out",
  "Holding losers - Refusing to exit losing positions hoping they'll recover",
  "Cutting winners early - Exiting profitable positions prematurely",
  "Ignoring plan - Deviating from your trading strategy and rules",
];

const EMOTIONS: { value: string; label: string; icon: LucideIcon }[] = [
  { value: "confident", label: "Confident", icon: Smile },
  { value: "fearful", label: "Fearful", icon: Frown },
  { value: "greedy", label: "Greedy", icon: DollarSign },
  { value: "disciplined", label: "Disciplined", icon: ShieldCheck },
  { value: "anxious", label: "Anxious", icon: AlertTriangle },
  { value: "neutral", label: "Neutral", icon: Meh },
];

const EMOTION_MAP: Record<string, { label: string; icon: LucideIcon }> = Object.fromEntries(
  EMOTIONS.map((e) => [e.value, { label: e.label, icon: e.icon }])
);

interface KnowledgeBase {
  powerPrinciples?: string[];
}

type EntryPayload = {
  entryType: "emotion" | "mistakes";
  emotion?: string;
  notes?: string;
  mistakes?: string[];
};

import { useSeo } from "@/components/seo";

export default function PsychologyTracker() {
  useSeo({ path: "/psychology" });
  const { toast } = useToast();
  const [currentPrincipleIndex, setCurrentPrincipleIndex] = useState(0);
  const [selectedMistakes, setSelectedMistakes] = useState<string[]>([]);
  const [emotionNotes, setEmotionNotes] = useState("");
  const [selectedEmotion, setSelectedEmotion] = useState("");

  const { data: knowledgeBase } = useQuery<KnowledgeBase>({
    queryKey: ["/api/knowledge"],
  });

  const { data: entries = [], isLoading: entriesLoading } = useQuery<PsychologyEntry[]>({
    queryKey: ["/api/psychology-entries"],
  });

  const emotionLogs = entries.filter((entry) => entry.entryType === "emotion");
  const mistakeEntries = entries.filter((entry) => entry.entryType === "mistakes");

  // Most recent "deadly mistakes" self-assessment logged today (entries are newest-first).
  const todayKey = new Date().toDateString();
  const todaysAssessment = mistakeEntries.find(
    (entry) => entry.createdAt && new Date(entry.createdAt).toDateString() === todayKey
  );

  const saveEntry = useMutation({
    mutationFn: async (payload: EntryPayload) => {
      const res = await apiRequest("POST", "/api/psychology-entries", payload);
      return (await res.json()) as PsychologyEntry;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/psychology-entries"] });
    },
    onError: (error: any) => {
      toast({
        title: "Could not save",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const powerPrinciples = knowledgeBase?.powerPrinciples || [
    "The market doesn't care about your emotions—stay disciplined.",
    "Cut losses quickly and let winners run.",
    "Plan your trades and trade your plan.",
    "Risk management is more important than being right.",
    "Consistency beats occasional brilliance.",
    "Your worst enemy in trading is your own psychology.",
    "Never risk more than you can afford to lose.",
    "Patience is a trader's greatest virtue.",
    "The best trade is sometimes no trade.",
    "Discipline and emotional control separate winners from losers.",
  ];

  const handleRotatePrinciple = () => {
    setCurrentPrincipleIndex((prev) => (prev + 1) % powerPrinciples.length);
  };

  const handleSaveMistakes = () => {
    saveEntry.mutate(
      { entryType: "mistakes", mistakes: selectedMistakes },
      {
        onSuccess: () => {
          toast({
            title: "Mistakes Logged",
            description: "Your daily self-assessment has been recorded.",
          });
        },
      }
    );
  };

  const handleSaveEmotion = () => {
    if (!selectedEmotion) {
      toast({
        title: "Emotion Required",
        description: "Please select an emotion before saving.",
        variant: "destructive",
      });
      return;
    }

    saveEntry.mutate(
      { entryType: "emotion", emotion: selectedEmotion, notes: emotionNotes },
      {
        onSuccess: () => {
          toast({
            title: "Emotion Logged",
            description: "Your emotional state has been recorded.",
          });
          setEmotionNotes("");
          setSelectedEmotion("");
        },
      }
    );
  };

  const toggleMistake = (mistake: string) => {
    setSelectedMistakes((prev) =>
      prev.includes(mistake)
        ? prev.filter((m) => m !== mistake)
        : [...prev, mistake]
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold" data-testid="text-page-title">Psychology Tracker</h1>
        <p className="text-muted-foreground">
          Develop mental discipline and track emotional patterns
        </p>
      </div>

      <Card className="bg-gradient-to-br from-chart-1/10 to-chart-2/10" data-testid="card-daily-affirmation">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Daily Power Principle
          </CardTitle>
          <CardDescription>
            Reinforce positive trading mindset with proven principles
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-6 bg-background/80 rounded-lg border-2 border-primary/20">
            <p className="text-lg font-medium text-center leading-relaxed" data-testid="text-power-principle">
              "{powerPrinciples[currentPrincipleIndex]}"
            </p>
          </div>
          <div className="flex justify-center">
            <Button
              variant="outline"
              onClick={handleRotatePrinciple}
              className="gap-2"
              data-testid="button-rotate-principle"
            >
              <RefreshCw className="h-4 w-4" />
              Show Another Principle
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card data-testid="card-deadly-mistakes">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            Deadly Mistakes Checklist
          </CardTitle>
          <CardDescription>
            Daily self-assessment: Did I make any of these mistakes today?
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            {DEADLY_MISTAKES.map((mistake, index) => {
              const shortName = mistake.split(" - ")[0];
              const description = mistake.split(" - ")[1];
              return (
                <div
                  key={index}
                  className="flex items-start gap-3 p-4 bg-muted/30 rounded-lg hover-elevate"
                  data-testid={`mistake-item-${index}`}
                >
                  <Checkbox
                    checked={selectedMistakes.includes(mistake)}
                    onCheckedChange={() => toggleMistake(mistake)}
                    className="mt-1"
                    data-testid={`checkbox-mistake-${index}`}
                  />
                  <div className="flex-1">
                    <div className="font-medium">{shortName}</div>
                    <div className="text-sm text-muted-foreground">{description}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {selectedMistakes.length > 0 && (
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-md">
              <p className="text-sm font-medium text-destructive mb-2">
                {selectedMistakes.length} mistake{selectedMistakes.length !== 1 ? "s" : ""} identified
              </p>
              <p className="text-xs text-muted-foreground">
                Acknowledging mistakes is the first step to improvement. Review your trading plan and identify specific steps to avoid these errors.
              </p>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              onClick={handleSaveMistakes}
              className="flex-1"
              disabled={saveEntry.isPending}
              data-testid="button-save-mistakes"
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Save Daily Assessment
            </Button>
            <Button
              variant="outline"
              onClick={() => setSelectedMistakes([])}
              data-testid="button-clear-mistakes"
            >
              Clear
            </Button>
          </div>

          {todaysAssessment && (
            <div className="pt-4 border-t">
              <p className="text-sm text-muted-foreground mb-2" data-testid="text-todays-assessment">
                Last saved today: {todaysAssessment.mistakes?.length ?? 0} mistake
                {(todaysAssessment.mistakes?.length ?? 0) !== 1 ? "s" : ""} acknowledged
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card data-testid="card-emotion-journal">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              Emotion Journal
            </CardTitle>
            <CardDescription>
              Log your emotional state and trading mindset
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="emotion">Current Emotion</Label>
              <Select value={selectedEmotion} onValueChange={setSelectedEmotion}>
                <SelectTrigger data-testid="select-emotion">
                  <SelectValue placeholder="How are you feeling?" />
                </SelectTrigger>
                <SelectContent>
                  {EMOTIONS.map((emotion) => {
                    const Icon = emotion.icon;
                    return (
                      <SelectItem key={emotion.value} value={emotion.value}>
                        <span className="flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          {emotion.label}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="emotionNotes">Notes</Label>
              <Textarea
                id="emotionNotes"
                value={emotionNotes}
                onChange={(e) => setEmotionNotes(e.target.value)}
                placeholder="What triggered this emotion? How is it affecting your trading decisions?"
                rows={4}
                data-testid="textarea-emotion-notes"
              />
            </div>

            <Button
              onClick={handleSaveEmotion}
              className="w-full"
              disabled={saveEntry.isPending}
              data-testid="button-save-emotion"
            >
              Log Emotion
            </Button>
          </CardContent>
        </Card>

        <Card data-testid="card-recent-emotions">
          <CardHeader>
            <CardTitle>Recent Emotional States</CardTitle>
            <CardDescription>
              Track patterns in your trading psychology
            </CardDescription>
          </CardHeader>
          <CardContent>
            {entriesLoading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-16 w-full rounded-md" />
                ))}
              </div>
            ) : emotionLogs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm" data-testid="text-no-emotions">
                No emotion logs yet. Start tracking your emotional state.
              </div>
            ) : (
              <div className="space-y-3">
                {emotionLogs.slice(0, 5).map((log) => {
                  const meta = log.emotion ? EMOTION_MAP[log.emotion] : undefined;
                  const Icon = meta?.icon;
                  return (
                    <div
                      key={log.id}
                      className="p-3 bg-muted/30 rounded-md space-y-2"
                      data-testid={`emotion-log-${log.id}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="outline" className="capitalize gap-1">
                          {Icon && <Icon className="h-3 w-3" />}
                          {meta?.label ?? log.emotion}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {log.createdAt ? new Date(log.createdAt).toLocaleString() : ""}
                        </span>
                      </div>
                      {log.notes && (
                        <p className="text-sm text-muted-foreground">{log.notes}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-muted/30" data-testid="card-psychology-tips">
        <CardHeader>
          <CardTitle className="text-lg">Trading Psychology Tips</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-start gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-chart-2 mt-2" />
            <p className="text-muted-foreground">
              <strong className="text-foreground">Pre-trade ritual:</strong> Review your checklist before every trade to ensure emotional clarity
            </p>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-chart-2 mt-2" />
            <p className="text-muted-foreground">
              <strong className="text-foreground">Break after losses:</strong> Take a 15-minute break after 2 consecutive losses to reset emotionally
            </p>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-chart-2 mt-2" />
            <p className="text-muted-foreground">
              <strong className="text-foreground">Daily review:</strong> End each trading day with a brief journal entry to identify emotional patterns
            </p>
          </div>
          <div className="flex items-start gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-chart-2 mt-2" />
            <p className="text-muted-foreground">
              <strong className="text-foreground">Correlate emotions with trades:</strong> Review which emotional states lead to your best and worst performance
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
