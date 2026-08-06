import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Bell, BellRing, Activity, Receipt, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

// Mirrors the server `notifications` row as serialized over JSON (Date -> string).
interface FeedNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  symbol: string | null;
  relatedId: string | null;
  read: boolean;
  createdAt: string;
}

const REFETCH_MS = 30000;

function iconForType(type: string) {
  switch (type) {
    case "price_alert":
      return BellRing;
    case "strategy":
      return Activity;
    case "agent_order":
      return Receipt;
    default:
      return Bell;
  }
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();

  const { data: notifications = [] } = useQuery<FeedNotification[]>({
    queryKey: ["/api/notifications"],
    refetchInterval: REFETCH_MS,
  });

  // Toast when genuinely new notifications arrive — but never on the first load
  // (otherwise we'd toast the entire backlog every time the app mounts).
  const seenIds = useRef<Set<string>>(new Set());
  const initialized = useRef(false);
  useEffect(() => {
    const fresh = notifications.filter((n) => !seenIds.current.has(n.id));
    if (initialized.current && fresh.length > 0) {
      const top = fresh[0];
      toast({
        title: top.title,
        description:
          fresh.length > 1 ? `${top.message} (+${fresh.length - 1} more)` : top.message,
      });
    }
    fresh.forEach((n) => seenIds.current.add(n.id));
    initialized.current = true;
  }, [notifications, toast]);

  const markRead = useMutation({
    mutationFn: async (id: string) => apiRequest("PATCH", `/api/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/notifications/read-all"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          data-testid="notification-bell"
          aria-label={
            unreadCount > 0
              ? `Notifications, ${unreadCount} unread`
              : "Notifications"
          }
          aria-haspopup="true"
          aria-expanded={open}
        >
          <Bell className="h-5 w-5" aria-hidden="true" />
          {unreadCount > 0 && (
            <Badge
              className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1.5 text-xs bg-destructive text-destructive-foreground border-0 font-bold shadow-sm"
              data-testid="notification-count"
              aria-hidden="true"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between gap-2 p-3 border-b border-border">
          <div>
            <h4 className="font-semibold text-sm">Notifications</h4>
            <p className="text-xs text-muted-foreground" data-testid="text-notification-summary">
              {unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up"}
            </p>
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
              data-testid="button-mark-all-read"
            >
              <CheckCheck className="h-4 w-4 mr-1" />
              Mark all read
            </Button>
          )}
        </div>
        <ScrollArea className="h-[320px]">
          {notifications.length > 0 ? (
            <div className="p-2 space-y-1">
              {notifications.map((n) => {
                const Icon = iconForType(n.type);
                return (
                  <div
                    key={n.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      if (!n.read) markRead.mutate(n.id);
                    }}
                    onKeyDown={(e) => {
                      if ((e.key === "Enter" || e.key === " ") && !n.read) {
                        e.preventDefault();
                        markRead.mutate(n.id);
                      }
                    }}
                    className={cn(
                      "flex gap-3 p-3 rounded-md cursor-pointer hover-elevate active-elevate-2",
                      !n.read && "bg-primary/5",
                    )}
                    data-testid={`notification-${n.id}`}
                  >
                    <div className="mt-0.5 text-muted-foreground" aria-hidden="true">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-sm truncate" data-testid={`text-notification-title-${n.id}`}>
                          {n.title}
                        </span>
                        {!n.read && (
                          <span
                            className="h-2 w-2 flex-shrink-0 rounded-full bg-primary"
                            aria-label="Unread"
                            data-testid={`dot-unread-${n.id}`}
                          />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 break-words">
                        {n.message}
                      </p>
                      <p className="text-xs text-muted-foreground/70 mt-1">
                        {format(new Date(n.createdAt), "MMM d, h:mm a")}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center">
              <Bell className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">No notifications yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Price alerts, strategy events, and order updates will show up here
              </p>
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
