import { useEffect, useState, useRef, useCallback } from "react";
import { useMarketWebSocket } from "@/hooks/use-market-websocket";
import type { MarketQuote } from "@shared/schema";

interface PricePoint {
  price: number;
  timestamp: number;
}

export function BackgroundMarketCanvas() {
  const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [currentQuote, setCurrentQuote] = useState<MarketQuote | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);

  const handleQuote = useCallback((quote: MarketQuote) => {
    setCurrentQuote(quote);
    
    // Initialize price history on first quote
    if (!initializedRef.current) {
      initializedRef.current = true;
      const basePrice = quote.price;
      const initialPoints: PricePoint[] = [];
      for (let i = 0; i < 50; i++) {
        initialPoints.push({
          price: basePrice + (Math.random() - 0.5) * 2,
          timestamp: Date.now() - (50 - i) * 1000,
        });
      }
      setPriceHistory(initialPoints);
    } else {
      // Add new price point
      setPriceHistory((prev) => {
        const newPoint: PricePoint = {
          price: quote.price,
          timestamp: Date.now(),
        };
        const updated = [...prev, newPoint];
        if (updated.length > 100) {
          return updated.slice(-100);
        }
        return updated;
      });
    }
  }, []);

  const { isConnected } = useMarketWebSocket({ onQuote: handleQuote });

  useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight,
        });
      }
    };

    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, []);

  const generatePath = () => {
    if (priceHistory.length < 2 || dimensions.width === 0) return "";

    const prices = priceHistory.map((p) => p.price);
    const minPrice = Math.min(...prices) - 1;
    const maxPrice = Math.max(...prices) + 1;
    const priceRange = maxPrice - minPrice || 1;

    const points = priceHistory.map((point, index) => {
      const x = (index / (priceHistory.length - 1)) * dimensions.width;
      const y =
        dimensions.height -
        ((point.price - minPrice) / priceRange) * dimensions.height * 0.6 -
        dimensions.height * 0.2;
      return { x, y };
    });

    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cpx = (prev.x + curr.x) / 2;
      path += ` Q ${cpx} ${prev.y} ${curr.x} ${curr.y}`;
    }

    return path;
  };

  const generateAreaPath = () => {
    const linePath = generatePath();
    if (!linePath || dimensions.width === 0) return "";
    return `${linePath} L ${dimensions.width} ${dimensions.height} L 0 ${dimensions.height} Z`;
  };

  const isPositive = (currentQuote?.changePercent ?? 0) >= 0;

  return (
    <div
      ref={containerRef}
      data-testid="market-canvas"
      className="fixed inset-0 -z-10 overflow-hidden"
    >
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-muted/20" />

      <svg
        width={dimensions.width}
        height={dimensions.height}
        className="absolute inset-0 opacity-40"
      >
        <defs>
          <linearGradient id="chartGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop
              offset="0%"
              stopColor={isPositive ? "hsl(142, 76%, 36%)" : "hsl(0, 84%, 60%)"}
              stopOpacity="0.4"
            />
            <stop
              offset="100%"
              stopColor={isPositive ? "hsl(142, 76%, 36%)" : "hsl(0, 84%, 60%)"}
              stopOpacity="0"
            />
          </linearGradient>
          <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop
              offset="0%"
              stopColor={isPositive ? "hsl(142, 76%, 36%)" : "hsl(0, 84%, 60%)"}
              stopOpacity="0.3"
            />
            <stop
              offset="50%"
              stopColor={isPositive ? "hsl(142, 76%, 50%)" : "hsl(0, 84%, 50%)"}
              stopOpacity="0.6"
            />
            <stop
              offset="100%"
              stopColor={isPositive ? "hsl(142, 76%, 36%)" : "hsl(0, 84%, 60%)"}
              stopOpacity="0.3"
            />
          </linearGradient>
        </defs>

        <path
          d={generateAreaPath()}
          fill="url(#chartGradient)"
          className="transition-all duration-300"
        />

        <path
          d={generatePath()}
          fill="none"
          stroke="url(#lineGradient)"
          strokeWidth="2"
          strokeLinecap="round"
          className="transition-all duration-300"
        />
      </svg>

      {currentQuote && (
        <div className="absolute bottom-4 right-4 text-right opacity-40">
          <div className="flex items-center gap-2 justify-end mb-1">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">
              SPY
            </div>
            {isConnected && (
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            )}
          </div>
          <div
            data-testid="text-spy-price"
            className="text-lg font-mono font-medium text-foreground/60"
          >
            ${currentQuote.price.toFixed(2)}
          </div>
          <div
            data-testid="text-spy-change"
            className={`text-sm font-mono ${
              isPositive ? "text-green-500/60" : "text-red-500/60"
            }`}
          >
            {isPositive ? "+" : ""}
            {currentQuote.change.toFixed(2)} ({isPositive ? "+" : ""}
            {currentQuote.changePercent.toFixed(2)}%)
          </div>
        </div>
      )}
    </div>
  );
}
