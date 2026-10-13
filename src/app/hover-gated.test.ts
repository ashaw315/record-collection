import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * **No hover style applies where the pointer cannot hover.**
 *
 * A bare `:hover` stays on a phone after a tap, until something else is
 * tapped: a control left looking pressed. Every hover rule in this build is
 * inside `@media (hover: hover)`, which keeps that from happening, and none
 * of it was written here: Tailwind 4 puts every `hover:` class behind that
 * condition by default, and `globals.css` writes no `:hover` by hand (read
 * 12 Oct: 16 rules, 16 gated). A default held by nothing is one upgrade or
 * one hand-written rule from gone, so this holds it.
 *
 * Read from the BUILT stylesheet, which is what reaches a phone, and from
 * `globals.css` as well, because a build is not always there to read.
 */
const built = (() => {
  const dir = join(process.cwd(), '.next', 'static', 'chunks');
  if (!existsSync(dir)) return null;
  const css = readdirSync(dir).filter((file) => file.endsWith('.css')).map((file) => readFileSync(join(dir, file), 'utf8')).join('\n');
  return css === '' ? null : css;
})();

/** Every rule whose selector has `:hover`, with whether a hover-capable media condition encloses it. */
export function hoverRules(css: string): Array<{ selector: string; gated: boolean }> {
  const out: Array<{ selector: string; gated: boolean }> = [];
  const open: string[] = [];
  let from = 0;
  for (const brace of css.matchAll(/[{}]/g)) {
    const at = brace.index ?? 0;
    if (brace[0] === '}') { open.pop(); from = at + 1; continue; }
    const selector = (css.slice(from, at).split(';').pop() ?? '').trim();
    if (selector.includes(':hover') && !selector.startsWith('@')) out.push({ selector, gated: open.some((outer) => /@media[^{]*\(\s*hover\s*:\s*hover\s*\)/.test(outer)) });
    open.push(selector);
    from = at + 1;
  }
  return out;
}

describe('hover is gated on a pointer that can hover', () => {
  /* The reader is shown to read before its nought is believed: a rule outside the condition is found, one inside is not, and a nested one is not. */
  it('finds a bare :hover and passes a gated one, on text written here', () => {
    expect(hoverRules('.a:hover{color:red}')).toEqual([{ selector: '.a:hover', gated: false }]);
    expect(hoverRules('@media (hover:hover){.a:hover{color:red}}')).toEqual([{ selector: '.a:hover', gated: true }]);
    expect(hoverRules('@media (min-width:1px){.a:hover{color:red}}').map((rule) => rule.gated)).toEqual([false]);
    expect(hoverRules('.a{&:hover{@media (hover: hover){color:red}}}').map((rule) => rule.gated), 'a condition INSIDE the rule is not read as gating it: fail loudly on a shape this does not know').toEqual([false]);
  });

  it('globals.css writes no :hover of its own', () => {
    const source = readFileSync(join(process.cwd(), 'src', 'app', 'globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(hoverRules(source).filter((rule) => !rule.gated).map((rule) => rule.selector)).toEqual([]);
  });

  it('the built stylesheet has hover rules, and every one is gated', () => {
    if (built === null) throw new Error('no built stylesheet under .next/static/chunks: run `npm run build` first. An absent build is not a pass');
    const rules = hoverRules(built);
    expect(rules.length, 'the precondition: the build has hover rules to check, so nought ungated means something').toBeGreaterThan(0);
    expect(rules.filter((rule) => !rule.gated).map((rule) => rule.selector), 'hover rules outside @media (hover: hover)').toEqual([]);
  });
});
