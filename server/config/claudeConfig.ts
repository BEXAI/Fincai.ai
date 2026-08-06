/**
 * Claude Configuration Loader
 * 
 * Loads, validates, and provides typed access to claude-config.json
 * This is the single source of truth for AI agent configuration.
 */

import { z } from "zod";
import * as fs from "fs";
import * as path from "path";

const ToolInputSchema = z.object({
  type: z.literal("object"),
  properties: z.record(z.any()),
  required: z.array(z.string()),
});

const ToolSchema = z.object({
  name: z.string(),
  description: z.string(),
  input_schema: ToolInputSchema,
});

const KPISchema = z.object({
  metric: z.string(),
  target: z.string(),
  purpose: z.string(),
});

const ErrorClassificationSchema = z.object({
  action: z.enum(["BLOCK", "WARN", "FLAG", "PRESERVE"]),
  description: z.string(),
});

const ClaudeConfigSchema = z.object({
  config_version: z.string(),
  platform: z.string(),
  last_updated: z.string(),
  
  model_config: z.object({
    model: z.string(),
    max_tokens: z.number(),
    temperature: z.number(),
    top_p: z.number(),
    stream: z.boolean(),
  }),

  agent_persona: z.object({
    identity: z.string(),
    credentials: z.array(z.string()),
    mission: z.string(),
    tone: z.string(),
    expertise: z.array(z.string()),
  }),

  strategic_kpis: z.array(KPISchema),

  capabilities: z.object({
    trading: z.array(z.string()),
    analysis: z.array(z.string()),
    quantitative: z.array(z.string()),
  }),

  tools: z.array(ToolSchema),

  constraints: z.object({
    execution_guards: z.array(z.string()),
    advice_guards: z.array(z.string()),
    data_guards: z.array(z.string()),
    style_guards: z.array(z.string()),
  }),

  error_classification: z.record(ErrorClassificationSchema),

  response_format: z.object({
    validation_summary: z.object({
      required_for: z.array(z.string()),
      format: z.array(z.string()),
    }),
    chain_of_thought: z.object({
      steps: z.array(z.string()),
    }),
    mandatory_disclaimer: z.string(),
  }),

  intent_classification: z.object({
    intents: z.array(z.string()),
    blacklist_words: z.array(z.string()),
  }),
});

export type ClaudeConfig = z.infer<typeof ClaudeConfigSchema>;
export type ModelConfig = ClaudeConfig["model_config"];
export type AgentPersona = ClaudeConfig["agent_persona"];
export type Constraints = ClaudeConfig["constraints"];
export type ResponseFormat = ClaudeConfig["response_format"];

let cachedConfig: ClaudeConfig | null = null;

export function loadClaudeConfig(): ClaudeConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const configPath = path.join(process.cwd(), "claude-config.json");
  
  if (!fs.existsSync(configPath)) {
    console.warn("claude-config.json not found, using defaults");
    return getDefaultConfig();
  }

  try {
    const rawConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    const validated = ClaudeConfigSchema.parse(rawConfig);
    cachedConfig = validated;
    console.log(`Loaded Claude config v${validated.config_version} for ${validated.platform}`);
    return validated;
  } catch (error) {
    console.error("Failed to load claude-config.json:", error);
    return getDefaultConfig();
  }
}

export function refreshConfig(): ClaudeConfig {
  cachedConfig = null;
  return loadClaudeConfig();
}

export function getModelConfig(): ModelConfig {
  return loadClaudeConfig().model_config;
}

export function getAgentPersona(): AgentPersona {
  return loadClaudeConfig().agent_persona;
}

export function getConstraints(): Constraints {
  return loadClaudeConfig().constraints;
}

export function getResponseFormat(): ResponseFormat {
  return loadClaudeConfig().response_format;
}

export function getMandatoryDisclaimer(): string {
  return loadClaudeConfig().response_format.mandatory_disclaimer;
}

export function getIntentBlacklist(): string[] {
  return loadClaudeConfig().intent_classification.blacklist_words;
}

export function buildSystemPromptFromConfig(): string {
  const config = loadClaudeConfig();
  const { agent_persona, constraints, response_format, strategic_kpis } = config;

  const kpiSummary = strategic_kpis
    .map(k => `- ${k.metric}: ${k.target} (${k.purpose})`)
    .join("\n");

  const allConstraints = [
    ...constraints.execution_guards,
    ...constraints.advice_guards,
    ...constraints.data_guards,
    ...constraints.style_guards,
  ];

  const chainOfThought = response_format.chain_of_thought.steps
    .map((step, i) => `${i + 1}. ${step}`)
    .join("\n");

  return `# ${agent_persona.identity}

## Credentials
${agent_persona.credentials.map(c => `- ${c}`).join("\n")}

## Mission
${agent_persona.mission}

## Communication Style
${agent_persona.tone}

## Expertise
${agent_persona.expertise.map(e => `- ${e}`).join("\n")}

## Strategic KPIs
${kpiSummary}

## Operational Constraints
${allConstraints.map(c => `- ${c}`).join("\n")}

## Response Format
When analyzing trades or providing recommendations, follow this chain of thought:
${chainOfThought}

## Validation Summary (Required for Trade Requests)
${response_format.validation_summary.format.join("\n")}

## Disclaimer
${response_format.mandatory_disclaimer}
`;
}

function getDefaultConfig(): ClaudeConfig {
  return {
    config_version: "1.0",
    platform: "fincai.ai",
    last_updated: "2025-01",
    model_config: {
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      temperature: 0.3,
      top_p: 0.9,
      stream: true,
    },
    agent_persona: {
      identity: "Lead Quantitative CFO & AI Architect for Fincai.ai",
      credentials: [
        "MIT-educated Mathematician (Statistics/Math)",
        "CFA Charterholder",
        "CPA",
        "Senior LLM Engineer",
      ],
      mission: "Manage the intersection of corporate finance, algorithmic trading logic, and AI-driven investor relations.",
      tone: "Highly analytical, surgically precise, executive-level, and proactively technical",
      expertise: [
        "Quantitative modeling",
        "Python-based financial engineering",
        "SaaS metrics (LTV/CAC)",
        "High-frequency data analysis",
        "LLM orchestration",
      ],
    },
    strategic_kpis: [
      { metric: "CAC Payback", target: "< 6 Months", purpose: "Aggressive growth" },
      { metric: "LTV / CAC", target: "> 4.0x", purpose: "Long-term sustainability" },
      { metric: "Inference Cost / Trade", target: "< $0.05", purpose: "LLM overhead control" },
      { metric: "Platform Uptime", target: "99.99%", purpose: "Real-time execution criticality" },
      { metric: "Model Accuracy", target: "> 62% Directional", purpose: "Signal generation success" },
    ],
    capabilities: {
      trading: ["Real-time quotes", "Order execution", "Alert management"],
      analysis: ["Technical analysis", "Sentiment detection", "Market regime"],
      quantitative: ["Options pricing", "Greeks", "VaR", "Monte Carlo"],
    },
    tools: [],
    constraints: {
      execution_guards: ["Never execute trades without explicit user confirmation"],
      advice_guards: ["Never provide personalized financial advice"],
      data_guards: ["Only use verified API data (no hallucination)"],
      style_guards: ["Preserve exact symbols, quantities, order types"],
    },
    error_classification: {
      SYNTAX_ERROR: { action: "BLOCK", description: "Order will fail" },
      RUNTIME_ERROR: { action: "WARN", description: "Order may fail" },
      LOGIC_WARNING: { action: "FLAG", description: "Valid but may not match intent" },
      INTENTIONAL_LOGIC: { action: "PRESERVE", description: "Unusual but intentional" },
    },
    response_format: {
      validation_summary: {
        required_for: ["trade_requests"],
        format: ["Symbol verified", "Quantity valid", "Buying power check"],
      },
      chain_of_thought: {
        steps: ["DATA_GATHERING", "INDICATOR_ANALYSIS", "RISK_ASSESSMENT", "RECOMMENDATION"],
      },
      mandatory_disclaimer: "This analysis is for informational purposes only and does not constitute financial advice.",
    },
    intent_classification: {
      intents: ["GREETING", "STOCK_QUERY", "TRADING_COMMAND"],
      blacklist_words: ["hello", "hi", "hey", "thanks"],
    },
  };
}

export const claudeConfig = loadClaudeConfig();
