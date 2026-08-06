import { cn } from "@/lib/utils";

type TimeRange = "1D" | "1W" | "1M" | "3M" | "YTD" | "1Y" | "ALL";

interface TimeRangeSelectorProps {
  selected: TimeRange;
  onChange: (range: TimeRange) => void;
  className?: string;
  style?: React.CSSProperties;
}

const TIME_RANGES: TimeRange[] = ["1D", "1W", "1M", "3M", "YTD", "1Y", "ALL"];

export function TimeRangeSelector({
  selected,
  onChange,
  className,
  style,
}: TimeRangeSelectorProps) {
  return (
    <div
      className={cn(
        "glass-header rounded-[16px] sm:rounded-[20px] p-1.5 sm:p-2 flex justify-between",
        className
      )}
      style={style}
      data-testid="time-range-selector"
      role="tablist"
      aria-label="Chart time range"
    >
      {TIME_RANGES.map((range) => (
        <button
          key={range}
          onClick={() => onChange(range)}
          className={cn(
            "px-2.5 sm:px-3 py-2.5 sm:py-1.5 text-[11px] sm:text-[13px] font-medium rounded-lg sm:rounded-xl transition-all duration-200",
            "min-w-[40px] sm:min-w-[44px] min-h-[44px] sm:min-h-[32px]",
            selected === range
              ? "bg-profit/15 text-profit"
              : "text-muted-foreground hover:text-foreground"
          )}
          role="tab"
          aria-selected={selected === range}
          data-testid={`button-time-range-${range.toLowerCase()}`}
        >
          {range}
        </button>
      ))}
    </div>
  );
}
