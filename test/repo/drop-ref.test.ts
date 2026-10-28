import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { nextRefName } from '../../scripts/drop-ref.mjs';

/**
 * **A copy of each drop as it arrived, and a word that a new one has (25 Oct).**
 * A drop sits uncommitted while the index runs against it, so there was no
 * pristine copy to compare with, and when Adam relayed a corrected drop
 * nothing said a new generation had arrived: a failing assertion with no
 * report read as an unexplained edit. `scripts/drop-ref.mjs` keeps
 * docs/design as it stands under refs/drops/, off every branch, so neither the
 * commit path nor a push carries it, and says what differs from the last one.
 */
const SCRIPT = join(process.cwd(), 'scripts', 'drop-ref.mjs');
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'drop-ref-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-q');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'user.name', 'Test');
  git('config', 'commit.gpgsign', 'false');
  mkdirSync(join(dir, 'docs', 'design'), { recursive: true });
  /* As this repository's .gitignore does: the directory ignored, one file let back in. */
  writeFileSync(join(dir, '.gitignore'), 'docs/design/*\n!docs/design/Target.dc.html\n');
  writeFileSync(join(dir, 'docs', 'design', 'Target.dc.html'), '<p>The fragment sits 24 below the last line. The slot is reserved.</p>\n');
  git('add', '.gitignore', 'docs/design/Target.dc.html');
  git('commit', '-q', '-m', 'first');
  /* Not in the commit and ignored: a drop's new file looks like this until it is let in. */
  writeFileSync(join(dir, 'docs', 'design', 'Ignored.dc.html'), '<p>An ignored file is part of the drop.</p>\n');
  const write = (name: string, text: string) => writeFileSync(join(dir, 'docs', 'design', name), text);
  const run = () => execFileSync('node', [SCRIPT], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const attempt = () => {
    try {
      return { status: 0, output: execFileSync('node', [SCRIPT], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) };
    } catch (e) {
      const err = e as { status: number; stdout: string; stderr: string };
      return { status: err.status, output: `${err.stdout}${err.stderr}` };
    }
  };
  /* The intake's shape: Code's own lines written into a tracked file, then committed. */
  const intake = () => {
    write('Target.dc.html', '<p>The fragment sits 24 below the last line. The slot is reserved.</p>\n<p>A line Code restores.</p>\n');
    git('commit', '-q', '-am', 'intake');
  };
  const drops = () => git('for-each-ref', '--format=%(refname)', 'refs/drops/').split('\n').filter(Boolean);
  return { dir, git, write, run, attempt, intake, drops, done: () => rmSync(dir, { recursive: true, force: true }) };
}

describe('nextRefName', () => {
  /* Fails against a name taken from the clock alone: two drops in one day would share a ref. */
  it('numbers drops within a day and starts again at 01 on a new one', () => {
    expect(nextRefName([], '2026-10-25')).toBe('refs/drops/2026-10-25-01');
    expect(nextRefName(['refs/drops/2026-10-25-01'], '2026-10-25')).toBe('refs/drops/2026-10-25-02');
    expect(nextRefName(['refs/drops/2026-10-25-09', 'refs/drops/2026-10-25-10'], '2026-10-25')).toBe('refs/drops/2026-10-25-11');
    expect(nextRefName(['refs/drops/2026-10-25-03'], '2026-10-26')).toBe('refs/drops/2026-10-26-01');
  });
});

describe('drop-ref', () => {
  it('keeps every file in docs/design byte for byte, ignored ones too, and leaves HEAD, the index and the tree alone', () => {
    const r = repo();
    try {
      const head = r.git('rev-parse', 'HEAD');
      const out = r.run();
      const ref = `refs/drops/${today()}-01`;
      expect(r.drops()).toEqual([ref]);
      expect(out).toContain(ref);
      /*
        Named by when it was captured, not by what arrived (the coordinator, 25 Oct): a ref is the whole directory,
        so one taken after a single file was copied in holds every other file as it was before that.
      */
      expect(out).toMatch(/^Captured docs\/design at \d{2}:\d{2}:\d{2} on \d{4}-\d{2}-\d{2} as refs\/drops\/\S+-01\. The first drop ref/);
      expect(r.git('log', '-1', '--format=%B', ref)).toMatch(/^docs\/design as captured at \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
      expect(r.git('log', '-1', '--format=%B', ref)).not.toMatch(/arriv/i);
      for (const name of ['Target.dc.html', 'Ignored.dc.html']) {
        expect(r.git('cat-file', 'blob', `${ref}:docs/design/${name}`) + '\n').toBe(readFileSync(join(r.dir, 'docs', 'design', name), 'utf8'));
      }
      expect(r.git('rev-parse', 'HEAD')).toBe(head);
      expect(r.git('diff', '--cached', '--name-only')).toBe('');
      expect(r.git('status', '--porcelain')).toBe('');
      /* Off every branch: nothing a push of the branch would send. */
      expect(r.git('branch', '--contains', ref)).toBe('');
    } finally {
      r.done();
    }
  });

  it('records nothing and says so when the drop is the same as the last one', () => {
    const r = repo();
    try {
      r.run();
      const out = r.run();
      expect(r.drops()).toHaveLength(1);
      expect(out).toMatch(/same as refs\/drops\/\S+-01/i);
    } finally {
      r.done();
    }
  });

  /* Fails against a report of file names alone: "Target changed" does not say a sentence moved, which is what this morning needed. */
  it('says a new generation arrived and what differs from the last: the sentences reworded, removed and added, and files added and gone', () => {
    const r = repo();
    try {
      r.run();
      r.write('Target.dc.html', '<p>The fragment sits 24 below the sidebar’s last line. A new ruling arrives here.</p>\n');
      r.write('New.dc.html', '<p>A new file.</p>\n');
      rmSync(join(r.dir, 'docs', 'design', 'Ignored.dc.html'));
      const out = r.run();
      const [first, second] = [`refs/drops/${today()}-01`, `refs/drops/${today()}-02`];
      expect(r.drops()).toEqual([first, second]);
      expect(r.git('rev-parse', `${second}^`)).toBe(r.git('rev-parse', first));
      expect(out).toMatch(/^Captured docs\/design at \d{2}:\d{2}:\d{2} on \d{4}-\d{2}-\d{2} as refs\/drops\/\S+-02\./);
      expect(out).toMatch(new RegExp(`differs from ${first}, captured at \\d{2}:\\d{2}:\\d{2} on \\d{4}-\\d{2}-\\d{2}, in 3 file`));
      expect(out).toMatch(/added\s+docs\/design\/New\.dc\.html/);
      expect(out).toMatch(/gone\s+docs\/design\/Ignored\.dc\.html/);
      expect(out).toMatch(/changed\s+docs\/design\/Target\.dc\.html/);
      expect(out).toContain('was: The fragment sits 24 below the last line.');
      expect(out).toContain('now: The fragment sits 24 below the sidebar’s last line.');
      expect(out).toContain('removed: The slot is reserved.');
      expect(out).toContain('added: A new ruling arrives here.');
    } finally {
      r.done();
    }
  });

  /* Fails against a report that lists only sentence changes: a file whose bytes moved and whose prose did not would be reported as nothing. */
  it('names a change with no prose difference as markup only', () => {
    const r = repo();
    try {
      r.run();
      r.write('Target.dc.html', '<p style="margin:0">The fragment sits 24 below the last line. The slot is reserved.</p>\n');
      const out = r.run();
      expect(out).toMatch(/changed\s+docs\/design\/Target\.dc\.html/);
      expect(out).toMatch(/markup only/i);
    } finally {
      r.done();
    }
  });
});

/*
  The guard (the coordinator, 26 Oct). Run to find out whether a drop had arrived, the script captured the
  committed post-intake state as a drop, and the next real drop's report would have shown Code's own restored
  lines as removed. Checking git status first would have prevented it, but a convention held by repetition is
  the defect a check exists for. The post-intake state is the one that matches HEAD. "No uncommitted changes"
  is not that test: a drop that brings a file not yet allowlisted is untracked and ignored, git status shows
  nothing, and the Mood Pick target arrived exactly so.
*/
describe('drop-ref refuses the committed state, and only that', () => {
  /* Fails against no guard: the post-intake tree differs from the last drop, so it was recorded. */
  it('refuses when every tracked file matches HEAD and nothing else differs from the last drop, recording nothing', () => {
    const r = repo();
    try {
      r.run();
      r.intake();
      const out = r.attempt();
      expect(out.status, out.output).toBe(1);
      expect(out.output).toMatch(/matches HEAD/);
      expect(r.drops()).toHaveLength(1);
    } finally {
      r.done();
    }
  });

  /* Fails against "refuse when git status is clean": an ignored file is invisible to it. */
  it('records a drop that brings a file HEAD does not have, though every tracked file matches HEAD and git status is clean', () => {
    const r = repo();
    try {
      r.run();
      r.intake();
      r.write('New target.dc.html', '<p>A target not yet let in.</p>\n');
      expect(r.git('status', '--porcelain'), 'the precondition: git status shows nothing').toBe('');
      const out = r.attempt();
      expect(out.status, out.output).toBe(0);
      expect(r.drops()).toHaveLength(2);
      expect(out.output).toMatch(/added\s+docs\/design\/New target\.dc\.html/);
    } finally {
      r.done();
    }
  });

  /* Fails against a guard that asks only whether some file is missing from HEAD: the ignored file is always missing from it. */
  it('records a drop that changes only a file HEAD does not have', () => {
    const r = repo();
    try {
      r.run();
      r.intake();
      r.write('Ignored.dc.html', '<p>An ignored file, sent again changed.</p>\n');
      const out = r.attempt();
      expect(out.status, out.output).toBe(0);
      expect(r.drops()).toHaveLength(2);
      expect(out.output).toMatch(/changed\s+docs\/design\/Ignored\.dc\.html/);
    } finally {
      r.done();
    }
  });

  /* Fails against a guard that compares the whole directory with HEAD: a drop that changes a tracked file is a drop. */
  it('records a drop that changes a tracked file', () => {
    const r = repo();
    try {
      r.run();
      r.intake();
      r.write('Target.dc.html', '<p>A corrected target, neither the last drop nor HEAD.</p>\n');
      const out = r.attempt();
      expect(out.status, out.output).toBe(0);
      expect(r.drops()).toHaveLength(2);
    } finally {
      r.done();
    }
  });
});

/**
 * **A section's governs row follows its target, or the drop says it stands
 * (the coordinator, 28 Oct).** Thirteen of 59 governs rows were stale: six
 * because a withdrawal moved a ruling between sections, seven because a
 * ruling was added to a section whose row never mentioned it. Both happen at
 * the moment a change file is written, so the check is at arrival: for
 * every section whose sentences differ between this drop and the last, a
 * change file in the drop must edit that section's governs row (`§T.2,
 * description:` or `§T.2, title:`) or say the row stands (`§T.2` in a
 * sentence with "row stands", "row unchanged" or "no change"). Otherwise
 * drop-ref names the section and exits 1, which stops the intake.
 */
describe('drop-ref: a changed section’s governs row is edited or said to stand', () => {
  const TARGET = '<p style="font-size:11px;text-transform:uppercase">T.1 · The first</p><p>The first rules its thing.</p><p style="font-size:11px;text-transform:uppercase">T.2 · The second</p><p>The second rules its own thing.</p>\n';
  const sectioned = () => {
    const r = repo();
    r.write('Target.dc.html', TARGET);
    r.git('add', '--force', 'docs/design/Target.dc.html');
    r.git('commit', '-q', '-m', 'sectioned');
    r.run();
    return r;
  };

  /* Fails against a drop-ref that reports sentences only: the row's drift is invisible until an audit. */
  it('exits 1 naming the section when a target’s section changed and no change file addresses its row', () => {
    const r = sectioned();
    try {
      r.write('Target.dc.html', TARGET.replace('The second rules its own thing.', 'The second rules its own thing, and a new thing besides.'));
      const { status, output } = r.attempt();
      expect(status).toBe(1);
      expect(output).toMatch(/governs: §T\.2 changed in docs\/design\/Target\.dc\.html, and no change file in the drop edits its governs row or says it stands/);
      expect(output).not.toMatch(/governs: §T\.1 /);
    } finally {
      r.done();
    }
  });

  /* Fails against a check that reads the row's edit only: Design's "no change needed" is the other half of the rule. */
  it('passes when a change file in the drop edits the row, or says it stands', () => {
    const r = sectioned();
    try {
      r.write('Target.dc.html', TARGET.replace('The second rules its own thing.', 'The second rules its own thing, and a new thing besides.'));
      r.write('Rows - for Code to apply.md', '## The table and grid\n\n- **§T.2, description:** The second, and its new thing.\n');
      const edited = r.attempt();
      expect(edited.status, edited.output).toBe(0);
      expect(edited.output).toMatch(/governs: §T\.2 changed in docs\/design\/Target\.dc\.html; its row is edited in docs\/design\/Rows - for Code to apply\.md/);

      /* On top of the second's change, which drop 02 holds: only §T.1 differs between 02 and 03. */
      r.write('Target.dc.html', TARGET.replace('The second rules its own thing.', 'The second rules its own thing, and a new thing besides.').replace('The first rules its thing.', 'The first rules its thing, reworded.'));
      r.write('Rows - for Code to apply.md', 'The §T.1 governs row stands: the rewording changes nothing it names.\n');
      const stands = r.attempt();
      expect(stands.status, stands.output).toBe(0);
      expect(stands.output).toMatch(/governs: §T\.1 changed in docs\/design\/Target\.dc\.html; its row is said to stand in docs\/design\/Rows - for Code to apply\.md/);
    } finally {
      r.done();
    }
  });
});

/*
  The coordinator, 28 Oct: the staleness the check has to catch is a
  withdrawal in §T.2 that withdraws part of §T.1, where the row needing a
  pointer is §T.1's. That holds because the withdrawal sentence is filed in
  the section where the claim stood (the §T.1 re-filing, and what index
  assertion 7 requires of every entry), so §T.1's sentences change and the
  check names §T.1 as well as §T.2. Fails against a check that read only the
  section carrying the new ruling: §T.1 would go unnamed, the record page's
  26 stale rows exactly.
*/
describe('drop-ref: a withdrawal filed where the claim stood names that section’s row too', () => {
  it('names §T.1 when §T.2’s new ruling withdraws part of §T.1 and the withdrawal sentence is filed in §T.1', () => {
    const r = repo();
    try {
      const target = '<p style="font-size:11px;text-transform:uppercase">T.1 · The first</p><p>The first rules its thing. The first also rules a second thing.</p><p style="font-size:11px;text-transform:uppercase">T.2 · The second</p><p>The second rules its own thing.</p>\n';
      r.write('Target.dc.html', target);
      r.git('add', '--force', 'docs/design/Target.dc.html');
      r.git('commit', '-q', '-m', 'sectioned');
      r.run();
      r.write('Target.dc.html', target
        .replace('The first also rules a second thing.', 'Withdrawn by §T.2: the first also rules a second thing.')
        .replace('The second rules its own thing.', 'The second rules its own thing, and the second thing the first ruled.'));
      r.write('Rows - for Code to apply.md', '- **§T.2, description:** The second, and the second thing.\n');
      const { status, output } = r.attempt();
      expect(status).toBe(1);
      expect(output).toMatch(/governs: §T\.1 changed in docs\/design\/Target\.dc\.html, and no change file in the drop edits its governs row or says it stands/);
      expect(output).toMatch(/governs: §T\.2 changed in docs\/design\/Target\.dc\.html; its row is edited in/);
    } finally {
      r.done();
    }
  });
});
