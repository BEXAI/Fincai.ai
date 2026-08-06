import { describe, it, expect } from "vitest";
import * as D from "@shared/disclosures";
import { DISCLOSURES, firstSentence } from "@shared/disclosures";

/**
 * Guards the canonical disclosure module. Every disclaimer in the product is
 * imported from here, so an empty string or a surviving template token would
 * silently ship a broken/fabricated disclosure everywhere at once.
 */

const STRING_CONSTANTS = [
  "TRADEMARK_ROBINHOOD",
  "TRADEMARK_ROBINHOOD_SHORT",
  "NOT_ADVICE",
  "RISK_GENERAL",
  "RISK_AUTONOMOUS",
  "AI_LIMITATIONS",
  "NO_PERFORMANCE",
  "USER_RESPONSIBILITY",
  "NO_FUND_MOVEMENT",
  "PAPER_DEFAULT",
  "DATA_TO_AI_PROVIDERS",
  "OCC_ODD_URL",
] as const;

// Double-brace template tokens like {{LEGAL_ENTITY_NAME}} must never survive
// into a shipped disclosure string.
const TEMPLATE_TOKEN = /\{\{[A-Z_0-9-]+\}\}/;

describe("shared/disclosures canonical strings", () => {
  for (const key of STRING_CONSTANTS) {
    it(`${key} is a non-empty string`, () => {
      const value = (D as Record<string, unknown>)[key];
      expect(typeof value).toBe("string");
      expect((value as string).trim().length).toBeGreaterThan(0);
    });

    it(`${key} contains no surviving {{TOKEN}} placeholder`, () => {
      const value = (D as Record<string, unknown>)[key] as string;
      expect(TEMPLATE_TOKEN.test(value)).toBe(false);
    });
  }

  it("short trademark disclaimer matches the string CI asserts in prerendered HTML", () => {
    expect(D.TRADEMARK_ROBINHOOD_SHORT).toBe(
      "Not affiliated with or endorsed by Robinhood Markets, Inc.",
    );
  });

  it("every DISCLOSURES entry carries a version + effective date + non-empty text", () => {
    for (const [key, entry] of Object.entries(DISCLOSURES)) {
      expect(entry.id).toBe(key);
      expect(entry.text.trim().length).toBeGreaterThan(0);
      expect(entry.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(entry.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(TEMPLATE_TOKEN.test(entry.text)).toBe(false);
    }
  });

  it("firstSentence truncates at the first terminator", () => {
    expect(firstSentence("One thing. Two thing.")).toBe("One thing.");
    expect(firstSentence(D.NOT_ADVICE)).toBe(
      "Fincai is a software tool for market analysis and order entry.",
    );
  });
});
