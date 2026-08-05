import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(import.meta.dirname, '..', '..');

function read(file: string): string {
  return readFileSync(join(REPO_ROOT, file), 'utf-8');
}

/**
 * CLAUDE.md governs every decision in this project, so a build tool silently
 * editing it would let the rules drift without anyone noticing. `next dev`
 * appends a managed agent-rules block to AGENTS.md or CLAUDE.md on every run,
 * choosing CLAUDE.md when AGENTS.md is absent
 * (node_modules/next/dist/server/lib/generate-agent-files.js).
 *
 * AGENTS.md exists to absorb that block. These tests fail if that arrangement
 * breaks and CLAUDE.md becomes the target again.
 */
describe('CLAUDE.md integrity', () => {
  const START_MARKER = '<!-- BEGIN:nextjs-agent-rules -->';
  const END_MARKER = '<!-- END:nextjs-agent-rules -->';

  it('contains no generated agent-rules block', () => {
    const content = read('CLAUDE.md');

    expect(content).not.toContain(START_MARKER);
    expect(content).not.toContain(END_MARKER);
  });

  it('contains no legacy agent-rules block either', () => {
    const content = read('CLAUDE.md');

    expect(content).not.toContain('<!-- NEXT-AGENTS-MD-START -->');
    expect(content).not.toContain('<!-- NEXT-AGENTS-MD-END -->');
  });

  it('still ends with the session start checklist', () => {
    // Anything appended to the file lands after this, so a changed tail is the
    // cheapest signal that something wrote to CLAUDE.md.
    expect(read('CLAUDE.md').trimEnd()).toMatch(
      /State the plan for this session's single unit of work, and wait for confirmation\.$/,
    );
  });

  it('is unmodified relative to git HEAD', () => {
    // The real guarantee: any edit at all, by any tool, shows up here.
    const changed = execFileSync('git', ['status', '--porcelain', '--', 'CLAUDE.md'], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
    }).trim();

    expect(
      changed,
      `CLAUDE.md has uncommitted changes. If a tool wrote to it, revert with ` +
        `\`git checkout CLAUDE.md\` and check that AGENTS.md still hosts the ` +
        `Next.js agent-rules block.`,
    ).toBe('');
  });

  it('keeps the governing rules in CLAUDE.md, not AGENTS.md', () => {
    // AGENTS.md is a shim. If the real rules ever migrate into it, the pointer
    // in it is wrong and agents will read the wrong file.
    const claude = read('CLAUDE.md');

    expect(claude).toContain('Test-driven development is mandatory');
    expect(claude).toContain('The loop');
  });
});

describe('AGENTS.md absorbs the generated block', () => {
  it('hosts the agent-rules block so next dev does not target CLAUDE.md', () => {
    const content = read('AGENTS.md');

    expect(content).toContain('<!-- BEGIN:nextjs-agent-rules -->');
    expect(content).toContain('<!-- END:nextjs-agent-rules -->');
  });

  it('points at CLAUDE.md and SPEC.md as the authoritative documents', () => {
    const content = read('AGENTS.md');

    expect(content).toContain('CLAUDE.md');
    expect(content).toContain('SPEC.md');
  });

  it('matches the block Next.js would generate, so it is not rewritten', () => {
    // If Next changes the block text in a future version, this fails and tells
    // us to re-sync AGENTS.md rather than letting the generator hunt for
    // CLAUDE.md again.
    const generatorPath = join(
      REPO_ROOT,
      'node_modules/next/dist/server/lib/generate-agent-files.js',
    );
    const generator = readFileSync(generatorPath, 'utf-8');

    const expectedSentence =
      'This version has breaking changes — APIs, conventions, and file structure may all differ from your training data.';
    expect(generator).toContain(expectedSentence);
    expect(read('AGENTS.md')).toContain(expectedSentence);
  });
});
