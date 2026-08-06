import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
  positive?: boolean;
}

export function Sparkline({ 
  data, 
  width = 60, 
  height = 20, 
  className,
  positive 
}: SparklineProps) {
  const pathData = useMemo(() => {
    if (!data || data.length < 2) return "";
    
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    
    const xStep = width / (data.length - 1);
    const normalize = (value: number) => height - ((value - min) / range) * (height - 4) - 2;
    
    const points = data.map((value, i) => `${i * xStep},${normalize(value)}`);
    return `M${points.join(" L")}`;
  }, [data, width, height]);

  const isPositive = positive ?? (data.length >= 2 && data[data.length - 1] >= data[0]);
  const strokeColor = isPositive ? "hsl(var(--profit))" : "hsl(var(--loss))";

  if (!data || data.length < 2) {
    return <div className={cn("bg-muted/30 rounded", className)} style={{ width, height }} />;
  }

  return (
    <svg 
      width={width} 
      height={height} 
      className={cn("overflow-visible", className)}
      data-testid="sparkline"
      role="img"
      aria-label="Price trend chart"
    >
      <path
        d={pathData}
        fill="none"
        stroke={strokeColor}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

