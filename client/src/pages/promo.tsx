import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useLocation } from "wouter";
import type { LucideIcon } from "lucide-react";
import {
  Bot,
  Users,
  Rocket,
  ShieldCheck,
  Sigma,
  LineChart,
  Brain,
  Sparkles,
  ArrowRight,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  RotateCcw,
  X,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Seo } from "@/components/seo";
import { SEO_COMPLIANCE_LINE, ROBINHOOD_DISCLAIMER } from "@shared/seo-config";
import { FeaturePreview, hasFeaturePreview } from "@/components/promo/feature-previews";

const SLIDE_MS = 7000;
const TICK = 40;
const ACCENT =
  "bg-gradient-to-r from-[hsl(43_75%_45%)] via-[hsl(46_65%_58%)] to-[hsl(51_100%_55%)] bg-clip-text text-transparent";

type Slide = {
  id: string;
  eyebrow: string;
  title: string;
  accent: string;
  body: string;
  bullets?: string[];
  icon: LucideIcon;
};

const SLIDES: Slide[] = [
  {
    id: "hero",
    eyebrow: "Fincai.ai",
    title: "Your AI trading",
    accent: "command center",
    body: "An agentic AI copilot for stocks and options — real-time analysis, manual trades you confirm, and autonomous strategies that run within the limits you set.",
    icon: Sparkles,
  },
  {
    id: "chat",
    eyebrow: "Talk to the market",
    title: "Ask anything,",
    accent: "in plain English",
    body: "A ChatGPT-style assistant reads live market data and streams its reasoning as it analyzes stocks and options.",
    bullets: [
      "Natural-language market analysis",
      "Streaming, step-by-step reasoning",
      "Portfolio questions answered instantly",
    ],
    icon: Bot,
  },
  {
    id: "agents",
    eyebrow: "A whole desk of analysts",
    title: "Multi-agent",
    accent: "intelligence",
    body: "Technical, sentiment, and fundamental agents weigh every setup, then debate it bull versus bear with market-regime detection.",
    bullets: [
      "Technical, sentiment & fundamental agents",
      "Bull vs. bear debate on each idea",
      "Use the built-in model or your own OpenAI or Gemini key",
    ],
    icon: Users,
  },
  {
    id: "runner",
    eyebrow: "Strategies that actually run",
    title: "Autonomous",
    accent: "strategy runner",
    body: "Curated institutional playbooks with built-in entry, stop-loss, profit-target, and trailing rules — executed by a live background engine.",
    bullets: [
      "Paper by default, live is an explicit opt-in",
      "Automated entry, stop, target & trailing rules",
      "Long-only in V1, with position caps",
    ],
    icon: Rocket,
  },
  {
    id: "robinhood",
    eyebrow: "Connected to your broker",
    title: "A live agent on",
    accent: "Robinhood",
    body: "Fincai links to Robinhood through its official Trading API and secure OAuth — it never sees or stores your password.",
    bullets: [
      "Official OAuth 2.1 with PKCE",
      "Encrypted, durable connection",
      "Manual orders execute only after you confirm",
    ],
    icon: ShieldCheck,
  },
  {
    id: "pricing",
    eyebrow: "Options pricing math",
    title: "Options",
    accent: "pricing & Greeks",
    body: "A broker-independent engine prices options and computes full Greeks, implied volatility, and a smoothed volatility surface.",
    bullets: [
      "Black-Scholes & Bjerksund-Stensland models",
      "Full Greeks plus an implied-volatility solver",
      "Interactive volatility-surface heatmap",
    ],
    icon: Sigma,
  },
  {
    id: "data",
    eyebrow: "Only real data",
    title: "Live markets,",
    accent: "real signals",
    body: "Live price charts, market movers, and technical signals computed automatically on real-time data — never fabricated.",
    bullets: [
      "Live charts and market overview",
      "Gainers, losers & most active",
      "Pivots, Fibonacci, ATR & Bollinger Bands",
    ],
    icon: LineChart,
  },
  {
    id: "psychology",
    eyebrow: "Trade like a pro",
    title: "Master your",
    accent: "psychology",
    body: "Track your emotions, log mistakes, and review performance to build the discipline that keeps you consistent.",
    bullets: [
      "Emotion and mistake tracking",
      "A structured trade journal",
      "Performance review over time",
    ],
    icon: Brain,
  },
  {
    id: "cta",
    eyebrow: "Ready when you are",
    title: "Start trading smarter",
    accent: "with Fincai",
    body: "Explore it free in demo mode — no account required to look around.",
    icon: Sparkles,
  },
];

export default function Promo() {
  const [, setLocation] = useLocation();
  const reduce = useReducedMotion();
  const total = SLIDES.length;

  const [index, setIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(false);

  // Begin autoplay after mount, unless the visitor prefers reduced motion.
  useEffect(() => {
    setPlaying(!reduce);
  }, [reduce]);

  const goTo = useCallback(
    (i: number) => {
      setIndex(((i % total) + total) % total);
      setProgress(0);
    },
    [total],
  );
  const next = useCallback(() => goTo(index + 1), [goTo, index]);
  const prev = useCallback(() => goTo(index - 1), [goTo, index]);
  const toggle = useCallback(() => {
    // On the finished final slide, the play button replays from the start.
    if (!playing && index >= total - 1 && progress >= 1) {
      setIndex(0);
      setProgress(0);
      setPlaying(true);
      return;
    }
    setPlaying((p) => !p);
  }, [playing, index, total, progress]);
  const restart = useCallback(() => {
    setIndex(0);
    setProgress(0);
    setPlaying(!reduce);
  }, [reduce]);
  const close = useCallback(() => setLocation("/"), [setLocation]);

  // Tick the current slide's progress while playing.
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => {
      setProgress((p) => Math.min(1, p + TICK / SLIDE_MS));
    }, TICK);
    return () => window.clearInterval(id);
  }, [playing, index]);

  // Advance once the current slide finishes. Autoplay stops on the final slide
  // instead of looping — a promo "video" should end on its call to action.
  useEffect(() => {
    if (playing && progress >= 1) {
      if (index >= total - 1) {
        setPlaying(false);
      } else {
        setIndex((i) => i + 1);
        setProgress(0);
      }
    }
  }, [playing, progress, index, total]);

  // Pause when the tab is hidden so autoplay doesn't run in the background.
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Keyboard controls: arrows step, space toggles play/pause, Esc closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        prev();
      } else if (e.key === " ") {
        // Don't hijack Space when a button/link/field already has keyboard focus.
        const el = e.target as HTMLElement | null;
        const tag = el?.tagName;
        if (
          tag === "BUTTON" ||
          tag === "A" ||
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          el?.isContentEditable
        ) {
          return;
        }
        e.preventDefault();
        toggle();
      } else if (e.key === "Escape") {
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, toggle, close]);

  const slide = SLIDES[index];
  const isCta = slide.id === "cta";
  const isHero = slide.id === "hero";
  const hasPreview = hasFeaturePreview(slide.id);
  const Icon = slide.icon;

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col overflow-hidden bg-background text-foreground"
      data-testid="promo-page"
    >
      <Seo path="/promo" />
      {/* Ambient gold washes */}
      <div
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          background:
            "radial-gradient(60% 70% at 15% 0%, hsl(46 65% 52% / 0.16), transparent 60%), radial-gradient(55% 65% at 100% 100%, hsl(51 100% 50% / 0.10), transparent 60%), radial-gradient(40% 50% at 50% 120%, hsl(43 75% 45% / 0.10), transparent 60%)",
        }}
        aria-hidden="true"
      />

      {/* Top bar */}
      <div className="relative z-10 flex items-center justify-between gap-2 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <img
            src="/logo.jpeg"
            alt="Fincai"
            className="h-8 w-8 rounded-lg object-cover"
          />
          <span className="text-sm font-semibold tracking-tight">Fincai</span>
          <span
            className="ml-1 hidden text-xs text-muted-foreground sm:inline"
            data-testid="text-promo-counter"
          >
            {String(index + 1).padStart(2, "0")} /{" "}
            {String(total).padStart(2, "0")}
          </span>
        </div>
        <Button
          size="icon"
          variant="ghost"
          onClick={close}
          aria-label="Close promo"
          data-testid="button-promo-close"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Stage */}
      <div className="relative z-10 flex flex-1 items-center justify-center overflow-hidden px-6 py-2">
        <AnimatePresence mode="wait">
          <motion.div
            key={slide.id}
            initial={{
              opacity: 0,
              y: reduce ? 0 : 24,
              scale: reduce ? 1 : 0.98,
            }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: reduce ? 0 : -24, scale: reduce ? 1 : 0.98 }}
            transition={{ duration: reduce ? 0 : 0.5, ease: "easeOut" }}
            className={`mx-auto flex w-full flex-col items-center text-center ${
              hasPreview
                ? "max-w-5xl gap-8 lg:flex-row lg:items-center lg:gap-12 lg:text-left"
                : "max-w-2xl"
            }`}
            data-testid={`promo-slide-${slide.id}`}
          >
            <div
              className={`flex flex-col items-center ${
                hasPreview ? "lg:flex-1 lg:items-start" : ""
              }`}
            >
              {/* Icon / logo with a gentle Ken-Burns float */}
              <motion.div
                animate={reduce ? {} : { scale: [1, 1.06, 1] }}
                transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
                className="mb-6"
              >
                {isHero ? (
                  <img
                    src="/logo.jpeg"
                    alt="Fincai"
                    className="h-20 w-20 rounded-2xl object-cover ring-1 ring-[var(--glass-border)]"
                  />
                ) : (
                  <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-[var(--glass-border)]">
                    <Icon className="h-8 w-8 text-primary" />
                  </span>
                )}
              </motion.div>

              <span
                className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-[var(--glass-border)] glass-panel px-3 py-1 text-xs font-medium text-muted-foreground"
                data-testid="text-promo-eyebrow"
              >
                <Sparkles className="h-3 w-3 text-primary" />
                {slide.eyebrow}
              </span>

              <h1 className="font-display text-3xl font-semibold leading-tight tracking-tight text-balance sm:text-4xl lg:text-5xl">
                {slide.title} <span className={ACCENT}>{slide.accent}</span>
              </h1>

              <p className="mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
                {slide.body}
              </p>

              {!isCta && slide.bullets && (
                <ul className="mt-6 flex flex-col items-start gap-2 text-left">
                  {slide.bullets.map((b) => (
                    <li
                      key={b}
                      className="flex items-start gap-2 text-sm text-muted-foreground sm:text-base"
                    >
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {hasPreview && (
              <motion.div
                {...(reduce
                  ? {}
                  : {
                      initial: { opacity: 0, scale: 0.96 },
                      animate: { opacity: 1, scale: 1 },
                      transition: { duration: 0.5, delay: 0.1 },
                    })}
                className="flex w-full justify-center lg:flex-1"
              >
                <FeaturePreview id={slide.id} reduce={reduce} />
              </motion.div>
            )}

            {isCta && (
              <div className="mt-8 w-full max-w-md space-y-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
                  <Button
                    size="lg"
                    onClick={() => setLocation("/")}
                    className="gap-2 text-base"
                    data-testid="button-promo-cta-agent"
                  >
                    Launch the trading agent
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    onClick={() => setLocation("/chat")}
                    className="gap-2 text-base"
                    data-testid="button-promo-cta-chat"
                  >
                    Open the AI chat
                  </Button>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {SEO_COMPLIANCE_LINE} {ROBINHOOD_DISCLAIMER}
                </p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom: segmented progress + playback controls */}
      <div className="relative z-10 mx-auto w-full max-w-3xl px-6 pb-6 pt-2 sm:pb-8">
        <div className="flex items-center gap-1.5" data-testid="promo-progress">
          {SLIDES.map((s, i) => (
            <button
              key={s.id}
              onClick={() => goTo(i)}
              className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/10"
              aria-label={`Go to slide ${i + 1}`}
              data-testid={`progress-segment-${i}`}
            >
              <span
                className="absolute inset-y-0 left-0 rounded-full bg-primary"
                style={{
                  width:
                    i < index
                      ? "100%"
                      : i === index
                        ? `${progress * 100}%`
                        : "0%",
                  transition: "width 100ms linear",
                }}
              />
            </button>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-center gap-2">
          <Button
            size="icon"
            variant="ghost"
            onClick={restart}
            aria-label="Restart"
            data-testid="button-promo-restart"
          >
            <RotateCcw className="h-5 w-5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={prev}
            aria-label="Previous slide"
            data-testid="button-promo-prev"
          >
            <SkipBack className="h-5 w-5" />
          </Button>
          <Button
            size="icon"
            onClick={toggle}
            aria-label={playing ? "Pause" : "Play"}
            data-testid="button-promo-playpause"
          >
            {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={next}
            aria-label="Next slide"
            data-testid="button-promo-next"
          >
            <SkipForward className="h-5 w-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
