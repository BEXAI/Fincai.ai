import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sparkles,
  Gem,
  KeyRound,
  CheckCircle2,
  ExternalLink,
  Trash2,
  Loader2,
  ShieldCheck,
  AlertCircle,
  BrainCircuit,
  Play,
  TrendingUp,
  TrendingDown,
  Minus,
  Scale,
  Info,
} from "lucide-react";
import {
  AI_PROVIDERS,
  PROVIDER_MODELS,
  type AiProvider,
  type AnalysisProvider,
} from "@shared/schema";
import { Seo } from "@/components/seo";

interface ProviderStatus {
  provider: AiProvider;
  keyHint: string;
  updatedAt: string | null;
}

interface ProvidersResponse {
  providers: ProviderStatus[];
  encryptionConfigured: boolean;
  activeProvider: AnalysisProvider;
  activeModel: string | null;
}

interface AgentSignal {
  agent: "technical" | "sentiment" | "fundamental";
  signal: number;
  confidence: number;
  reasoning: string;
}

interface AnalysisProviderMeta {
  provider: string;
  model: string;
  label: string;
  fallbackUsed?: boolean;
}

interface AnalysisResult {
  symbol: string;
  consensus: {
    signal: number;
    confidence: number;
    recommendation:
      | "strong_buy"
      | "buy"
      | "hold"
      | "sell"
      | "strong_sell";
  };
  agents: AgentSignal[];
  bullBearDebate: {
    bullCase: string;
    bearCase: string;
    winner: "bull" | "bear" | "neutral";
  };
  analysisProvider: AnalysisProviderMeta;
}

const PROVIDER_META: Record<
  AiProvider,
  {
    name: string;
    blurb: string;
    models: string;
    placeholder: string;
    keyUrl: string;
    Icon: typeof Sparkles;
  }
> = {
  openai: {
    name: "OpenAI",
    blurb:
      "Connect your OpenAI account so your agents can reason with GPT models.",
    models: "GPT-4o · o1",
    placeholder: "sk-...",
    keyUrl: "https://platform.openai.com/api-keys",
    Icon: Sparkles,
  },
  gemini: {
    name: "Google Gemini",
    blurb:
      "Connect Google AI Studio so your agents can reason with Gemini models.",
    models: "Gemini 1.5 Pro",
    placeholder: "AIza...",
    keyUrl: "https://aistudio.google.com/app/apikey",
    Icon: Gem,
  },
};

function ProviderCard({
  provider,
  connected,
  disabled,
}: {
  provider: AiProvider;
  connected: ProviderStatus | undefined;
  disabled: boolean;
}) {
  const meta = PROVIDER_META[provider];
  const { toast } = useToast();
  const [apiKey, setApiKey] = useState("");

  const connect = useMutation({
    mutationFn: async (key: string) => {
      const res = await apiRequest("POST", `/api/ai-providers/${provider}`, {
        apiKey: key,
      });
      return res.json();
    },
    onSuccess: () => {
      setApiKey("");
      queryClient.invalidateQueries({ queryKey: ["/api/ai-providers"] });
      toast({
        title: `${meta.name} connected`,
        description: "Your key is encrypted and stored securely.",
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Could not connect",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const disconnect = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/ai-providers/${provider}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-providers"] });
      toast({ title: `${meta.name} disconnected` });
    },
    onError: (err: Error) => {
      toast({
        title: "Could not disconnect",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const { Icon } = meta;

  return (
    <Card data-testid={`card-provider-${provider}`}>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle
                className="text-base"
                data-testid={`text-provider-name-${provider}`}
              >
                {meta.name}
              </CardTitle>
              <p className="text-xs text-muted-foreground">{meta.models}</p>
            </div>
          </div>
          {connected ? (
            <Badge
              variant="secondary"
              className="gap-1"
              data-testid={`badge-status-${provider}`}
            >
              <CheckCircle2 className="h-3 w-3 text-profit" />
              Connected
            </Badge>
          ) : (
            <Badge variant="outline" data-testid={`badge-status-${provider}`}>
              Not connected
            </Badge>
          )}
        </div>
        <CardDescription className="pt-2">{meta.blurb}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {connected ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-profit" />
              <span>Key on file</span>
              <code
                className="rounded bg-muted px-1.5 py-0.5 text-xs"
                data-testid={`text-key-hint-${provider}`}
              >
                {connected.keyHint}
              </code>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={() => disconnect.mutate()}
              disabled={disconnect.isPending}
              data-testid={`button-disconnect-${provider}`}
            >
              {disconnect.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Disconnect
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[200px] flex-1 space-y-1.5">
                <label
                  htmlFor={`key-${provider}`}
                  className="text-xs text-muted-foreground"
                >
                  API key
                </label>
                <Input
                  id={`key-${provider}`}
                  type="password"
                  autoComplete="off"
                  placeholder={meta.placeholder}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  disabled={disabled || connect.isPending}
                  data-testid={`input-key-${provider}`}
                />
              </div>
              <Button
                className="gap-2"
                onClick={() => connect.mutate(apiKey.trim())}
                disabled={disabled || connect.isPending || apiKey.trim().length < 10}
                data-testid={`button-connect-${provider}`}
              >
                {connect.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="h-4 w-4" />
                )}
                Connect
              </Button>
            </div>
            <a
              href={meta.keyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover-elevate"
              data-testid={`link-get-key-${provider}`}
            >
              <ExternalLink className="h-3 w-3" />
              Get a {meta.name} API key
            </a>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function recommendationLabel(rec: AnalysisResult["consensus"]["recommendation"]): string {
  return rec
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function recommendationVariant(
  rec: AnalysisResult["consensus"]["recommendation"],
): "default" | "secondary" | "destructive" {
  if (rec === "buy" || rec === "strong_buy") return "default";
  if (rec === "sell" || rec === "strong_sell") return "destructive";
  return "secondary";
}

const AGENT_LABELS: Record<AgentSignal["agent"], string> = {
  technical: "Technical",
  sentiment: "Sentiment",
  fundamental: "Fundamental",
};

function SignalIcon({ signal }: { signal: number }) {
  if (signal > 0.1) return <TrendingUp className="h-4 w-4 text-profit" />;
  if (signal < -0.1) return <TrendingDown className="h-4 w-4 text-loss" />;
  return <Minus className="h-4 w-4 text-muted-foreground" />;
}

function AnalysisModelCard({ data }: { data: ProvidersResponse }) {
  const { toast } = useToast();
  const connected = new Set(data.providers.map((p) => p.provider));
  const activeProvider = data.activeProvider;
  const activeModel = data.activeModel;

  const setActive = useMutation({
    mutationFn: async (vars: { provider: AnalysisProvider; model?: string }) => {
      const res = await apiRequest("POST", "/api/ai-providers/active", vars);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai-providers"] });
    },
    onError: (err: Error) => {
      toast({
        title: "Could not update analysis model",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const options: Array<{
    value: AnalysisProvider;
    title: string;
    subtitle: string;
    available: boolean;
  }> = [
    {
      value: "claude",
      title: "Built-in (Claude)",
      subtitle: "Always available — no API key required.",
      available: true,
    },
    {
      value: "openai",
      title: "OpenAI",
      subtitle: connected.has("openai")
        ? "Use your connected OpenAI key."
        : "Connect your OpenAI key above to enable.",
      available: connected.has("openai"),
    },
    {
      value: "gemini",
      title: "Google Gemini",
      subtitle: connected.has("gemini")
        ? "Use your connected Gemini key."
        : "Connect your Gemini key above to enable.",
      available: connected.has("gemini"),
    },
  ];

  return (
    <Card data-testid="card-analysis-model">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
            <BrainCircuit className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base">Analysis model</CardTitle>
            <p className="text-xs text-muted-foreground">
              Powers your multi-agent market analysis
            </p>
          </div>
        </div>
        <CardDescription className="pt-2">
          Choose which model runs your multi-agent analysis — the technical,
          sentiment, and fundamental agents plus the bull vs. bear debate. Your
          chat assistant always uses the built-in model.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup
          value={activeProvider}
          onValueChange={(v) => {
            const provider = v as AnalysisProvider;
            const model =
              provider === "claude"
                ? undefined
                : PROVIDER_MODELS[provider as AiProvider].default;
            setActive.mutate({ provider, model });
          }}
          className="gap-3"
        >
          {options.map((opt) => {
            const isActive = opt.value === activeProvider;
            const isByo = opt.value !== "claude";
            const models = isByo
              ? PROVIDER_MODELS[opt.value as AiProvider].options
              : [];
            return (
              <div
                key={opt.value}
                className="rounded-md border p-3"
                data-testid={`option-analysis-${opt.value}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <RadioGroupItem
                      value={opt.value}
                      id={`analysis-${opt.value}`}
                      disabled={!opt.available || setActive.isPending}
                      className="mt-1"
                      data-testid={`radio-analysis-${opt.value}`}
                    />
                    <Label
                      htmlFor={`analysis-${opt.value}`}
                      className="cursor-pointer space-y-0.5"
                    >
                      <span className="block text-sm font-medium">
                        {opt.title}
                      </span>
                      <span className="block text-xs font-normal text-muted-foreground">
                        {opt.subtitle}
                      </span>
                    </Label>
                  </div>
                  {isActive && isByo && (
                    <Select
                      value={activeModel ?? PROVIDER_MODELS[opt.value as AiProvider].default}
                      onValueChange={(m) =>
                        setActive.mutate({ provider: opt.value, model: m })
                      }
                      disabled={setActive.isPending}
                    >
                      <SelectTrigger
                        className="w-[180px]"
                        data-testid={`select-model-${opt.value}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {models.map((m) => (
                          <SelectItem
                            key={m}
                            value={m}
                            data-testid={`model-option-${m}`}
                          >
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
            );
          })}
        </RadioGroup>
      </CardContent>
    </Card>
  );
}

function TryItPanel() {
  const { toast } = useToast();
  const [symbol, setSymbol] = useState("");

  const analyze = useMutation({
    mutationFn: async (sym: string) => {
      const res = await apiRequest("POST", "/api/ai/analyze", { symbol: sym });
      return (await res.json()) as AnalysisResult;
    },
    onError: (err: Error) => {
      toast({
        title: "Analysis failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const result = analyze.data;

  const runAnalysis = () => {
    const trimmed = symbol.trim().toUpperCase();
    if (trimmed.length === 0) return;
    analyze.mutate(trimmed);
  };

  return (
    <Card data-testid="card-try-analysis">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10">
            <Play className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-base">Try it</CardTitle>
            <p className="text-xs text-muted-foreground">
              Run a live multi-agent analysis on any symbol
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1 space-y-1.5">
            <label
              htmlFor="analysis-symbol"
              className="text-xs text-muted-foreground"
            >
              Symbol
            </label>
            <Input
              id="analysis-symbol"
              placeholder="e.g. SPY"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") runAnalysis();
              }}
              disabled={analyze.isPending}
              data-testid="input-analysis-symbol"
            />
          </div>
          <Button
            className="gap-2"
            onClick={runAnalysis}
            disabled={analyze.isPending || symbol.trim().length === 0}
            data-testid="button-run-analysis"
          >
            {analyze.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Run analysis
          </Button>
        </div>

        {result && (
          <div className="space-y-4" data-testid="analysis-result">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="text-sm font-semibold"
                  data-testid="text-analysis-symbol"
                >
                  {result.symbol}
                </span>
                <Badge
                  variant={recommendationVariant(result.consensus.recommendation)}
                  data-testid="badge-recommendation"
                >
                  {recommendationLabel(result.consensus.recommendation)}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {Math.round(result.consensus.confidence * 100)}% confidence
                </span>
              </div>
              <span
                className="text-xs text-muted-foreground"
                data-testid="text-analyzed-by"
              >
                Analyzed by {result.analysisProvider.label}
              </span>
            </div>

            {result.analysisProvider.fallbackUsed && (
              <div
                className="flex items-start gap-2 rounded-md border p-3 text-xs text-muted-foreground"
                data-testid="note-fallback"
              >
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Your selected provider was unavailable, so the built-in model
                  was used for this run.
                </span>
              </div>
            )}

            <div className="grid gap-3">
              {result.agents.map((agent) => (
                <div
                  key={agent.agent}
                  className="rounded-md border p-3"
                  data-testid={`agent-${agent.agent}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <SignalIcon signal={agent.signal} />
                      <span className="text-sm font-medium">
                        {AGENT_LABELS[agent.agent]}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {Math.round(agent.confidence * 100)}% confidence
                    </span>
                  </div>
                  <p className="pt-2 text-xs text-muted-foreground">
                    {agent.reasoning}
                  </p>
                </div>
              ))}
            </div>

            <div
              className="rounded-md border p-3"
              data-testid="bull-bear-debate"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Scale className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Bull vs. Bear</span>
                </div>
                <Badge
                  variant={
                    result.bullBearDebate.winner === "bull"
                      ? "default"
                      : result.bullBearDebate.winner === "bear"
                        ? "destructive"
                        : "secondary"
                  }
                  data-testid="badge-debate-winner"
                >
                  {result.bullBearDebate.winner.charAt(0).toUpperCase() +
                    result.bullBearDebate.winner.slice(1)}{" "}
                  edge
                </Badge>
              </div>
              <div className="grid gap-3 pt-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <span className="flex items-center gap-1 text-xs font-medium text-profit">
                    <TrendingUp className="h-3 w-3" />
                    Bull case
                  </span>
                  <p className="text-xs text-muted-foreground">
                    {result.bullBearDebate.bullCase}
                  </p>
                </div>
                <div className="space-y-1">
                  <span className="flex items-center gap-1 text-xs font-medium text-loss">
                    <TrendingDown className="h-3 w-3" />
                    Bear case
                  </span>
                  <p className="text-xs text-muted-foreground">
                    {result.bullBearDebate.bearCase}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AiProvidersPage() {
  const { data, isLoading } = useQuery<ProvidersResponse>({
    queryKey: ["/api/ai-providers"],
  });

  const connectedByProvider = new Map<AiProvider, ProviderStatus>();
  (data?.providers ?? []).forEach((p) => connectedByProvider.set(p.provider, p));

  const encryptionUnavailable = data ? !data.encryptionConfigured : false;

  return (
    <div className="mx-auto max-w-3xl space-y-6" data-testid="page-ai-providers">
      <Seo path="/ai-providers" />
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">AI Providers</h1>
        <p className="text-sm text-muted-foreground">
          Connect your own OpenAI and Google Gemini API keys so your trading
          agents can reason with these models alongside the built-in assistant.
          Keys are encrypted on the server and never shown again after you save
          them.
        </p>
      </div>

      {encryptionUnavailable && (
        <div
          className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm"
          data-testid="alert-encryption"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
          <span>
            Secure key storage is unavailable right now, so connecting providers
            is temporarily disabled.
          </span>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid gap-4">
            {AI_PROVIDERS.map((p) => (
              <ProviderCard
                key={p}
                provider={p}
                connected={connectedByProvider.get(p)}
                disabled={encryptionUnavailable}
              />
            ))}
          </div>

          {data && <AnalysisModelCard data={data} />}
          <TryItPanel />
        </>
      )}

      <p className="text-xs text-muted-foreground">
        Your keys are stored only for your current session and used solely to
        call the provider on your behalf. Remove them anytime with Disconnect.
      </p>
    </div>
  );
}
