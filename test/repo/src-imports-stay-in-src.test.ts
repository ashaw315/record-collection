import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '..', '..');
const SRC = join(REPO_ROOT, 'src');

/**
 * **The gate's build is not the production build, and on 1 Oct that
 * difference shipped.** `.vercelignore` keeps `test`, `e2e` and `docs` out
 * of the upload, so a source file that imports from them builds here, where
 * they are on disk, and fails on Vercel, where they are not. The first
 * production build since the wall failed on two such imports
 * (`src/app/wall/probe`, importing `test/fixtures/collection-spines`),
 * after a gate whose `npm run build` had passed on the same tree.
 *
 * Two rules, read from the ignore file so they cannot drift from it:
 *
 * 1. A source file may import from outside `src` only if it lives under a
 *    directory the upload leaves out too (a workbench route that never
 *    reaches production). Everywhere else, an import that leaves `src` is a
 *    build that passes here and fails there.
 * 2. Nothing outside those left-out directories may import from them: a
 *    production file reaching into a workbench would take the workbench's
 *    absence with it.
 */
/**
 * Every TypeScript file under src, TEST FILES INCLUDED. The first version
 * skipped `*.test.*`, and the production-shaped build then failed one step
 * later than Vercel's had: `next build` type-checks the whole project, so
 * a unit test under src importing from `test/` fails the build where the
 * fixture is absent, exactly as a page does.
 */
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

/**
 * What `.vercelignore` leaves out of the upload, as it applies under src:
 * directory lines (`src/app/wall/probe`) and basename globs (`*.test.ts`),
 * the two shapes the file uses. Read from the file so the guard cannot
 * drift from the mechanism.
 */
function leftOutOfUpload(): { dirs: string[]; globs: RegExp[] } {
  const lines = readFileSync(join(REPO_ROOT, '.vercelignore'), 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
  return {
    dirs: lines.filter((line) => line.startsWith('src/')).map((line) => line.replace(/\/$/, '') + '/'),
    globs: lines.filter((line) => line.startsWith('*.')).map((line) => new RegExp(`(^|/)[^/]*${line.slice(1).replace(/\./g, '\\.')}$`)),
  };
}

const SPECIFIER = /(?:^|\n)\s*(?:import|export)\b[^'"]*?from\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g;

function relativeImports(file: string): string[] {
  const text = readFileSync(file, 'utf8');
  const out: string[] = [];
  for (const m of text.matchAll(SPECIFIER)) {
    const spec = m[1] ?? m[2];
    if (spec !== undefined && spec.startsWith('.')) out.push(spec);
  }
  return out;
}

describe('a source file’s imports stay inside src, or the file itself stays out of the deploy', () => {
  const files = walk(SRC);
  const leftOut = leftOutOfUpload();
  const isLeftOut = (repoPath: string) => leftOut.dirs.some((dir) => repoPath.startsWith(dir)) || leftOut.globs.some((glob) => glob.test(repoPath));

  it('scans a non-empty tree, with its unit tests', () => {
    expect(files.length).toBeGreaterThan(50);
    expect(files.filter((f) => /\.test\.(ts|tsx)$/.test(f)).length, 'unit tests under src are in the scan').toBeGreaterThan(50);
  });

  it('no uploaded source file, unit tests under src included, imports from outside src (test, e2e, docs, scripts are not uploaded)', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const repoPath = relative(REPO_ROOT, file);
      if (isLeftOut(repoPath)) continue;
      for (const spec of relativeImports(file)) {
        const target = relative(REPO_ROOT, resolve(dirname(file), spec));
        if (!target.startsWith('src/')) offenders.push(`${repoPath} imports ${spec} (${target})`);
      }
    }
    expect(offenders, `imports that leave src from files Vercel uploads:\n  ${offenders.join('\n  ')}`).toEqual([]);
  });

  it('no deployed source file imports from a directory the upload leaves out', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const repoPath = relative(REPO_ROOT, file);
      if (isLeftOut(repoPath)) continue;
      for (const spec of relativeImports(file)) {
        const target = relative(REPO_ROOT, resolve(dirname(file), spec));
        if (isLeftOut(target + '/') || isLeftOut(target)) offenders.push(`${repoPath} imports ${spec}`);
      }
    }
    expect(offenders, `production files reaching into a workbench:\n  ${offenders.join('\n  ')}`).toEqual([]);
  });

  it('every directory left out of the upload exists and 404s in production by its own code', () => {
    /* The ignore line is the mechanism; the 404 is the convention it replaces nothing of. Both must hold or the directory is a deployable surface after all. */
    for (const dir of leftOut.dirs) {
      const full = join(REPO_ROOT, dir);
      expect(statSync(full).isDirectory(), `${dir} exists`).toBe(true);
      const pages = walk(full).filter((f) => /\/page\.tsx$/.test(f));
      expect(pages.length, `${dir} has pages`).toBeGreaterThan(0);
      for (const page of pages) {
        expect(readFileSync(page, 'utf8'), `${relative(REPO_ROOT, page)} 404s in production`).toMatch(/NODE_ENV === 'production'\) notFound\(\)/);
      }
    }
  });
});
