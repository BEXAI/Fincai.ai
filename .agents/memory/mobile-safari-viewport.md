---
name: Mobile Safari viewport maximization
description: How Fincai goes edge-to-edge on iOS Safari (dvh + safe-area + visualViewport keyboard offset) and the non-obvious iOS traps.
---

# Mobile Safari viewport maximization

Making the app edge-to-edge on iOS Safari (nothing clipped by address bar, notch,
home indicator, or keyboard) without touching desktop/Android.

## The working recipe
- **Viewport meta** needs `viewport-fit=cover` for `env(safe-area-inset-*)` to
  become non-zero. `interactive-widget=resizes-content` helps Android keyboard.
- **Height**: use `100dvh` (with `100vh` fallback) for the app shell, NOT `100vh`
  — `100vh` is too tall on iOS (spans behind the address bar) so bottom UI gets
  pushed off-screen. `.app-shell` = dvh + top/left/right safe-area padding.
- **Keyboard**: iOS does NOT shrink `dvh` or fire resize on `window` when the
  keyboard opens. Drive a `--keyboard-inset` CSS var from `window.visualViewport`:
  `max(0, window.innerHeight - vv.height - vv.offsetTop)`. Bottom-anchored fixed
  UI (chat composer) sets `bottom: calc(<base> + var(--keyboard-inset,0px))`.
  For a fixed-height panel (fullscreen chat) you must ALSO subtract the inset from
  its height, or raising `bottom` pushes the top off-screen.

## Traps that bit us
- **iOS ignores `maximum-scale=1` / `user-scalable=no`** since iOS 10, for BOTH
  pinch-zoom and input focus-zoom. So keeping it gains nothing on iOS and only
  blocks Android pinch-zoom (a11y). Removing it is correct. **Focus-zoom on
  sub-16px inputs is therefore pre-existing on iOS regardless of that meta** — the
  only real fix is font-size >= 16px on the input (see `mobile-input-no-zoom`).
- **Pinch-zoom looks like a keyboard** to the visualViewport math (vv.height
  shrinks, vv.offsetTop grows). Guard it: treat `vv.scale > 1.01` as zero keyboard
  inset, else bottom-anchored UI jumps while the user is zoomed in.
- **CSS layer precedence**: the mobile helper classes (`.mobile-content-area`,
  `.safe-area-*`) live in `@layer components`, but Tailwind `p-*`/`px-*` are in
  `@layer utilities` which wins. So a `p-3` on the same element silently overrides
  a component-layer `pb-20`/`padding-bottom`. Don't combine a `p-*` utility with a
  component class that sets the same padding; put safe-area padding on a wrapper
  that has no conflicting utility, or bake the value into the component rule.
