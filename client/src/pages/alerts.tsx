import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Bell, Plus, Trash2, TrendingUp, TrendingDown, AlertCircle } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

interface PriceAlert {
  id: number;
  symbol: string;
  targetPrice: string;
  condition: string;
  status: string;
  createdAt: string;
}

export default function Alerts() {
  const [newAlertOpen, setNewAlertOpen] = useState(false);
  const [symbol, setSymbol] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [condition, setCondition] = useState<"above" | "below">("above");
  const { toast } = useToast();

  const { data: alerts = [], isLoading } = useQuery<PriceAlert[]>({
    queryKey: ["/api/alerts"],
  });

  const createAlert = useMutation({
    mutationFn: async (data: { symbol: string; targetPrice: number; condition: string }) => {
      return apiRequest("POST", "/api/alerts", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      setNewAlertOpen(false);
      setSymbol("");
      setTargetPrice("");
      toast({
        title: "Alert created",
        description: `You'll be notified when ${symbol.toUpperCase()} goes ${condition} $${targetPrice}`,
      });
    },
    onError: () => {
      toast({
        title: "Failed to create alert",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  const deleteAlert = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/alerts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alerts"] });
      toast({
        title: "Alert deleted",
      });
    },
  });

  const handleCreateAlert = () => {
    if (!symbol || !targetPrice) return;
    createAlert.mutate({
      symbol: symbol.toUpperCase(),
      targetPrice: parseFloat(targetPrice),
      condition,
    });
  };

  const triggeredAlerts = alerts.filter(a => a.status === "triggered");
  const activeAlerts = alerts.filter(a => a.status === "active");

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Price Alerts</h1>
          <p className="text-sm text-muted-foreground">
            Get notified when prices hit your targets
          </p>
        </div>
        <Dialog open={newAlertOpen} onOpenChange={setNewAlertOpen}>
          <DialogTrigger asChild>
            <Button size="sm" data-testid="button-new-alert">
              <Plus className="h-4 w-4 mr-2" />
              New Alert
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Price Alert</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="symbol">Symbol</Label>
                <Input
                  id="symbol"
                  placeholder="e.g., AAPL"
                  value={symbol}
                  onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                  data-testid="input-alert-symbol"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="condition">Condition</Label>
                <Select value={condition} onValueChange={(v) => setCondition(v as "above" | "below")}>
                  <SelectTrigger data-testid="select-alert-condition">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="above">Price goes above</SelectItem>
                    <SelectItem value="below">Price goes below</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="price">Target Price</Label>
                <Input
                  id="price"
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={targetPrice}
                  onChange={(e) => setTargetPrice(e.target.value)}
                  data-testid="input-alert-price"
                />
              </div>
              <Button 
                className="w-full" 
                onClick={handleCreateAlert}
                disabled={!symbol || !targetPrice || createAlert.isPending}
                data-testid="button-create-alert"
              >
                Create Alert
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {triggeredAlerts.length > 0 && (
        <Card className="border-loss/30 bg-loss/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2 text-loss">
              <AlertCircle className="h-4 w-4" />
              Triggered Alerts
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {triggeredAlerts.map((alert) => (
              <div 
                key={alert.id}
                className="flex items-center justify-between p-3 rounded-lg bg-background"
                data-testid={`alert-triggered-${alert.id}`}
              >
                <div className="flex items-center gap-3">
                  {alert.condition === "above" ? (
                    <TrendingUp className="h-4 w-4 text-profit" />
                  ) : (
                    <TrendingDown className="h-4 w-4 text-loss" />
                  )}
                  <div>
                    <p className="font-medium">{alert.symbol}</p>
                    <p className="text-xs text-muted-foreground">
                      {alert.condition === "above" ? "Above" : "Below"} ${parseFloat(alert.targetPrice).toFixed(2)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-loss border-loss/30">
                    Triggered
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteAlert.mutate(alert.id)}
                    data-testid={`button-delete-alert-${alert.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Active Alerts
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 bg-muted/50 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : activeAlerts.length > 0 ? (
            <div className="space-y-2">
              {activeAlerts.map((alert) => (
                <div 
                  key={alert.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
                  data-testid={`alert-active-${alert.id}`}
                >
                  <div className="flex items-center gap-3">
                    {alert.condition === "above" ? (
                      <div className="p-2 rounded-full bg-profit/10">
                        <TrendingUp className="h-4 w-4 text-profit" />
                      </div>
                    ) : (
                      <div className="p-2 rounded-full bg-loss/10">
                        <TrendingDown className="h-4 w-4 text-loss" />
                      </div>
                    )}
                    <div>
                      <p className="font-medium">{alert.symbol}</p>
                      <p className="text-xs text-muted-foreground">
                        {alert.condition === "above" ? "Above" : "Below"} ${parseFloat(alert.targetPrice).toFixed(2)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(alert.createdAt), "MMM d")}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteAlert.mutate(alert.id)}
                      data-testid={`button-delete-alert-${alert.id}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <Bell className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground mb-2">No active alerts</p>
              <p className="text-xs text-muted-foreground">
                Create an alert to get notified when prices hit your targets
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
