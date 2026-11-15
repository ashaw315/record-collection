import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * **Every route under src/app/api is named in SPEC.md §5 (the coordinator, 14 Nov).** CLAUDE.md §3: "Does this add an
 * endpoint? Is it in §5 exactly as specified?" Q22 shipped `/api/ask` with no §5 entry, the third piece of its work
 * found unspecified after its table and four more tables; this finds the rest in one run, and any new route on the day
 * it is added. A route is named where §5 writes its path in backticks, `[id]` read as `:id`, or where it is `:id` under
 * one of §5.4's reference resources, which §5.4 specifies as standard CRUD ("GET :id, PATCH :id, DELETE :id").
 */
const API = 'src/app/api';

/*
  The routes the check found on its first run, 14 Nov, with no §5 entry. Listed so it holds from today; the list may
  only shrink, so writing an entry fails until its path is taken off.
*/
const KNOWN_UNSPECIFIED = [
  '/api/artists/:id/lineup',
  '/api/artists/:id/lineup/progress',
  '/api/artists/match-candidates/:id',
  '/api/discogs/market/:id',
  '/api/discogs/master/:id/spread',
  '/api/genres/parent-suggestions',
  '/api/genres/parent-suggestions/rejections',
];

/*
  Test surface is not product surface (the coordinator, 14 Nov): a route under /api/e2e- is the e2e server's own stub
  (OpenAI's, Q22's control), never specified in §5. Keyed on the path prefix, visible in the tree, and not on the route
  reading E2E_PROBES, so adding that check to a route is no way to leave §5.
*/
const TEST_SURFACE = /^\/api\/e2e-/;

/** Each route file's path as §5 writes one: `/api/records/:id/journal`. */
export function routePaths(files: string[], root = API): string[] {
  return files.map((f) => f.slice(root.length - 'api'.length - 1).replace(/\/route\.ts$/, '').replace(/\[([a-zA-Z]+)\]/g, ':$1')).sort();
}

/** §5's text: from its heading to §6's. */
export function sectionFive(spec: string): string {
  const start = spec.search(/^## 5\. API contract/m);
  const end = spec.search(/^## 6\./m);
  if (start < 0 || end < start) throw new Error('SPEC.md has no §5 between "## 5. API contract" and "## 6."');
  return spec.slice(start, end);
}

/** §5.4's CRUD resources, each written as a list item `/api/…`. */
export function crudResources(section: string): string[] {
  const at = section.search(/^### 5\.4 Reference resources/m);
  const next = section.slice(at + 1).search(/^### /m);
  const block = at < 0 ? '' : section.slice(at, next < 0 ? undefined : at + 1 + next);
  return [...block.matchAll(/^- `(\/api\/[a-z-]+)`$/gm)].map((m) => m[1]);
}

export function unnamed(paths: string[], section: string): string[] {
  const crud = new Set(crudResources(section));
  return paths.filter((p) => !TEST_SURFACE.test(p) && !section.includes(`\`${p}\``) && !(p.endsWith('/:id') && crud.has(p.slice(0, -'/:id'.length))));
}

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((e) => {
    const full = join(dir, e);
    return statSync(full).isDirectory() ? routeFiles(full) : e === 'route.ts' ? [full] : [];
  });
}

describe('the routes against SPEC §5', () => {
  it('reads paths from route files, §5 between its heading and §6’s, and §5.4’s CRUD list', () => {
    expect(routePaths(['src/app/api/records/[id]/journal/route.ts', 'src/app/api/ask/route.ts'])).toEqual(['/api/ask', '/api/records/:id/journal']);
    const five = '## 5. API contract\n### 5.4 Reference resources\n- `/api/genres`\n- `/api/tags`\n\nmore\n### 5.5 Next\n| GET | `/api/ask` |\n## 6. After';
    expect(crudResources(sectionFive(five))).toEqual(['/api/genres', '/api/tags']);
    expect(unnamed(['/api/ask', '/api/genres/:id', '/api/tags/:id/extra', '/api/ghost', '/api/e2e-stub/v1/x'], sectionFive(five))).toEqual(['/api/tags/:id/extra', '/api/ghost']);
  });

  it('finds every route in src/app/api named in SPEC.md §5', () => {
    const paths = routePaths(routeFiles(API));
    expect(paths.length, 'the precondition: the routes are read').toBeGreaterThanOrEqual(40);
    const missing = unnamed(paths, sectionFive(readFileSync('SPEC.md', 'utf8')));
    expect(missing.filter((p) => !KNOWN_UNSPECIFIED.includes(p)), 'routes SPEC §5 does not name').toEqual([]);
    expect(KNOWN_UNSPECIFIED.filter((p) => !missing.includes(p)), 'listed as unspecified but now named in §5 or gone: take them off the list').toEqual([]);
  });
});
