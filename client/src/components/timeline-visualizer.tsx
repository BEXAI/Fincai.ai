import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, AlertCircle } from "lucide-react";
import { format, parseISO, differenceInDays } from "date-fns";

interface TimelineEvent {
  date: string;
  label: string;
  description: string;
  type: "listing" | "announcement" | "reconstitution" | "entry" | "exit";
}

interface TimelineVisualizerProps {
  events: TimelineEvent[];
  title?: string;
}

export function TimelineVisualizer({ events, title = "Key Dates" }: TimelineVisualizerProps) {
  const sortedEvents = [...events].sort(
    (a, b) => parseISO(a.date).getTime() - parseISO(b.date).getTime()
  );

  const today = new Date();
  const firstDate = parseISO(sortedEvents[0]?.date || new Date().toISOString());
  const lastDate = parseISO(
    sortedEvents[sortedEvents.length - 1]?.date || new Date().toISOString()
  );

  const getEventColor = (type: TimelineEvent["type"]) => {
    switch (type) {
      case "listing":
        return "bg-chart-1";
      case "announcement":
        return "bg-chart-2";
      case "reconstitution":
        return "bg-chart-3";
      case "entry":
        return "bg-profit";
      case "exit":
        return "bg-loss";
      default:
        return "bg-muted";
    }
  };

  const getPosition = (date: string) => {
    const eventDate = parseISO(date);
    const totalDays = differenceInDays(lastDate, firstDate);
    const daysFromStart = differenceInDays(eventDate, firstDate);
    return (daysFromStart / totalDays) * 100;
  };

  return (
    <Card data-testid="card-timeline">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="relative h-24 bg-muted/20 rounded-md p-4">
          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-border" />
          
          {sortedEvents.map((event, idx) => {
            const position = getPosition(event.date);
            const isPast = parseISO(event.date) < today;
            
            return (
              <div
                key={idx}
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
                style={{ left: `${position}%` }}
              >
                <div
                  className={`w-3 h-3 rounded-full ${getEventColor(event.type)} ${
                    isPast ? "opacity-50" : ""
                  }`}
                  data-testid={`timeline-marker-${idx}`}
                />
              </div>
            );
          })}
        </div>

        <div className="space-y-3">
          {sortedEvents.map((event, idx) => {
            const isPast = parseISO(event.date) < today;
            const daysUntil = differenceInDays(parseISO(event.date), today);
            
            return (
              <div
                key={idx}
                className={`flex items-start gap-3 p-3 rounded-md border ${
                  isPast ? "opacity-60" : "bg-card/50"
                }`}
                data-testid={`timeline-event-${idx}`}
              >
                <div
                  className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${getEventColor(
                    event.type
                  )}`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{event.label}</span>
                    <Badge variant="outline" className="text-xs font-mono">
                      {format(parseISO(event.date), "MMM dd, yyyy")}
                    </Badge>
                    {!isPast && daysUntil <= 7 && (
                      <Badge variant="destructive" className="text-xs gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {daysUntil} days
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">
                    {event.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
