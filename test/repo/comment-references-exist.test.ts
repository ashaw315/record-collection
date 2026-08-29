import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const SRC = join(REPO_ROOT, 'src');

/**
 * **A COMMENT THAT REFERENCES A SAFEGUARD NOBODY WROTE.**
 *
 * `WallScene.tsx` carried, for weeks:
 *
 *     the camera distance scales with the collection, and that is fine for the
 *     camera and NOT fine for the pull depth. See `PULL_DEPTH_CAP` below.
 *
 * There is no `PULL_DEPTH_CAP`. One reference, no definition, anywhere in the
 * repository — and the defect the comment describes is real: on a desktop wall
 * the pulled record travels 680px AWAY from the camera, ending up behind the
 * wall plane, because the settle distance is a constant while the camera's
 * distance scales with wall height.
 *
 * **This is a shape this project has not recorded before.** The dead
 * `isUniqueViolation` was code that ran and did nothing. This is the inverse:
 * the REASONING survived and the MECHANISM was never written, so the comment
 * reads as protection while providing none. A reader who greps for the constant
 * finds the comment, assumes the cap exists somewhere, and moves on — which is
 * how it survived every review of this file.
 *
 * So: a `CONSTANT_CASE` name mentioned in a comment must exist in the codebase.
 * The check is cheap, and the failure mode it catches is a comment that lies
 * with complete sincerity.
 */

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Names appearing inside a comment, in backticks, in CONSTANT_CASE.
 *
 * Backticks because that is how this codebase marks a code reference in prose;
 * an unquoted capitalised word in a sentence is usually not one. CONSTANT_CASE
 * because it is unambiguous — a name written that way is a constant, and if it
 * does not exist the sentence referring to it is false.
 */
function referencedConstants(source: string): string[] {
  const comments = source.match(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g) ?? [];
  const names = new Set<string>();
  for (const c of comments) {
    for (const m of c.matchAll(/`([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)`/g)) {
      names.add(m[1]);
    }
  }
  return [...names];
}

/**
 * SQL keywords and other non-JavaScript names that are legitimately written in
 * CONSTANT_CASE inside a comment. They are not promises about this codebase, so
 * they cannot be broken promises.
 */
const NOT_OURS = new Set(['CURRENT_DATE', 'CURRENT_TIMESTAMP', 'NOT_NULL', 'ON_CONFLICT']);

/**
 * **A comment recording a DELETION is the opposite of the defect.**
 *
 * "`MIN_SHELF_FRACTION` was here and is deleted, not left inert" is exactly the
 * practice this project wants — it explains why a reader will not find something
 * they might expect. Requiring the name to exist would punish it.
 */
function isDeletionNote(source: string, name: string): boolean {
  return new RegExp(
    `\`${name}\`[^.]{0,80}(deleted|removed|is gone|no longer|was here)`,
    'i',
  ).test(source);
}

describe('a constant named in a comment exists in the codebase', () => {
  const files = sourceFiles(SRC);
  const allSource = files.map((f) => readFileSync(f, 'utf-8')).join('\n');
  /* Comments stripped, so a name mentioned only in prose cannot vouch for itself. */
  const codeOnly = allSource.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '');

  it('finds source files to check, so an empty scan cannot pass vacuously', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it('has no comment referencing a constant that was never written', () => {
    const missing: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, 'utf-8');
      for (const name of referencedConstants(source)) {
        if (NOT_OURS.has(name)) continue;
        /*
          Defined anywhere in src: the reference may legitimately point at
          another module. What must not happen is the name existing ONLY inside
          comments — which is exactly PULL_DEPTH_CAP's shape.
        */
        const declared = new RegExp(
          `(const|let|var|enum|function)\\s+${name}\\b|${name}\\s*[:=]|['"\`]${name}['"\`]`,
        ).test(codeOnly);

        if (!declared && !isDeletionNote(source, name)) {
          missing.push(`${file.replace(REPO_ROOT, '')} references \`${name}\``);
        }
      }
    }

    expect(missing, 'a comment promising a safeguard that does not exist').toEqual([]);
  });
});
