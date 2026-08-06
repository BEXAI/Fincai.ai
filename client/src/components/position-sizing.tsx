import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";

interface PositionSizingProps {
  premiumPerContract: number;
  maxLossPerContract: number;
  onSizeCalculated?: (contracts: number) => void;
}

export function PositionSizing({
  premiumPerContract,
  maxLossPerContract,
  onSizeCalculated,
}: PositionSizingProps) {
  const [accountValue, setAccountValue] = useState(50000);
  const [riskPercentage, setRiskPercentage] = useState(2);

  const maxRiskPerPosition = (accountValue * riskPercentage) / 100;
  const recommendedContracts = Math.floor(maxRiskPerPosition / Math.abs(maxLossPerContract));
  const totalCost = recommendedContracts * premiumPerContract;
  const totalRisk = recommendedContracts * Math.abs(maxLossPerContract);

  return (
    <Card data-testid="card-position-sizing">
      <CardHeader>
        <CardTitle className="text-xl">Position Sizing Calculator</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="account-value">Account Value</Label>
          <Input
            id="account-value"
            type="number"
            value={accountValue}
            onChange={(e) => setAccountValue(Number(e.target.value))}
            className="font-mono"
            data-testid="input-account-value"
          />
        </div>

        <div className="space-y-2">
          <div className="flex justify-between">
            <Label>Risk Per Position</Label>
            <span className="text-sm font-mono text-muted-foreground">
              {riskPercentage}%
            </span>
          </div>
          <Slider
            value={[riskPercentage]}
            onValueChange={(value) => setRiskPercentage(value[0])}
            max={5}
            min={0.5}
            step={0.5}
            data-testid="slider-risk-percentage"
          />
          <p className="text-xs text-muted-foreground">
            Conservative: 1-2% | Aggressive: 3-5%
          </p>
        </div>

        <div className="space-y-4 pt-4 border-t border-border">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Max Risk Per Position</span>
            <span className="font-mono font-medium" data-testid="text-max-risk">
              ${maxRiskPerPosition.toFixed(2)}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Recommended Contracts</span>
            <span className="text-2xl font-mono font-semibold text-primary" data-testid="text-recommended-contracts">
              {recommendedContracts}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Total Cost</span>
            <span className="font-mono font-medium" data-testid="text-total-cost">
              ${totalCost.toFixed(2)}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Total Risk</span>
            <span className="font-mono font-medium text-loss" data-testid="text-total-risk">
              ${totalRisk.toFixed(2)}
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Account Impact</span>
            <span className="font-mono font-medium">
              {((totalRisk / accountValue) * 100).toFixed(2)}%
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
