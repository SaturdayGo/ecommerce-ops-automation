import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface RuntimePaths {
  runtimeDir: string;
  statePath: string;
  interventionPath: string;
  interventionRawPath: string;
}

export type ModuleOutcomeStatus =
  | 'pending'
  | 'auto_ok'
  | 'manual_gate'
  | 'detect_only'
  | 'failed'
  | 'skipped';

export interface ModuleOutcome {
  id: string;
  name: string;
  status: ModuleOutcomeStatus;
  evidence: string[];
}

export interface RuntimeStateSnapshot {
  version: '1.0';
  run_id: string;
  updated_at: string;
  project_root: string;
  mode: string;
  status: 'running' | 'waiting_human' | 'completed' | 'failed' | 'blocked';
  state: {
    code: string;
    name: string;
    attempt: number;
    retry_budget: number;
  };
  module: {
    id: string;
    name: string;
    step: string;
    sequence_index: number;
    sequence_total: number;
  };
  target: {
    field_label: string;
    expected_value: string;
    control_type: string;
    selector_scope: string;
  };
  last_action: {
    kind: string;
    description: string;
    started_at: string;
    ended_at: string;
    result: string;
  };
  next_expected_action: {
    kind: string;
    field_label: string;
    expected_value: string;
  };
  module_outcomes: ModuleOutcome[];
  gates: Array<{
    name: string;
    passed: boolean;
    evidence: string;
  }>;
  anomalies: Array<{
    code: string;
    severity: string;
    message: string;
    count: number;
    first_seen_at: string;
  }>;
  evidence: {
    log_path: string;
    screenshot_paths: string[];
    dom_snapshot_path: string | null;
  };
}

export interface SupervisorIntervention {
  version: '1.0';
  run_id: string;
  created_at: string;
  decision: 'observe' | 'advise' | 'intervene' | 'escalate' | 'manual_stop';
  priority: 'low' | 'normal' | 'high' | 'critical';
  state: string;
  problem_class:
    | 'loading_shell'
    | 'selector_miss'
    | 'control_type_mismatch'
    | 'unstable_commit'
    | 'focus_bounce'
    | 'portal_drift'
    | 'recovery_policy_violation'
    | 'batch_policy_violation'
    | 'human_action_required'
    | 'unknown';
  problem: string;
  root_cause: string;
  instruction_for_codex: string;
  fallback: string;
  stop_condition: string;
  confidence: number;
  evidence: {
    log_paths: string[];
    screenshot_paths: string[];
    state_snapshot: string;
  };
}

const DEFAULT_PROJECT_ROOT = path.resolve(__dirname, '..');

type NormalizationOptions = {
  runId: string;
  fallbackState?: string;
  stateSnapshotPath?: string;
  nowIso?: string;
};

export function createRunId(now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const suffix = crypto.randomBytes(3).toString('hex');
  return `run-${stamp}-${suffix}`;
}

export function getRuntimePaths(projectRoot: string = DEFAULT_PROJECT_ROOT): RuntimePaths {
  const runtimeDir = path.join(projectRoot, 'runtime');
  return {
    runtimeDir,
    statePath: path.join(runtimeDir, 'state.json'),
    interventionPath: path.join(runtimeDir, 'intervention.json'),
    interventionRawPath: path.join(runtimeDir, 'intervention.raw.json'),
  };
}

export function writeRuntimeState(snapshot: RuntimeStateSnapshot, paths: RuntimePaths = getRuntimePaths(snapshot.project_root)): void {
  fs.mkdirSync(paths.runtimeDir, { recursive: true });
  fs.writeFileSync(paths.statePath, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
}

export function upsertModuleOutcome(outcomes: ModuleOutcome[], next: ModuleOutcome): ModuleOutcome[] {
  const normalizedNext: ModuleOutcome = {
    id: next.id,
    name: next.name,
    status: next.status,
    evidence: [...next.evidence],
  };
  const index = outcomes.findIndex((outcome) => outcome.id === next.id);
  if (index === -1) {
    return [...outcomes, normalizedNext];
  }

  const cloned = outcomes.map((outcome) => ({
    id: outcome.id,
    name: outcome.name,
    status: outcome.status,
    evidence: [...outcome.evidence],
  }));
  cloned[index] = normalizedNext;
  return cloned;
}

function parseJsonFile<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return null;
  }
}

function parseTimestamp(value: string | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stripMarkdownJsonFence(value: string): string {
  return value
    .replace(/^\s*```json\s*/i, '')
    .replace(/^\s*```\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function canonicalPriority(
  decision: SupervisorIntervention['decision'],
): SupervisorIntervention['priority'] {
  switch (decision) {
    case 'manual_stop':
      return 'critical';
    case 'escalate':
      return 'high';
    case 'intervene':
      return 'normal';
    case 'advise':
      return 'normal';
    case 'observe':
    default:
      return 'low';
  }
}

function mapAlternateActionToDecision(
  action: string | null,
  requiresHuman: boolean,
): SupervisorIntervention['decision'] {
  if (requiresHuman) return 'manual_stop';
  switch ((action || '').toLowerCase()) {
    case 'continue':
    case 'proceed':
    case 'observe':
      return 'observe';
    case 'advise':
      return 'advise';
    case 'intervene':
      return 'intervene';
    case 'escalate':
      return 'escalate';
    case 'manual_stop':
    case 'stop':
      return 'manual_stop';
    default:
      return 'observe';
  }
}

function tryParseJsonString(value: string): unknown {
  const stripped = stripMarkdownJsonFence(value);
  try {
    return JSON.parse(stripped);
  } catch {
    return stripped;
  }
}

export function normalizeSupervisorIntervention(
  input: unknown,
  options: NormalizationOptions,
): SupervisorIntervention | null {
  if (typeof input === 'string') {
    const parsed = tryParseJsonString(input);
    if (parsed === input) return null;
    return normalizeSupervisorIntervention(parsed, options);
  }

  if (!isRecord(input)) return null;

  const wrappedResponse = asString(input.response);
  if (wrappedResponse) {
    return normalizeSupervisorIntervention(wrappedResponse, options);
  }

  const canonicalDecision = asString(input.decision);
  const canonicalProblemClass = asString(input.problem_class);
  if (canonicalDecision && canonicalProblemClass) {
    const decision = canonicalDecision as SupervisorIntervention['decision'];
    const priority =
      (asString(input.priority) as SupervisorIntervention['priority'] | null) || canonicalPriority(decision);
    return {
      version: '1.0',
      run_id: asString(input.run_id) || options.runId,
      created_at: asString(input.created_at) || options.nowIso || new Date().toISOString(),
      decision,
      priority,
      state: asString(input.state) || options.fallbackState || 'unknown',
      problem_class: canonicalProblemClass as SupervisorIntervention['problem_class'],
      problem: asString(input.problem) || 'Supervisor emitted canonical intervention without problem text.',
      root_cause: asString(input.root_cause) || 'unknown',
      instruction_for_codex: asString(input.instruction_for_codex) || 'No action needed.',
      fallback: asString(input.fallback) || 'N/A',
      stop_condition: asString(input.stop_condition) || 'N/A',
      confidence: asNumber(input.confidence) ?? 0.5,
      evidence: {
        log_paths: Array.isArray((input.evidence as Record<string, unknown> | undefined)?.log_paths)
          ? (((input.evidence as Record<string, unknown>).log_paths as unknown[]) ?? []).filter(
              (item): item is string => typeof item === 'string',
            )
          : [],
        screenshot_paths: Array.isArray((input.evidence as Record<string, unknown> | undefined)?.screenshot_paths)
          ? (((input.evidence as Record<string, unknown>).screenshot_paths as unknown[]) ?? []).filter(
              (item): item is string => typeof item === 'string',
            )
          : [],
        state_snapshot:
          asString((input.evidence as Record<string, unknown> | undefined)?.state_snapshot) ||
          options.stateSnapshotPath ||
          'runtime/state.json',
      },
    };
  }

  const alternateAction = asString(input.action);
  const reason = asString(input.reason);
  if (alternateAction || reason) {
    const requiresHuman = input.requires_human === true;
    const decision = mapAlternateActionToDecision(alternateAction, requiresHuman);
    return {
      version: '1.0',
      run_id: options.runId,
      created_at: options.nowIso || new Date().toISOString(),
      decision,
      priority: canonicalPriority(decision),
      state: asString(input.target_state) || options.fallbackState || 'unknown',
      problem_class: requiresHuman ? 'human_action_required' : 'unknown',
      problem: reason || 'Supervisor emitted alternate intervention schema.',
      root_cause: 'Normalized from alternate supervisor schema.',
      instruction_for_codex: asString(input.suggested_fix) || 'No action needed.',
      fallback: 'N/A',
      stop_condition: requiresHuman ? 'Human action required by supervisor.' : 'N/A',
      confidence: asNumber(input.confidence) ?? 0.5,
      evidence: {
        log_paths: [],
        screenshot_paths: [],
        state_snapshot: options.stateSnapshotPath || 'runtime/state.json',
      },
    };
  }

  return null;
}

export function writeCanonicalIntervention(
  rawOutput: string,
  stateSnapshot: Pick<RuntimeStateSnapshot, 'run_id' | 'state'>,
  paths: RuntimePaths = getRuntimePaths(),
): SupervisorIntervention {
  fs.mkdirSync(paths.runtimeDir, { recursive: true });
  fs.writeFileSync(paths.interventionRawPath, rawOutput, 'utf8');

  const normalized = normalizeSupervisorIntervention(tryParseJsonString(rawOutput), {
    runId: stateSnapshot.run_id,
    fallbackState: `${stateSnapshot.state.code} ${stateSnapshot.state.name}`.trim(),
    stateSnapshotPath: path.relative(path.dirname(paths.interventionPath), paths.statePath).replace(/\\/g, '/'),
    nowIso: new Date().toISOString(),
  });

  if (!normalized) {
    throw new Error('Failed to normalize supervisor intervention output');
  }

  fs.writeFileSync(paths.interventionPath, JSON.stringify(normalized, null, 2) + '\n', 'utf8');
  return normalized;
}

export function readFreshIntervention(
  runId: string,
  stateUpdatedAt: string,
  paths: RuntimePaths = getRuntimePaths(),
): SupervisorIntervention | null {
  const parsed = parseJsonFile<unknown>(paths.interventionPath);
  if (!parsed) return null;

  const interventionStat = fs.existsSync(paths.interventionPath) ? fs.statSync(paths.interventionPath) : null;
  const normalized = normalizeSupervisorIntervention(parsed, {
    runId,
    fallbackState: 'unknown',
    stateSnapshotPath: path.relative(path.dirname(paths.interventionPath), paths.statePath).replace(/\\/g, '/'),
    nowIso: interventionStat?.mtime.toISOString() || new Date().toISOString(),
  });
  if (!normalized) return null;
  if (normalized.run_id !== runId) return null;

  const interventionTime = parseTimestamp(normalized.created_at);
  const stateTime = parseTimestamp(stateUpdatedAt);
  if (interventionTime === null || stateTime === null) return null;
  if (interventionTime < stateTime) return null;

  return normalized;
}

export function shouldPauseForSupervisor(
  intervention: Pick<SupervisorIntervention, 'decision'> | null,
): boolean {
  return intervention?.decision === 'escalate' || intervention?.decision === 'manual_stop';
}
