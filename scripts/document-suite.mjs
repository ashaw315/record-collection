#!/usr/bin/env node
/**
 * **Every unit test that reads Design's files**: test/repo, and the wall's
 * unit test, which reads the target's drawing. One list for both ways into a
 * commit, the intake (`apply-code-region.mjs`) and `commit-checked.sh`, so
 * neither can run less than the other. Held whole by code-region.test.ts:
 * a vitest file that reads docs/design and is not in it fails the suite.
 *
 *     node scripts/document-suite.mjs    # the paths, one per line
 */
import { pathToFileURL } from 'node:url';

export const DOCUMENT_SUITE = ['test/repo', 'src/app/wall/unit.test.ts'];

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.stdout.write(`${DOCUMENT_SUITE.join('\n')}\n`);
