// A tiny, dependency-free helper that detects "promo capture mode" — a URL
// flag (`?capture=1`) used only when taking the clean product screenshots that
// illustrate the /promo feature tour. In this mode the app suppresses the
// first-run onboarding walkthrough, the getting-started checklist, the
// new-account prompt, and celebratory toasts so a screenshot shows the real
// feature with no overlays. It has no effect on normal visitors.
export function isPromoCaptureMode(): boolean {
  if (typeof window === "undefined") return false;
  // Dev-only. This flag bypasses the sign-in gate (AuthGate) and suppresses
  // onboarding overlays so clean product screenshots can be captured for the
  // /promo tour. It must NEVER take effect in a production build — otherwise
  // `?capture=1` would be a public authorization bypass on gated features.
  if (!import.meta.env.DEV) return false;
  try {
    return new URLSearchParams(window.location.search).get("capture") === "1";
  } catch {
    return false;
  }
}
