import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Power, ShieldCheck, Wrench } from "lucide-react";
import { useAgentConnect, type AgentConnectStatus } from "@/components/agent/use-agent-connect";

// Compact connected-state status bar. The pre-connection connect/authorize flow
// now lives in the flagship landing (AgentLanding); once the agent is live this
// collapses the connection into a slim status indicator with a disconnect action.
export function AgentConnect({ status }: { status: AgentConnectStatus }) {
  const { busy, handleDisconnect } = useAgentConnect(status);

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--glass-border)] glass-panel px-4 py-3"
      data-testid="agent-status-bar"
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-profit opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-profit" />
        </span>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium" data-testid="text-agent-connected-label">
            Agent connected
          </span>
        </div>
        <Badge variant="secondary" className="gap-1" data-testid="badge-connection-status">
          <Wrench className="h-3 w-3" />
          {status.tools.length} tools
        </Badge>
        <code className="hidden text-xs text-muted-foreground sm:inline" data-testid="text-mcp-endpoint">
          {status.endpoint}
        </code>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={handleDisconnect}
        disabled={busy}
        className="gap-2"
        data-testid="button-disconnect-agent"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
        Disconnect
      </Button>
    </div>
  );
}
