---
name: Onboarding walkthrough & getting-started checklist
description: How first-run onboarding state is stored and gated for anon vs logged-in users.
---

# Onboarding walkthrough + getting-started checklist

A skippable first-run walkthrough plus a re-openable getting-started checklist live entirely
client-side except for one persistence flag.

## Persistence model
- Anonymous users: localStorage `fincai:onboardingCompleted` (="1") and `fincai:onboardingSteps` (JSON array of step ids).
- Logged-in users: account flag `users.onboardingCompleted` (boolean). Persisted via `POST /api/auth/onboarding/complete` (validateCsrf + isAuthenticatedJwt). The flag is also returned in both `/api/auth/user` responses.
- **Gating rule:** completed = localFlag OR (authenticated && user.onboardingCompleted). This means a user who finished onboarding anonymously won't see it re-trigger after logging in, and the account flag covers fresh devices.

**Why:** task required "never reappears once dismissed", works for anon (localStorage) and persists to account for logged-in, with backend kept minimal (single flag, no new tables).

## Wiring
- `OnboardingProvider` (client/src/contexts/OnboardingContext.tsx) wraps MainApp inside AuthProvider>ChatModeProvider; it renders the walkthrough + checklist dialogs itself, so they overlay globally (including the immersive `/chat` page that returns early before the sidebar layout).
- Checklist items auto-complete from real navigation (useLocation → route map) and the `/api/strategy-runs` signal (paper step). No separate tracking tables.
- Re-open entry points: header HelpCircle (`button-help`), sidebar footer (`button-getting-started`), mobile quick menu top row (`button-help-quick-menu`). "Replay walkthrough" button inside the checklist reopens the tour without clearing completion.

## New-account "back into the tour" nudge
- After register, AuthContext sets a one-shot `justRegistered` flag (cleared by OnboardingContext on consume).
- OnboardingContext shows a dismissible bottom-right prompt (NewAccountTourPrompt) ONLY when: justRegistered AND account `onboardingCompleted` is false AND the anonymous local flag is already set AND walkthrough not open. That local-flag gate is deliberate — it targets the user who *skipped while anonymous* (auto-open won't re-fire for them); a never-dismissed user just gets the normal auto-open instead, avoiding a double prompt.
- Dismiss ("Maybe later"/X) does NOT mark onboarding complete; it's one-time because the local flag already suppresses auto-open and justRegistered is cleared.

## Completion celebration + hide-help
- Finishing the last step fires a one-time celebratory toast; persisted `fincai:onboardingCelebrated` flag + a prev-all-done ref (skip initial render) ensure it never re-fires nor shows a delayed toast for users who were already complete on mount.
- Users can permanently hide ALL help entry points once complete, persisted via `fincai:onboardingHelpHidden`. **There are THREE entry points to gate together — header (App.tsx), sidebar footer, and mobile quick menu** — easy to miss one.
- **Why:** "permanently hide help entry points once complete" must cover every entry point and survive reloads; celebration must be once-only.

## Constraint
All copy is educational/navigational only — no personalized financial advice (matches the app's compliance stance).
