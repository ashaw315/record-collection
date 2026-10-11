import type { FullConfig, Reporter, Suite } from '@playwright/test/reporter';
import { playwrightScope, projectsLine } from '../scripts/run-result';

/**
 * **Says what each project held, so one that held nothing is not green.**
 *
 * The `touch` project matched one spec, and the spec went with the lit wall.
 * From then every whole-suite run counted a project that ran no test, and
 * Playwright's summary has no line for that: it fails a run that matches
 * nothing at all and is silent about a project that does.
 *
 * One line at the end, read by `scripts/run-result.ts` as the ledger's is.
 * On the whole suite a project with no test is a failure; on a run narrowed
 * to files or a pattern it is only reported, since a file one project does
 * not match is not an empty project.
 */
export default class ProjectCounts implements Reporter {
  private counts: Record<string, number> = {};

  /*
    The suite holds only the projects that matched something: a project with
    no test is left out of it, which is the case this exists for (found by
    staging one, 10 Oct; the first build read the suite alone and printed
    nothing about the empty project). So the names come from the config, or
    from `--project` where the run named its projects, and the counts from
    the suite.
  */
  onBegin(config: FullConfig, suite: Suite): void {
    const args = process.argv.slice(process.argv.indexOf('test') + 1);
    const named = args.flatMap((word, index) => (word.startsWith('--project=') ? [word.slice('--project='.length)] : word === '--project' && args[index + 1] !== undefined ? [args[index + 1]] : []));
    const expected = named.length > 0 ? named : config.projects.map((project) => project.name);
    for (const name of expected) this.counts[name] = 0;
    for (const project of suite.suites) this.counts[project.title] = project.allTests().length;
  }

  onEnd(): void {
    const whole = playwrightScope(['playwright', ...process.argv.slice(process.argv.indexOf('test'))]) === 'whole';
    process.stdout.write(`${projectsLine(this.counts, whole)}\n`);
  }

  printsToStdio(): boolean {
    return false;
  }
}
