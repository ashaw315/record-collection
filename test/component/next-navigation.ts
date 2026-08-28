import { vi } from 'vitest';

/**
 * SPEC.md §11 component layer (A46) — a `next/navigation` stub, and the RULE
 * that makes it legitimate rather than the hollow shape this project keeps
 * finding.
 *
 * **Imported for its side effect** — `vi.mock` is hoisted, so this file is
 * `import`ed rather than called:
 *
 *     import '../../../test/component/next-navigation';
 *
 * **The problem it solves.** `useRouter()` throws `invariant expected app router
 * to be mounted` outside a Next request context. Static rendering has no way to
 * provide one, so any component calling it cannot be rendered at all — 13 of
 * this app's client components.
 *
 * ---
 *
 * **THE RULE: only for hooks whose value is never read during RENDER.**
 *
 * `router.refresh()` is called inside event handlers — `send()`, a delete
 * button, a form submit. This layer cannot reach handlers at all
 * (`renderToStaticMarkup` returns a string, not a tree), so the stub stands in
 * for a code path no assertion exercises. It supplies a framework context, not a
 * value under test.
 *
 * **`usePathname()` and `useSearchParams()` are DIFFERENT and are deliberately
 * left throwing.** `AppHeader` reads `usePathname()` during render to decide
 * which nav link is active — so a stub would be supplying the very value the
 * test would then assert on. That is stubbing past the boundary the behaviour
 * lives behind, which is the shape this project has produced four times and
 * refuses on principle.
 *
 * **The consequence, accepted rather than worked around: `AppHeader` and any
 * other render-time navigation consumer stays UNCOVERED at this layer.** It is
 * covered in E2E, where a real router exists. A component whose behaviour
 * depends on the route belongs in a browser test.
 *
 * If a future component needs a pathname at render time, pass it as a PROP
 * rather than widening this stub — which is also better design, and is what
 * `configured` already does for the Anthropic gate.
 */
vi.mock('next/navigation', () => ({
    /**
     * Handler-only. Every method is a no-op spy: calling one during render would
     * be a bug this stub should not hide, and the assertions never reach the
     * handlers that legitimately call them.
     */
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),

  /*
   * Render-time hooks are NOT stubbed — they throw, loudly, by omission. A
   * component reaching for one at this layer is telling you it needs a browser
   * test, and a stub returning '/' would answer that question with a lie.
   */
}));
