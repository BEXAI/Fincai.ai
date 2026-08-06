import { motion } from "framer-motion";
import {
  Bot,
  User,
  TrendingUp,
  TrendingDown,
  Scale,
  ShieldCheck,
  Lock,
  Check,
  Activity,
  Brain,
} from "lucide-react";
import spyScreenshot from "@assets/promo/data.jpg";
import runnerScreenshot from "@assets/promo/runner.jpg";
import chatScreenshot from "@assets/promo/chat.jpg";

// Lightweight, theme-consistent "mock" previews of each real feature. They are
// rendered instead of a bare icon so the promo tour reads as a concrete
// "watch it work" demo. Every animation is gated on `reduce` so visitors who
// prefer reduced motion get a clean static image with no movement.

type PreviewProps = { reduce: boolean | null };

// A faux app window that frames each preview in the Lux Black & Gold glass theme.
function Frame({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div className="w-full overflow-hidden rounded-xl border border-[var(--glass-border)] glass-panel shadow-2xl shadow-black/40">
      <div className="flex items-center gap-1.5 border-b border-[var(--glass-border)] px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-foreground/20" />
        <span className="h-2 w-2 rounded-full bg-foreground/20" />
        <span className="h-2 w-2 rounded-full bg-foreground/20" />
        <span className="ml-2 truncate text-[10px] font-medium text-muted-foreground">
          {label}
        </span>
      </div>
      <div className="p-3 sm:p-4">{children}</div>
    </div>
  );
}

const fade = (reduce: boolean | null, delay = 0) =>
  reduce
    ? { initial: false as const, animate: {} }
    : {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.4, delay },
      };

function ChatPreview({ reduce }: PreviewProps) {
  return (
    <Frame label="Fincai — AI Chat">
      <div className="flex flex-col gap-3 text-left">
        <motion.div {...fade(reduce, 0)} className="flex justify-end">
          <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-primary/15 px-3 py-2 text-xs text-foreground">
            Is SPY overextended right now?
          </div>
        </motion.div>
        <motion.div {...fade(reduce, 0.25)} className="flex gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <Bot className="h-3.5 w-3.5 text-primary" />
          </span>
          <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-[var(--glass-border)] px-3 py-2 text-xs text-muted-foreground">
            <span className="text-foreground">Reasoning:</span> RSI is 71 and price
            sits 2.1% above the 20-day mean…
            {!reduce && (
              <motion.span
                className="ml-0.5 inline-block h-3 w-1.5 translate-y-0.5 bg-primary"
                animate={{ opacity: [1, 0, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              />
            )}
          </div>
        </motion.div>
      </div>
    </Frame>
  );
}

function AgentsPreview({ reduce }: PreviewProps) {
  const agents = [
    { name: "Technical", tone: "Bullish", up: true },
    { name: "Sentiment", tone: "Neutral", up: true },
    { name: "Fundamental", tone: "Bearish", up: false },
  ];
  return (
    <Frame label="Fincai — Multi-Agent Analysis">
      <div className="grid grid-cols-3 gap-2">
        {agents.map((a, i) => (
          <motion.div
            key={a.name}
            {...fade(reduce, i * 0.12)}
            className="rounded-lg border border-[var(--glass-border)] p-2 text-left"
          >
            <p className="text-[10px] font-medium text-muted-foreground">
              {a.name}
            </p>
            <p
              className={`mt-1 flex items-center gap-1 text-xs font-semibold ${a.up ? "text-emerald-400" : "text-rose-400"}`}
            >
              {a.up ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              {a.tone}
            </p>
          </motion.div>
        ))}
      </div>
      <motion.div
        {...fade(reduce, 0.4)}
        className="mt-2 flex items-center gap-2 rounded-lg border border-[var(--glass-border)] px-2 py-1.5"
      >
        <Scale className="h-3.5 w-3.5 text-primary" />
        <span className="text-[10px] text-muted-foreground">
          Bull vs. Bear debate → <span className="text-foreground">Consensus: Accumulate</span>
        </span>
      </motion.div>
    </Frame>
  );
}

function RunnerPreview({ reduce }: PreviewProps) {
  const runs = [
    { sym: "AAPL", tag: "Paper", state: "in position", up: true },
    { sym: "NFLX", tag: "Paper", state: "watching", up: true },
    { sym: "MSFT", tag: "Live", state: "watching", up: false },
  ];
  return (
    <Frame label="Fincai — Strategy Runner">
      <div className="flex flex-col gap-2 text-left">
        {runs.map((r, i) => (
          <motion.div
            key={r.sym}
            {...fade(reduce, i * 0.12)}
            className="flex items-center justify-between gap-2 rounded-lg border border-[var(--glass-border)] px-2.5 py-2"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-foreground">
                {r.sym}
              </span>
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium text-primary">
                {r.tag}
              </span>
            </div>
            <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
              {!reduce && (
                <motion.span
                  className="h-1.5 w-1.5 rounded-full bg-emerald-400"
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
                />
              )}
              {r.state}
            </span>
          </motion.div>
        ))}
      </div>
    </Frame>
  );
}

function RobinhoodPreview({ reduce }: PreviewProps) {
  return (
    <Frame label="Fincai — Trading Agent">
      <div className="flex flex-col items-center gap-3 py-2 text-center">
        <motion.span
          {...fade(reduce, 0)}
          className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-[var(--glass-border)]"
        >
          <ShieldCheck className="h-6 w-6 text-primary" />
        </motion.span>
        <motion.div {...fade(reduce, 0.15)} className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          <span className="text-xs font-semibold text-foreground">
            Agent connected
          </span>
        </motion.div>
        <motion.div
          {...fade(reduce, 0.3)}
          className="flex items-center gap-1.5 rounded-lg border border-[var(--glass-border)] px-2.5 py-1.5 text-[10px] text-muted-foreground"
        >
          <Lock className="h-3 w-3 text-primary" />
          OAuth 2.1 · PKCE · encrypted — password never seen
        </motion.div>
      </div>
    </Frame>
  );
}

function PricingPreview({ reduce }: PreviewProps) {
  const rows = 5;
  const cols = 7;
  return (
    <Frame label="Fincai — Volatility Surface">
      <div className="flex flex-col gap-1">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex gap-1">
            {Array.from({ length: cols }).map((_, c) => {
              // Smile-shaped intensity: higher toward the wings and shorter tenors.
              const mid = (cols - 1) / 2;
              const smile = Math.abs(c - mid) / mid;
              const tenor = 1 - r / rows;
              const intensity = 0.25 + (smile * 0.45 + tenor * 0.4);
              return (
                <motion.span
                  key={c}
                  {...(reduce
                    ? { initial: false as const }
                    : {
                        initial: { opacity: 0, scale: 0.6 },
                        animate: { opacity: 1, scale: 1 },
                        transition: { duration: 0.3, delay: (r * cols + c) * 0.01 },
                      })}
                  className="h-5 flex-1 rounded-sm sm:h-6"
                  style={{
                    background: `hsl(46 80% 55% / ${Math.min(1, intensity)})`,
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between text-[9px] text-muted-foreground">
        <span>Strike →</span>
        <span className="flex items-center gap-1">
          <Activity className="h-3 w-3 text-primary" /> Implied volatility
        </span>
      </div>
    </Frame>
  );
}

function DataPreview({ reduce }: PreviewProps) {
  // A simple SPY-style intraday line.
  const points = [4, 8, 6, 12, 10, 16, 14, 20, 18, 26, 24, 30];
  const w = 260;
  const h = 70;
  const max = Math.max(...points);
  const path = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - (p / max) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const movers = [
    { sym: "NVDA", chg: "+3.2%", up: true },
    { sym: "TSLA", chg: "+1.8%", up: true },
    { sym: "INTC", chg: "-2.1%", up: false },
  ];
  return (
    <Frame label="Fincai — Live Markets">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">SPY</span>
        <span className="text-xs font-semibold text-emerald-400">+0.42%</span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-16 w-full" preserveAspectRatio="none">
        <motion.path
          d={path}
          fill="none"
          stroke="hsl(46 80% 55%)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          {...(reduce
            ? {}
            : {
                initial: { pathLength: 0 },
                animate: { pathLength: 1 },
                transition: { duration: 1.4, ease: "easeInOut" },
              })}
        />
      </svg>
      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {movers.map((m) => (
          <div
            key={m.sym}
            className="rounded-md border border-[var(--glass-border)] px-1.5 py-1 text-center"
          >
            <p className="text-[10px] font-medium text-foreground">{m.sym}</p>
            <p
              className={`text-[10px] font-semibold ${m.up ? "text-emerald-400" : "text-rose-400"}`}
            >
              {m.chg}
            </p>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function PsychologyPreview({ reduce }: PreviewProps) {
  const emotions = ["Calm", "Focused", "Anxious", "Confident"];
  const bars = [70, 45, 85];
  return (
    <Frame label="Fincai — Psychology Tracker">
      <div className="mb-3 flex flex-wrap gap-1.5">
        {emotions.map((e, i) => (
          <motion.span
            key={e}
            {...fade(reduce, i * 0.1)}
            className={`rounded-full border border-[var(--glass-border)] px-2 py-0.5 text-[10px] ${i === 1 ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}
          >
            {e}
          </motion.span>
        ))}
      </div>
      <div className="flex items-end gap-2">
        {bars.map((b, i) => (
          <motion.div
            key={i}
            className="flex-1 rounded-t-sm bg-primary/40"
            {...(reduce
              ? { style: { height: `${b}%` } }
              : {
                  initial: { height: 0 },
                  animate: { height: `${b}%` },
                  transition: { duration: 0.6, delay: i * 0.12 },
                })}
            style={reduce ? { height: `${(b / 100) * 60}px` } : { maxHeight: 60 }}
          />
        ))}
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[9px] text-muted-foreground">
        <Brain className="h-3 w-3 text-primary" /> Discipline trending up this week
      </div>
    </Frame>
  );
}

const PREVIEWS: Record<string, (p: PreviewProps) => JSX.Element> = {
  chat: ChatPreview,
  agents: AgentsPreview,
  runner: RunnerPreview,
  robinhood: RobinhoodPreview,
  pricing: PricingPreview,
  data: DataPreview,
  psychology: PsychologyPreview,
};

// Real, optimized product screenshots captured with the app in promo-capture
// mode (see client/src/lib/promo-capture.ts and docs/promo-screenshots.md).
// When a slide has one it is shown instead of the animated mock; slides without
// a screenshot transparently fall back to the mock above. Adding a capture is
// as simple as dropping a file in attached_assets/promo and mapping it here.
const SCREENSHOTS: Record<string, { src: string; label: string; alt: string }> = {
  chat: {
    src: chatScreenshot,
    label: "Fincai — AI Chat",
    alt: "Fincai conversational AI assistant analyzing SPY with technical levels",
  },
  data: {
    src: spyScreenshot,
    label: "Fincai — Live Markets",
    alt: "Fincai live SPY price chart with real-time market data",
  },
  runner: {
    src: runnerScreenshot,
    label: "Fincai — Strategy Runner",
    alt: "Fincai autonomous strategy runner managing live paper trades",
  },
};

function ScreenshotPreview({
  src,
  label,
  alt,
}: {
  src: string;
  label: string;
  alt: string;
}) {
  return (
    <Frame label={label}>
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        className="w-full rounded-md"
      />
    </Frame>
  );
}

export function FeaturePreview({
  id,
  reduce,
}: {
  id: string;
  reduce: boolean | null;
}) {
  const shot = SCREENSHOTS[id];
  const Preview = PREVIEWS[id];
  if (!shot && !Preview) return null;
  return (
    <div className="w-full max-w-sm" data-testid={`promo-preview-${id}`}>
      {shot ? (
        <ScreenshotPreview src={shot.src} label={shot.label} alt={shot.alt} />
      ) : (
        <Preview reduce={reduce} />
      )}
    </div>
  );
}

export function hasFeaturePreview(id: string) {
  return id in PREVIEWS || id in SCREENSHOTS;
}
