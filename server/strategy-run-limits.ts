// Position-size caps for autonomous (agent-placed) trading. Conservative on
// purpose for V1 — enforced both at run creation AND again immediately before a
// live entry order, since a delayed trigger can move the notional past the cap.
export const MAX_RUN_QUANTITY = 1000; // shares per run
export const MAX_RUN_NOTIONAL = 10_000; // USD per run
