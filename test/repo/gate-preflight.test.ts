import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * **What `scripts/gate.sh` checks before it runs anything.**
 *
 * Two of the 20 Oct gate's false starts, each found from a message about
 * something else:
 *
 * - Docker was not running after a reboot, which is now routine before a
 *   gate, and the first word of it was "could not create
 *   record_collection_gate". The gate now says so first, before it reads the
 *   machine or touches the worktree.
 * - The gate's checkout carried route types a dev server had generated
 *   before `/wall/probe/isolate` was deleted (ff6575d). They are ignored, so
 *   the checkout read as clean, and `tsconfig.json` includes them, so the
 *   build failed typechecking a page that no longer exists. Any checkout
 *   whose dev server ran before a route deletion carries the same. The gate
 *   now removes the dev servers' generated types before it builds.
 *
 * Run for real in a throwaway repository, with `docker` and `npm` replaced
 * by stubs on PATH: the stub build records what the checkout held when it
 * was called, then fails, which ends the run there.
 */
const ROOT = process.cwd();
const DEV_TYPES = ['.next/dev/types', '.next/dev/dev/types', '.next-test/dev/types', '.next-test/dev/dev/types'];

type Docker = 'down' | 'no-container' | 'up';

function setup(): { dir: string; gate: string; bin: string; seen: string } {
  const dir = mkdtempSync(join(tmpdir(), 'gate-preflight-'));
  const repo = join(dir, 'repo');
  const bin = join(dir, 'bin');
  mkdirSync(join(repo, 'scripts'), { recursive: true });
  mkdirSync(bin);
  for (const script of ['gate.sh', 'gate-report.sh', 'memory-sample.sh']) copyFileSync(join(ROOT, 'scripts', script), join(repo, 'scripts', script));
  writeFileSync(join(repo, 'package-lock.json'), '{}\n');
  writeFileSync(join(repo, '.gitignore'), '/node_modules\n/.next/\n.next-test\n');
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] });
  git('init', '-q');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'Test');
  git('config', 'commit.gpgsign', 'false');
  git('add', '.');
  git('commit', '-q', '-m', 'first');

  const seen = join(dir, 'seen-by-build');
  writeFileSync(
    join(bin, 'docker'),
    `#!/usr/bin/env bash
case "$1" in
  info) [ "$STUB_DOCKER" != down ] ;;
  inspect) [ "$STUB_DOCKER" = up ] && echo true || { echo "Error: No such object" >&2; exit 1; } ;;
  exec) [[ "$*" == *"SELECT 1"* ]] && echo 1; exit 0 ;;
  *) exit 0 ;;
esac
`,
  );
  writeFileSync(
    join(bin, 'npm'),
    `#!/usr/bin/env bash
if [ "$1 $2" = "run build" ]; then
  for d in ${DEV_TYPES.join(' ')} .next-test/dev/cache; do [ -e "$d" ] && echo "present $d" || echo "absent $d"; done > "${seen}"
  exit 1
fi
exit 0
`,
  );
  for (const stub of ['docker', 'npm']) chmodSync(join(bin, stub), 0o755);
  return { dir: repo, gate: join(dir, 'gate'), bin, seen };
}

function gate(where: { dir: string; gate: string; bin: string }, docker: Docker): { status: number; output: string } {
  const env = {
    ...process.env,
    PATH: `${where.bin}:${process.env.PATH ?? ''}`,
    STUB_DOCKER: docker,
    GATE_DIR: where.gate,
    // The machine's own state is not under test: no reading of it refuses this run.
    GATE_MAX_LOAD: '100000',
    GATE_MAX_SWAP_RATE: '1000000000',
    GATE_MAX_PRESSURE: '4',
    // The sampler sleeps between readings holding the run's stdout, so the run is not over until its sleep is.
    GATE_SAMPLE_EVERY: '1',
  };
  try {
    return { status: 0, output: execFileSync('bash', [join(where.dir, 'scripts', 'gate.sh'), 'HEAD', '1'], { cwd: where.dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env }) };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return { status: failure.status ?? -1, output: `${failure.stdout ?? ''}${failure.stderr ?? ''}` };
  }
}

describe('the gate says Docker is down before anything else does', () => {
  it('refuses when the Docker daemon is not running, saying so, with nothing run and no checkout made', () => {
    const where = setup();
    const result = gate(where, 'down');
    expect(result.output).toMatch(/Docker isn't running/);
    expect(result.output).not.toMatch(/could not create/);
    expect(existsSync(where.gate), 'no worktree was made').toBe(false);
    expect(result.status, result.output).toBe(1);
  });

  it("refuses when Docker is up but the database container is not, naming the container and the command", () => {
    const where = setup();
    const result = gate(where, 'no-container');
    expect(result.output).toMatch(/record-collection-test-db isn't running/);
    expect(result.output).toContain('docker compose up -d');
    expect(existsSync(where.gate), 'no worktree was made').toBe(false);
    expect(result.status, result.output).toBe(1);
  });
});

describe("the gate builds without a dev server's generated route types", () => {
  it('removes every generated types directory tsconfig reads before the build, and leaves the rest of the dev output', { timeout: 30_000 }, () => {
    const where = setup();
    execFileSync('git', ['worktree', 'add', '-q', '--detach', where.gate, 'HEAD'], { cwd: where.dir, stdio: ['ignore', 'pipe', 'pipe'] });
    mkdirSync(join(where.gate, 'node_modules'));
    writeFileSync(join(where.gate, 'node_modules', '.gate-lock'), `${execFileSync('shasum', [join(where.gate, 'package-lock.json')], { encoding: 'utf8' }).split(' ')[0]}\n`);
    for (const d of DEV_TYPES) {
      mkdirSync(join(where.gate, d), { recursive: true });
      writeFileSync(join(where.gate, d, 'validator.ts'), "import '../../../src/app/wall/probe/isolate/page.js';\n");
    }
    mkdirSync(join(where.gate, '.next-test/dev/cache'), { recursive: true });

    const result = gate(where, 'up');
    expect(result.output, 'the run reached the build, and the stub build ended it').toMatch(/npm run build failed/);
    const seen = readFileSync(where.seen, 'utf8');
    for (const d of DEV_TYPES) expect(seen).toContain(`absent ${d}`);
    expect(seen, 'only the types go').toContain('present .next-test/dev/cache');
  });
});
