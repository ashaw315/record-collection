/**
 * What `test/repo/spec-constants-pinned.test.ts` reads: the constants a
 * spec imports from the source, and whether a unit test holds one to a
 * literal. Text, not types: a constant is an export named in capitals, by
 * this repo's convention, and a pin is `expect(NAME…)` met by a literal.
 */

/** The source's constants a file imports, by their own names. Functions, types and anything not from `src/` are left out. */
export function importedConstants(source: string): string[] {
  const names: string[] = [];
  for (const match of source.matchAll(/import\s+\{([^}]+)\}\s+from\s+'(?:\.\.\/)+src\/[^']+'/g)) {
    for (const part of match[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0].trim();
      if (/^[A-Z][A-Z0-9_]*$/.test(name)) names.push(name);
    }
  }
  return names;
}

const LITERAL = String.raw`(?:-?\d|'|"|\`|\{|\[|true\b|false\b|null\b)`;

/** Whether any of the unit tests' sources meets the constant, or a member of it, with a literal. */
export function isPinned(name: string, tests: readonly string[]): boolean {
  const pin = new RegExp(String.raw`expect\(\s*${name}(?:[.\[][A-Za-z0-9_.\[\]']*)?\s*(?:,[^)]*)?\)\s*\.\s*(?:toBe|toEqual|toStrictEqual|toBeCloseTo|toMatchObject)\(\s*${LITERAL}`);
  return tests.some((source) => pin.test(source));
}
