---
name: Vite dep re-optimization transient crash
description: Why a freshly-edited lazy page can crash once with a React null-dispatcher error right after a workflow restart, and why it is usually not a real bug.
---

After restarting the `Start application` workflow, the FIRST client-side load of a freshly-edited, lazy-loaded page that newly imports several shadcn/ui primitives (e.g. Collapsible, Alert, Skeleton) can transiently crash into the error boundary with `Cannot read properties of null (reading 'useState')` (a React null-dispatcher error).

**Why:** Vite's dev server re-runs dependency optimization when a page introduces new imports; during that re-bundle a partially-loaded module graph can momentarily yield a null React dispatcher. A full page load completes optimization and the page is stable afterward.

**How to apply:** Before trusting an e2e failure that shows this exact error on a just-edited page, warm the page with one direct load (screenshot or refresh) and re-run the test. Don't rewrite working React/hook code chasing a phantom hooks-order bug — first verify the imports are clean (no explicit `import React`) and that all hooks live inside the component, then re-test.
