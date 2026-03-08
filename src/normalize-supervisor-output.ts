#!/usr/bin/env tsx

import * as fs from 'fs';
import * as path from 'path';
import { writeCanonicalIntervention } from './runtime-supervision';
import type { RuntimeStateSnapshot } from './runtime-supervision';

function usage(): never {
  console.error('Usage: tsx src/normalize-supervisor-output.ts <raw-output> <state-json> <intervention-json> <intervention-raw-json>');
  process.exit(1);
}

const [, , rawPath, statePath, interventionPath, interventionRawPath] = process.argv;
if (!rawPath || !statePath || !interventionPath || !interventionRawPath) usage();

const rawOutput = fs.readFileSync(rawPath, 'utf8');
const state = JSON.parse(fs.readFileSync(statePath, 'utf8')) as RuntimeStateSnapshot;

writeCanonicalIntervention(rawOutput, state, {
  runtimeDir: path.dirname(interventionPath),
  statePath,
  interventionPath,
  interventionRawPath,
});
