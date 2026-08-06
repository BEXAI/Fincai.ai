import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { BookText, Edit, Trash2, Filter, TrendingUp, TrendingDown } from "lucide-react";
import type { Trade, Strategy } from "@shared/schema";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";

const EMOTIONS = [
  "confident",
  "fearful",
  "greedy",
  "disciplined",
  "anxious",
  "neutral",
] as const;

const DEADLY_MISTAKES = [
  "Overleveraging",
  "Revenge trading",
  "No stop loss",
  "Moving stop loss",
  "Holding losers",
  "Cutting winners early",
  "Ignoring plan",
] as const;

const tradeFormSchema = z.object({
  symbol: z.string().min(1, "Symbol is required"),
  entryDate: z.string().min(1, "Entry date is required"),
  entryPrice: z.coerce.number().positive("Entry price must be positive"),
  quantity: z.coerce.number().int().positive("Quantity must be positive"),
  exitDate: z.string().optional(),
  exitPrice: z.coerce.number().positive().optional(),
  strategyId: z.string().optional(),
  emotion: z.enum(EMOTIONS).optional(),
  ruleAdherence: z.coerce.number().min(1).max(10).optional(),
  notes: z.string().optional(),
  mistakes: z.array(z.string()).optional(),
});

type TradeFormData = z.infer<typeof tradeFormSchema>;

export default function TradeJournal() {
  const { toast } = useToast();
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [filterSymbol, setFilterSymbol] = useState("");
  const [filterEmotion, setFilterEmotion] = useState<string>("");

  const { data: trades = [], isLoading: isLoadingTrades } = useQuery<Trade[]>({
    queryKey: ["/api/trades"],
  });

  const { data: strategies = [] } = useQuery<Strategy[]>({
    queryKey: ["/api/strategies"],
  });

  const form = useForm<TradeFormData>({
    resolver: zodResolver(tradeFormSchema),
    defaultValues: {
      symbol: "",
      entryDate: new Date().toISOString().split("T")[0],
      entryPrice: 0,
      quantity: 1,
      exitDate: "",
      exitPrice: undefined,
      strategyId: "",
      emotion: undefined,
      ruleAdherence: 7,
      notes: "",
      mistakes: [],
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: TradeFormData) => {
      const payload = {
        ...data,
        entryDate: new Date(data.entryDate),
        exitDate: data.exitDate ? new Date(data.exitDate) : null,
        profitLoss: data.exitPrice
          ? (data.exitPrice - data.entryPrice) * data.quantity
          : null,
        profitLossPercent: data.exitPrice
          ? ((data.exitPrice - data.entryPrice) / data.entryPrice) * 100
          : null,
      };
      const response = await apiRequest("POST", "/api/trades", payload);
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Trade Added",
        description: "Trade has been recorded successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/trades"] });
      form.reset();
      setIsDialogOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: TradeFormData }) => {
      const payload = {
        ...data,
        entryDate: new Date(data.entryDate),
        exitDate: data.exitDate ? new Date(data.exitDate) : null,
        profitLoss: data.exitPrice
          ? (data.exitPrice - data.entryPrice) * data.quantity
          : null,
        profitLossPercent: data.exitPrice
          ? ((data.exitPrice - data.entryPrice) / data.entryPrice) * 100
          : null,
      };
      const response = await apiRequest("PUT", `/api/trades/${id}`, payload);
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Trade Updated",
        description: "Trade has been updated successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/trades"] });
      setEditingTrade(null);
      setIsDialogOpen(false);
      form.reset();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await apiRequest("DELETE", `/api/trades/${id}`);
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Trade Deleted",
        description: "Trade has been removed from your journal.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/trades"] });
    },
  });

  const onSubmit = (data: TradeFormData) => {
    if (editingTrade) {
      updateMutation.mutate({ id: editingTrade.id, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (trade: Trade) => {
    setEditingTrade(trade);
    form.reset({
      symbol: trade.symbol,
      entryDate: new Date(trade.entryDate).toISOString().split("T")[0],
      entryPrice: trade.entryPrice,
      quantity: trade.quantity,
      exitDate: trade.exitDate
        ? new Date(trade.exitDate).toISOString().split("T")[0]
        : "",
      exitPrice: trade.exitPrice || undefined,
      strategyId: trade.strategyId || "",
      emotion: (trade.emotion as any) || undefined,
      ruleAdherence: trade.ruleAdherence || 7,
      notes: trade.notes || "",
      mistakes: trade.mistakes || [],
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this trade?")) {
      deleteMutation.mutate(id);
    }
  };

  const filteredTrades = trades.filter((trade) => {
    if (filterSymbol && !trade.symbol.toLowerCase().includes(filterSymbol.toLowerCase())) {
      return false;
    }
    if (filterEmotion && trade.emotion !== filterEmotion) {
      return false;
    }
    return true;
  });

  const entryPrice = form.watch("entryPrice");
  const exitPrice = form.watch("exitPrice");
  const quantity = form.watch("quantity");
  const calculatedPL = exitPrice && entryPrice
    ? (exitPrice - entryPrice) * quantity
    : null;
  const calculatedPLPercent = exitPrice && entryPrice
    ? ((exitPrice - entryPrice) / entryPrice) * 100
    : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Trade Journal</h1>
          <p className="text-muted-foreground">
            Track and analyze your trading history
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button
              onClick={() => {
                setEditingTrade(null);
                form.reset();
              }}
              data-testid="button-add-trade"
            >
              <BookText className="h-4 w-4 mr-2" />
              Add Trade
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingTrade ? "Edit Trade" : "Add New Trade"}
              </DialogTitle>
              <DialogDescription>
                Record your trade details and performance
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="symbol">Symbol *</Label>
                  <Input
                    id="symbol"
                    {...form.register("symbol")}
                    placeholder="QQQ"
                    className="uppercase"
                    data-testid="input-symbol"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quantity">Quantity *</Label>
                  <Input
                    id="quantity"
                    type="number"
                    {...form.register("quantity")}
                    className="font-mono"
                    data-testid="input-quantity"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="entryDate">Entry Date *</Label>
                  <Input
                    id="entryDate"
                    type="date"
                    {...form.register("entryDate")}
                    data-testid="input-entry-date"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="entryPrice">Entry Price *</Label>
                  <Input
                    id="entryPrice"
                    type="number"
                    step="0.01"
                    {...form.register("entryPrice")}
                    className="font-mono"
                    data-testid="input-entry-price"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="exitDate">Exit Date</Label>
                  <Input
                    id="exitDate"
                    type="date"
                    {...form.register("exitDate")}
                    data-testid="input-exit-date"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="exitPrice">Exit Price</Label>
                  <Input
                    id="exitPrice"
                    type="number"
                    step="0.01"
                    {...form.register("exitPrice")}
                    className="font-mono"
                    data-testid="input-exit-price"
                  />
                </div>
              </div>

              {calculatedPL !== null && (
                <div className="p-4 bg-muted rounded-md space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">P&L:</span>
                    <span
                      className={`font-mono font-medium ${
                        calculatedPL >= 0 ? "text-profit" : "text-loss"
                      }`}
                      data-testid="text-calculated-pl"
                    >
                      ${calculatedPL.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">P&L %:</span>
                    <span
                      className={`font-mono font-medium ${
                        calculatedPLPercent! >= 0 ? "text-profit" : "text-loss"
                      }`}
                      data-testid="text-calculated-pl-percent"
                    >
                      {calculatedPLPercent!.toFixed(2)}%
                    </span>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="strategy">Strategy (Optional)</Label>
                <Select
                  value={form.watch("strategyId") || ""}
                  onValueChange={(value) => form.setValue("strategyId", value)}
                >
                  <SelectTrigger data-testid="select-strategy">
                    <SelectValue placeholder="Select a strategy" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">None</SelectItem>
                    {strategies.map((strategy) => (
                      <SelectItem key={strategy.id} value={strategy.id}>
                        {strategy.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="emotion">Emotion</Label>
                <Select
                  value={form.watch("emotion") || ""}
                  onValueChange={(value: any) => form.setValue("emotion", value)}
                >
                  <SelectTrigger data-testid="select-emotion">
                    <SelectValue placeholder="Select emotion" />
                  </SelectTrigger>
                  <SelectContent>
                    {EMOTIONS.map((emotion) => (
                      <SelectItem key={emotion} value={emotion}>
                        {emotion.charAt(0).toUpperCase() + emotion.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ruleAdherence">
                  Rule Adherence: {form.watch("ruleAdherence")}/10
                </Label>
                <Slider
                  value={[form.watch("ruleAdherence") || 7]}
                  onValueChange={([value]) => form.setValue("ruleAdherence", value)}
                  min={1}
                  max={10}
                  step={1}
                  className="w-full"
                  data-testid="slider-rule-adherence"
                />
              </div>

              <div className="space-y-2">
                <Label>Mistakes Made</Label>
                <div className="grid grid-cols-2 gap-2">
                  {DEADLY_MISTAKES.map((mistake) => (
                    <div key={mistake} className="flex items-center gap-2">
                      <Checkbox
                        checked={form.watch("mistakes")?.includes(mistake)}
                        onCheckedChange={(checked) => {
                          const current = form.watch("mistakes") || [];
                          if (checked) {
                            form.setValue("mistakes", [...current, mistake]);
                          } else {
                            form.setValue(
                              "mistakes",
                              current.filter((m) => m !== mistake)
                            );
                          }
                        }}
                        data-testid={`checkbox-mistake-${mistake.toLowerCase().replace(/\s+/g, "-")}`}
                      />
                      <Label className="text-xs cursor-pointer">{mistake}</Label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  {...form.register("notes")}
                  placeholder="Trade observations..."
                  rows={3}
                  data-testid="textarea-notes"
                />
              </div>

              <div className="flex gap-2">
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-save-trade"
                >
                  {editingTrade ? "Update Trade" : "Add Trade"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsDialogOpen(false);
                    setEditingTrade(null);
                    form.reset();
                  }}
                  data-testid="button-cancel"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="filterSymbol">Symbol</Label>
              <Input
                id="filterSymbol"
                value={filterSymbol}
                onChange={(e) => setFilterSymbol(e.target.value)}
                placeholder="Filter by symbol..."
                className="uppercase"
                data-testid="input-filter-symbol"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="filterEmotion">Emotion</Label>
              <Select value={filterEmotion} onValueChange={setFilterEmotion}>
                <SelectTrigger data-testid="select-filter-emotion">
                  <SelectValue placeholder="All emotions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All emotions</SelectItem>
                  {EMOTIONS.map((emotion) => (
                    <SelectItem key={emotion} value={emotion}>
                      {emotion.charAt(0).toUpperCase() + emotion.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Trade History</CardTitle>
          <CardDescription>
            {filteredTrades.length} trade{filteredTrades.length !== 1 ? "s" : ""} recorded
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingTrades ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading trades...
            </div>
          ) : filteredTrades.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No trades recorded yet. Click "Add Trade" to get started.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Symbol</TableHead>
                    <TableHead>Entry Date</TableHead>
                    <TableHead className="text-right">Entry Price</TableHead>
                    <TableHead className="text-right">Quantity</TableHead>
                    <TableHead>Exit Date</TableHead>
                    <TableHead className="text-right">Exit Price</TableHead>
                    <TableHead className="text-right">P&L</TableHead>
                    <TableHead className="text-right">P&L %</TableHead>
                    <TableHead>Emotion</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTrades.map((trade) => (
                    <TableRow key={trade.id} data-testid={`row-trade-${trade.id}`}>
                      <TableCell className="font-medium">{trade.symbol}</TableCell>
                      <TableCell className="text-sm">
                        {new Date(trade.entryDate).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        ${trade.entryPrice.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {trade.quantity}
                      </TableCell>
                      <TableCell className="text-sm">
                        {trade.exitDate
                          ? new Date(trade.exitDate).toLocaleDateString()
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {trade.exitPrice ? `$${trade.exitPrice.toFixed(2)}` : "-"}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {trade.profitLoss !== null ? (
                          <span
                            className={
                              trade.profitLoss >= 0 ? "text-profit" : "text-loss"
                            }
                          >
                            {trade.profitLoss >= 0 ? (
                              <TrendingUp className="h-3 w-3 inline mr-1" />
                            ) : (
                              <TrendingDown className="h-3 w-3 inline mr-1" />
                            )}
                            ${Math.abs(trade.profitLoss).toFixed(2)}
                          </span>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {trade.profitLossPercent !== null ? (
                          <span
                            className={
                              trade.profitLossPercent >= 0
                                ? "text-profit"
                                : "text-loss"
                            }
                          >
                            {trade.profitLossPercent.toFixed(2)}%
                          </span>
                        ) : (
                          "-"
                        )}
                      </TableCell>
                      <TableCell>
                        {trade.emotion && (
                          <Badge variant="outline" className="text-xs">
                            {trade.emotion}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleEdit(trade)}
                            data-testid={`button-edit-${trade.id}`}
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDelete(trade.id)}
                            data-testid={`button-delete-${trade.id}`}
                          >
                            <Trash2 className="h-3 w-3 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
