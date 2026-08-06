import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface Greeks {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  rho: number;
}

export interface ContractInput {
  strikePrice: number;
  volatility: number;
  optionType: "call" | "put";
}

export interface PricingChainRequest {
  symbol: string;
  spotPrice: number;
  expirationDate: string;
  contracts: ContractInput[];
  style?: "AMERICAN" | "EUROPEAN";
}

export interface PricingChainContract {
  strikePrice: number;
  optionType: "call" | "put";
  inputVolatility: number;
  price: number;
  greeks: Greeks;
}

export interface PricingChainResponse {
  success: boolean;
  data?: {
    symbol: string;
    spotPrice: number;
    expiration: string;
    timeToExpiry: number;
    style: string;
    contracts: PricingChainContract[];
    count: number;
  };
  error?: string;
}

export type GreeksMap = Map<string, Greeks>;

function createGreeksKey(strike: number, optionType: "call" | "put"): string {
  return `${strike}-${optionType}`;
}

function createContractsHash(contracts: ContractInput[]): string {
  const sorted = [...contracts].sort((a, b) => 
    a.strikePrice - b.strikePrice || a.optionType.localeCompare(b.optionType)
  );
  return sorted.map(c => `${c.strikePrice}:${c.optionType}`).join(',');
}

export function usePricingGreeks(
  symbol: string,
  spotPrice: number,
  expirationDate: string,
  contracts: ContractInput[],
  enabled: boolean = true
) {
  const contractsHash = createContractsHash(contracts);
  const roundedSpotPrice = Math.round(spotPrice * 100) / 100;
  
  return useQuery<GreeksMap>({
    queryKey: ["/api/pricing/chain", symbol, roundedSpotPrice, expirationDate, contractsHash],
    queryFn: async () => {
      if (!symbol || !spotPrice || !expirationDate || contracts.length === 0) {
        return new Map();
      }

      const payload: PricingChainRequest = {
        symbol,
        spotPrice,
        expirationDate,
        contracts,
        style: "AMERICAN",
      };

      try {
        const response = await apiRequest("POST", "/api/pricing/chain", payload);
        const data: PricingChainResponse = await response.json();

        if (!data.success || !data.data?.contracts) {
          return new Map();
        }

        const greeksMap: GreeksMap = new Map();
        
        for (const contract of data.data.contracts) {
          const key = createGreeksKey(contract.strikePrice, contract.optionType);
          if (contract.greeks) {
            greeksMap.set(key, contract.greeks);
          }
        }

        return greeksMap;
      } catch (error) {
        console.error("Failed to fetch Greeks:", error);
        return new Map();
      }
    },
    enabled: enabled && !!symbol && !!spotPrice && !!expirationDate && contracts.length > 0,
    staleTime: 30 * 1000,
    refetchInterval: 30 * 1000,
    retry: 1,
  });
}

export function getGreeksForContract(
  greeksMap: GreeksMap | undefined,
  strike: number,
  optionType: "call" | "put"
): Greeks | null {
  if (!greeksMap) return null;
  const key = createGreeksKey(strike, optionType);
  return greeksMap.get(key) ?? null;
}

export function formatGreek(value: number | undefined | null, decimals: number = 2): string {
  if (value === null || value === undefined || isNaN(value)) return "—";
  return value.toFixed(decimals);
}

export function getGreekColor(value: number | undefined | null): string {
  if (value === null || value === undefined || isNaN(value)) return "";
  if (value > 0) return "text-emerald-500";
  if (value < 0) return "text-red-500";
  return "";
}
