import { useEffect } from "react";

/**
 * Keeps CSS custom properties in sync with the visual viewport so mobile
 * Safari layouts can react to the on-screen keyboard and browser chrome:
 *   --app-height      the currently-visible viewport height (px)
 *   --app-offset-top  how far the visual viewport is shifted down (px)
 *   --keyboard-inset  how much the keyboard overlaps the layout viewport (px)
 *
 * iOS Safari ignores `interactive-widget` and does not shrink `dvh` units when
 * the keyboard opens, so bottom-anchored UI (like the chat composer) needs this
 * JS-driven value to stay above the keyboard.
 */
export function useViewportMetrics() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const root = document.documentElement;
    const vv = window.visualViewport;

    const update = () => {
      const height = vv?.height ?? window.innerHeight;
      const offsetTop = vv?.offsetTop ?? 0;
      // When the user pinch-zooms, the visual viewport shrinks but that is NOT a
      // keyboard — treat any zoomed-in state (scale > 1) as zero keyboard inset
      // so bottom-anchored UI doesn't jump.
      const zoomed = (vv?.scale ?? 1) > 1.01;
      const keyboard = zoomed
        ? 0
        : Math.max(0, window.innerHeight - height - offsetTop);

      root.style.setProperty("--app-height", `${Math.round(height)}px`);
      root.style.setProperty("--app-offset-top", `${Math.round(offsetTop)}px`);
      root.style.setProperty("--keyboard-inset", `${Math.round(keyboard)}px`);
    };

    update();

    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);

    return () => {
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);
}
