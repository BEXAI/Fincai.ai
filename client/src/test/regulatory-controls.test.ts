import { describe, it, expect } from "vitest";
import {
  PERSONALIZATION_LEVELS,
  PERSONALIZATION_LEVEL_DEFAULT,
  PERSONALIZATION_LEVEL_MAX_SHIPPABLE,
  isPersonalizationLevelShippable,
  assertPersonalizationLevelShippable,
  strategyRuns,
} from "@shared/schema";
import { PAPER_DEFAULT, USER_RESPONSIBILITY } from "@shared/disclosures";

/**
 * FIN-003 engineering-control assertions. These lock in the compliance posture
 * so a future edit cannot silently regress it. They intentionally test the
 * ACTUAL architecture of this product (per-run paper default; autonomous runner
 * that trades live without per-order confirmation) rather than a template of how
 * a different product might work.
 */

describe("PERSONALIZATION_LEVEL control", () => {
  it("orders levels least → most personal, with PROFILE last", () => {
    expect(PERSONALIZATION_LEVELS).toEqual([
      "NONE",
      "WATCHLIST",
      "PORTFOLIO",
      "PROFILE",
    ]);
    expect(PERSONALIZATION_LEVELS[PERSONALIZATION_LEVELS.length - 1]).toBe(
      "PROFILE",
    );
  });

  it("is capped at PORTFOLIO — below the PROFILE suitability-intake level", () => {
    expect(PERSONALIZATION_LEVEL_MAX_SHIPPABLE).toBe("PORTFOLIO");
    expect(PERSONALIZATION_LEVEL_DEFAULT).toBe("PORTFOLIO");
    // The cap must be strictly below PROFILE.
    expect(
      PERSONALIZATION_LEVELS.indexOf(PERSONALIZATION_LEVEL_MAX_SHIPPABLE),
    ).toBeLessThan(PERSONALIZATION_LEVELS.indexOf("PROFILE"));
  });

  it("marks NONE/WATCHLIST/PORTFOLIO shippable and PROFILE not shippable", () => {
    expect(isPersonalizationLevelShippable("NONE")).toBe(true);
    expect(isPersonalizationLevelShippable("WATCHLIST")).toBe(true);
    expect(isPersonalizationLevelShippable("PORTFOLIO")).toBe(true);
    expect(isPersonalizationLevelShippable("PROFILE")).toBe(false);
  });

  it("assertPersonalizationLevelShippable throws for PROFILE, passes below", () => {
    expect(() => assertPersonalizationLevelShippable("PORTFOLIO")).not.toThrow();
    expect(() => assertPersonalizationLevelShippable("PROFILE")).toThrow(
      /not shippable/i,
    );
  });
});

describe("Paper-trading default (server-enforced)", () => {
  it("defaults new strategy runs to paper at the schema/column level", () => {
    // The default lives on the Drizzle column, not a client flag, so it is
    // enforced wherever a row is inserted.
    expect(strategyRuns.mode.hasDefault).toBe(true);
    expect(strategyRuns.mode.default).toBe("paper");
  });

  it("has a disclosure describing paper default + explicit live opt-in", () => {
    expect(PAPER_DEFAULT.toLowerCase()).toContain("paper");
    expect(PAPER_DEFAULT.toLowerCase()).toContain("opt-in");
  });
});

describe("No-autoexecute posture (honest)", () => {
  /**
   * The spec asks for a test that "no code path can submit a live order without
   * a user confirmation event in the same session." In THIS product that is
   * false: the autonomous strategy runner, once a user arms a strategy in live
   * mode, places and closes live orders on a background interval without a
   * per-order confirmation. Per the spec we do not write around that — we lock
   * in copy that is accurate about it, so the false claim ("you confirm every
   * trade") cannot be reintroduced silently.
   */
  it("USER_RESPONSIBILITY does not claim every trade is individually confirmed", () => {
    const lower = USER_RESPONSIBILITY.toLowerCase();
    expect(lower).not.toContain("every trade requires");
    expect(lower).not.toContain("confirm every");
    // It must positively acknowledge the unattended live-strategy path.
    expect(lower).toContain("without a separate confirmation");
  });

  it("manual path is still described as confirmation-first", () => {
    expect(USER_RESPONSIBILITY.toLowerCase()).toContain(
      "manual trades require your explicit confirmation",
    );
  });
});
