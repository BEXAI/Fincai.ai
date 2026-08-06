import { cn } from "@/lib/utils";

interface ChartOverlayGradientProps {
  intensity?: number;
  className?: string;
}

export function ChartOverlayGradient({
  intensity = 1,
  className,
}: ChartOverlayGradientProps) {
  return (
    <div
      className={cn(
        "fixed bottom-0 left-0 right-0 h-[70vh] z-[2] pointer-events-none chart-overlay-gradient",
        className
      )}
      style={{ opacity: intensity }}
      aria-hidden="true"
      data-testid="chart-overlay-gradient"
    />
  );
}
