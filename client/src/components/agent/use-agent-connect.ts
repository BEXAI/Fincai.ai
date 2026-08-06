import { useState } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export interface AgentConnectStatus {
  status: "disconnected" | "authorizing" | "connected" | "error";
  endpoint: string;
  authorizationUrl?: string;
  lastError?: string;
  tools: { name: string; description?: string }[];
  connectedAt?: number;
}

// Shared connect/disconnect logic for the Robinhood Trading agent. Powers both
// the flagship landing hero CTA and the compact connected status bar so the
// underlying connect, authorize-URL, and disconnect behavior stays identical.
export function useAgentConnect(status: AgentConnectStatus) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/agent/status"] });
    queryClient.invalidateQueries({ queryKey: ["/api/agent/portfolio"] });
  };

  const handleConnect = async () => {
    setBusy(true);
    try {
      const res = await apiRequest("POST", "/api/agent/connect", {});
      const data = await res.json();
      invalidate();
      if (data.authorizationUrl) {
        window.open(data.authorizationUrl, "_blank", "noopener,noreferrer");
        toast({
          title: "Authorize the agent",
          description:
            "A Robinhood onboarding tab opened. Authorize on a desktop browser, then return here.",
        });
      } else if (data.status === "connected") {
        toast({ title: "Agent connected", description: "Robinhood Trading MCP is live." });
      } else if (data.error) {
        toast({ title: "Connection issue", description: data.error, variant: "destructive" });
      }
    } catch (err: any) {
      toast({
        title: "Could not reach the agent",
        description: err?.message ?? "Unknown error",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setBusy(true);
    try {
      await apiRequest("POST", "/api/agent/disconnect", {});
      invalidate();
      toast({ title: "Agent disconnected" });
    } finally {
      setBusy(false);
    }
  };

  const copyUrl = () => {
    if (status.authorizationUrl) {
      navigator.clipboard.writeText(status.authorizationUrl);
      toast({ title: "Onboarding URL copied" });
    }
  };

  return { busy, handleConnect, handleDisconnect, copyUrl };
}
