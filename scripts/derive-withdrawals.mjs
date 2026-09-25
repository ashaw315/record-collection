#!/usr/bin/env node
/**
 * Derives WITHDRAWALS.md's machine-readable comment from its bullets.
 * Idempotent: run it first after every Design drop. See withdrawals.mjs.
 */
import { join } from 'node:path';
import { deriveInto } from './withdrawals.mjs';

const path = join(process.cwd(), 'docs/design/WITHDRAWALS.md');
const { changed, entries } = deriveInto(path);
console.log(`${changed ? 'rewrote' : 'unchanged'}: ${entries} entries -> machine-readable comment`);
