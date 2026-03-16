import fs from 'node:fs';
import path from 'node:path';

import type { ModuleOutcome, RuntimeStateSnapshot } from './runtime-supervision';
import { normalizeProjectArtifactPath } from './runtime-evidence';

export interface ManualHandoffItem {
  module_id: string;
  module_name: string;
  status: 'manual_gate' | 'detect_only';
  reason: string;
  next_action: string;
  evidence: string[];
}

export interface ManualHandoffSummary {
  version: '1.0';
  run_id: string;
  created_at: string;
  mode: string;
  status: 'needs_human_handoff';
  log_path: string;
  state_snapshot_path: string;
  items: ManualHandoffItem[];
}

export interface ManualHandoffArtifacts {
  json_path: string;
  markdown_path: string;
  latest_path: string;
}

function manualReasonFor(outcome: ModuleOutcome): string {
  switch (outcome.id) {
    case '3':
      return outcome.status === 'detect_only'
        ? '海关信息当前仅检测，不做自动填写'
        : '海关信息当前为人工门禁';
    case '6c':
      return 'APP 描述当前为人工门禁';
    case '8':
      return '其它设置当前为人工门禁';
    default:
      return outcome.status === 'detect_only'
        ? `${outcome.name} 当前仅检测，不做自动填写`
        : `${outcome.name} 当前为人工门禁`;
  }
}

function manualNextActionFor(outcome: ModuleOutcome): string {
  switch (outcome.id) {
    case '3':
      return '根据当前页面流转手动完成海关监管属性/资质信息或确认保留默认值后继续检查';
    case '6c':
      return '在当前页面手动填写 APP 描述后继续检查';
    case '8':
      return '在当前页面手动完成欧盟责任人/制造商等设置后继续检查';
    default:
      return `在当前页面手动完成 ${outcome.name} 后继续检查`;
  }
}

function normalizeEvidenceToken(token: string): string {
  return token.replace(/_or_default$/, '').replace(/_done$/, '').trim();
}

function resolveEvidencePaths(snapshot: RuntimeStateSnapshot, evidenceTokens: string[]): string[] {
  const screenshots = snapshot.evidence.screenshot_paths ?? [];
  const resolved = new Set<string>();

  for (const rawToken of evidenceTokens) {
    const token = normalizeEvidenceToken(rawToken);
    if (!token) continue;

    if (token.includes('/')) {
      resolved.add(token);
      continue;
    }

    for (const screenshotPath of screenshots) {
      const base = path.basename(screenshotPath);
      if (base.startsWith(token) || screenshotPath.includes(token)) {
        resolved.add(screenshotPath);
      }
    }
  }

  return [...resolved];
}

export function buildManualHandoffSummary(
  snapshot: RuntimeStateSnapshot,
  stateSnapshotPath = 'runtime/state.json',
): ManualHandoffSummary | null {
  const manualOutcomes = snapshot.module_outcomes.filter(
    (outcome): outcome is ModuleOutcome & { status: 'manual_gate' | 'detect_only' } =>
      outcome.status === 'manual_gate' || outcome.status === 'detect_only',
  );

  if (manualOutcomes.length === 0) return null;

  return {
    version: '1.0',
    run_id: snapshot.run_id,
    created_at: snapshot.updated_at,
    mode: snapshot.mode,
    status: 'needs_human_handoff',
    log_path: snapshot.evidence.log_path,
    state_snapshot_path: stateSnapshotPath,
    items: manualOutcomes.map((outcome) => ({
      module_id: outcome.id,
      module_name: outcome.name,
      status: outcome.status,
      reason: manualReasonFor(outcome),
      next_action: manualNextActionFor(outcome),
      evidence: resolveEvidencePaths(snapshot, outcome.evidence),
    })),
  };
}

export function renderManualHandoffMarkdown(summary: ManualHandoffSummary): string {
  const lines = [
    '# Manual Handoff Summary',
    '',
    `Run: \`${summary.run_id}\``,
    `Mode: \`${summary.mode}\``,
    '',
    '## 当前需要人工接手',
  ];

  for (const item of summary.items) {
    lines.push(`### ${item.module_id} ${item.module_name}`);
    lines.push(`- 状态：${item.status}`);
    lines.push(`- 原因：${item.reason}`);
    lines.push(`- 你现在要做：${item.next_action}`);
    if (item.evidence.length > 0) {
      lines.push('- 证据：');
      for (const evidencePath of item.evidence) {
        lines.push(`  - ${evidencePath}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}

export function writeManualHandoffArtifacts(
  summary: ManualHandoffSummary,
  projectRoot: string,
): ManualHandoffArtifacts {
  const artifactDir = path.join(projectRoot, 'artifacts', 'manual-handoffs', summary.run_id);
  fs.mkdirSync(artifactDir, { recursive: true });

  const jsonAbsolutePath = path.join(artifactDir, 'handoff-summary.json');
  const markdownAbsolutePath = path.join(artifactDir, 'handoff-summary.md');
  const latestAbsolutePath = path.join(projectRoot, 'runtime', 'latest-handoff.json');
  fs.mkdirSync(path.dirname(latestAbsolutePath), { recursive: true });

  fs.writeFileSync(jsonAbsolutePath, JSON.stringify(summary, null, 2) + '\n', 'utf8');
  fs.writeFileSync(markdownAbsolutePath, renderManualHandoffMarkdown(summary), 'utf8');

  const jsonPath = normalizeProjectArtifactPath(jsonAbsolutePath, projectRoot);
  const markdownPath = normalizeProjectArtifactPath(markdownAbsolutePath, projectRoot);
  const latestPayload = {
    version: '1.0',
    run_id: summary.run_id,
    updated_at: summary.created_at,
    json_path: jsonPath,
    markdown_path: markdownPath,
  };
  fs.writeFileSync(latestAbsolutePath, JSON.stringify(latestPayload, null, 2) + '\n', 'utf8');

  return {
    json_path: jsonPath,
    markdown_path: markdownPath,
    latest_path: normalizeProjectArtifactPath(latestAbsolutePath, projectRoot),
  };
}

export function syncLatestManualHandoff(
  snapshot: RuntimeStateSnapshot | null,
  projectRoot: string,
  stateSnapshotPath = 'runtime/state.json',
): ManualHandoffArtifacts | null {
  if (!snapshot) {
    clearLatestManualHandoff(projectRoot);
    return null;
  }

  const summary = buildManualHandoffSummary(snapshot, stateSnapshotPath);
  if (!summary) {
    clearLatestManualHandoff(projectRoot);
    return null;
  }

  return writeManualHandoffArtifacts(summary, projectRoot);
}

export function clearLatestManualHandoff(projectRoot: string): void {
  const latestAbsolutePath = path.join(projectRoot, 'runtime', 'latest-handoff.json');
  if (fs.existsSync(latestAbsolutePath)) {
    fs.rmSync(latestAbsolutePath);
  }
}
