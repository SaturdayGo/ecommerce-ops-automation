import * as fs from 'fs';
import * as path from 'path';
import type { Page } from 'playwright';

type SnapshotLike = {
  state?: { code?: string; name?: string };
  module?: { name?: string };
  target?: { field_label?: string };
  last_action?: { description?: string; kind?: string };
  status?: string;
};

export interface RuntimeObservabilityConfig {
  enabled: boolean;
  hudEnabled: boolean;
  eventsPath: string;
  warnAfterMs: number;
  alertAfterMs: number;
}

export interface RuntimeObservabilityEvent {
  ts: string;
  state: string;
  module: string;
  field: string;
  action: string;
  status: string;
  details: string;
  status_label?: string;
  duration_ms?: number | null;
  tone?: 'normal' | 'warn' | 'alert';
}

export interface RuntimeHudPayload {
  stateLabel: string;
  moduleLabel: string;
  fieldLabel: string;
  actionLabel: string;
  statusLabel: string;
  warnAfterMs: number;
  alertAfterMs: number;
  signature: string;
}

function parseIsoMillis(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toBool(value: string | undefined): boolean {
  return value === '1' || value === 'true';
}

function toPositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getRuntimeObservabilityConfig(
  browserVideoArtifactRoot: string,
  env: Record<string, string | undefined> = process.env,
): RuntimeObservabilityConfig {
  const enabled = toBool(env.RECORD_BROWSER_VIDEO) || toBool(env.RUNTIME_VISUAL_OBSERVABILITY);
  return {
    enabled,
    hudEnabled: enabled,
    eventsPath: path.join(browserVideoArtifactRoot, 'events.json'),
    warnAfterMs: toPositiveInt(env.RUNTIME_HUD_WARN_MS, 3000),
    alertAfterMs: toPositiveInt(env.RUNTIME_HUD_ALERT_MS, 8000),
  };
}

export function recordRuntimeEvent(
  config: RuntimeObservabilityConfig,
  event: RuntimeObservabilityEvent,
): void {
  if (!config.enabled) return;
  fs.mkdirSync(path.dirname(config.eventsPath), { recursive: true });
  const existing = fs.existsSync(config.eventsPath)
    ? JSON.parse(fs.readFileSync(config.eventsPath, 'utf8')) as RuntimeObservabilityEvent[]
    : [];
  const nextEvent: RuntimeObservabilityEvent = {
    ...event,
    status_label: humanizeStatusLabel(event.status),
    duration_ms: event.duration_ms ?? null,
    tone: event.tone ?? 'normal',
  };

  const lastEvent = existing.at(-1);
  if (lastEvent) {
    const prevTs = parseIsoMillis(lastEvent.ts);
    const nextTs = parseIsoMillis(nextEvent.ts);
    if (prevTs !== null && nextTs !== null && nextTs >= prevTs) {
      const durationMs = nextTs - prevTs;
      lastEvent.duration_ms = durationMs;
      lastEvent.tone = getHudVisualTone(durationMs, config.warnAfterMs, config.alertAfterMs);
      lastEvent.status_label = lastEvent.status_label || humanizeStatusLabel(lastEvent.status);
    }
  }

  existing.push(nextEvent);
  fs.writeFileSync(config.eventsPath, JSON.stringify(existing, null, 2) + '\n', 'utf8');
}

export function formatHudPayload(
  snapshot: SnapshotLike,
  thresholds: Pick<RuntimeObservabilityConfig, 'warnAfterMs' | 'alertAfterMs'> = {
    warnAfterMs: 3000,
    alertAfterMs: 8000,
  },
): RuntimeHudPayload {
  const stateCode = snapshot.state?.code || 'NA';
  const stateName = snapshot.state?.name || 'unknown';
  const actionLabel = humanizeActionLabel(snapshot.last_action?.kind, snapshot.last_action?.description);
  const signature = [
    stateCode,
    stateName,
    snapshot.module?.name || 'unknown',
    snapshot.target?.field_label || 'unknown',
    actionLabel,
    snapshot.status || 'unknown',
  ].join('|');
  return {
    stateLabel: `${stateCode} / ${stateName}`,
    moduleLabel: snapshot.module?.name || 'unknown',
    fieldLabel: snapshot.target?.field_label || 'unknown',
    actionLabel,
    statusLabel: humanizeStatusLabel(snapshot.status),
    warnAfterMs: thresholds.warnAfterMs,
    alertAfterMs: thresholds.alertAfterMs,
    signature,
  };
}

export function humanizeActionLabel(kind: string | undefined, description: string | undefined): string {
  const raw = (description || '').trim();
  if (/[\u4e00-\u9fff]/.test(raw)) {
    return raw;
  }

  switch (kind) {
    case 'module1_running':
      return '填写标题、类目与营销图';
    case 'module2_running':
      return '等待商品属性提交稳定';
    case 'module5_running':
      return '进入 SKU 颜色、批量填充与图片流程';
    case 'load_yaml':
      return '加载 YAML 数据';
    case 'navigate_publish':
      return '进入发布页并等待表单就绪';
    case 'fill_category':
      return '锁定类目并等待表单切换';
    case 'fill_attributes':
      if (/completed/i.test(raw)) return '商品属性已提交稳定';
      return '等待商品属性提交稳定';
    case 'fill_sku_images':
      return 'SKU 图片流程完成';
    case 'screenshot_after_fill':
      return '等待人工检查';
    case 'save_auth':
      return '保存登录状态';
    default:
      return raw || 'unknown';
  }
}

export function humanizeStatusLabel(status: string | undefined): string {
  switch (status) {
    case 'running':
      return '进行中';
    case 'waiting_human':
      return '等待人工确认';
    case 'completed':
      return '已完成';
    case 'failed':
      return '执行失败';
    default:
      return status || 'unknown';
  }
}

export function getHudVisualTone(
  elapsedMs: number,
  warnAfterMs: number,
  alertAfterMs: number,
): 'normal' | 'warn' | 'alert' {
  if (elapsedMs >= alertAfterMs) return 'alert';
  if (elapsedMs >= warnAfterMs) return 'warn';
  return 'normal';
}

export function getHudEvaluateSource(): string {
  return `
    const id = '__codex_runtime_hud__';
    const timerKey = '__codex_runtime_hud_timer__';
    let root = document.getElementById(id);
    if (!root) {
      root = document.createElement('div');
      root.id = id;
      root.setAttribute('data-codex-runtime-hud', '1');
      Object.assign(root.style, {
        position: 'fixed',
        top: '12px',
        left: '12px',
        zIndex: '2147483647',
        padding: '10px 12px',
        background: 'rgba(17, 24, 39, 0.86)',
        color: '#f9fafb',
        border: '1px solid rgba(255,255,255,0.14)',
        borderRadius: '8px',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: '12px',
        lineHeight: '1.5',
        boxShadow: '0 8px 24px rgba(0,0,0,0.28)',
        maxWidth: '420px',
        whiteSpace: 'pre-wrap',
        pointerEvents: 'none',
      });
      document.body.appendChild(root);
    }

    root.dataset.signature = hudPayload.signature;
    root.dataset.stateLabel = hudPayload.stateLabel;
    root.dataset.moduleLabel = hudPayload.moduleLabel;
    root.dataset.fieldLabel = hudPayload.fieldLabel;
    root.dataset.actionLabel = hudPayload.actionLabel;
    root.dataset.statusLabel = hudPayload.statusLabel;
    root.dataset.warnAfterMs = String(hudPayload.warnAfterMs);
    root.dataset.alertAfterMs = String(hudPayload.alertAfterMs);
    if (!root.dataset.startedAt || root.dataset.prevSignature !== hudPayload.signature) {
      root.dataset.startedAt = String(Date.now());
    }
    root.dataset.prevSignature = hudPayload.signature;

    const paint = () => {
      const startedAt = Number(root.dataset.startedAt || Date.now());
      const warnAfterMs = Number(root.dataset.warnAfterMs || 3000);
      const alertAfterMs = Number(root.dataset.alertAfterMs || 8000);
      const elapsedMs = Math.max(0, Date.now() - startedAt);
      const tone = elapsedMs >= alertAfterMs ? 'alert' : elapsedMs >= warnAfterMs ? 'warn' : 'normal';
      const palette = tone === 'alert'
        ? {
            background: 'rgba(127, 29, 29, 0.92)',
            border: '1px solid rgba(248,113,113,0.72)',
            color: '#fef2f2',
          }
        : tone === 'warn'
          ? {
              background: 'rgba(120, 53, 15, 0.92)',
              border: '1px solid rgba(251,191,36,0.72)',
              color: '#fffbeb',
            }
          : {
              background: 'rgba(17, 24, 39, 0.86)',
              border: '1px solid rgba(255,255,255,0.14)',
              color: '#f9fafb',
            };

      Object.assign(root.style, palette);
      root.textContent = [
        'State: ' + (root.dataset.stateLabel || 'NA'),
        'Module: ' + (root.dataset.moduleLabel || 'unknown'),
        'Field: ' + (root.dataset.fieldLabel || 'unknown'),
        'Action: ' + (root.dataset.actionLabel || 'unknown'),
        'Status: ' + (root.dataset.statusLabel || 'unknown'),
        'Elapsed: ' + (elapsedMs / 1000).toFixed(1) + 's',
      ].join('\\n');
    };

    paint();
    const holder = window;
    if (!holder[timerKey]) {
      holder[timerKey] = window.setInterval(() => {
        if (!document.getElementById(id)) {
          window.clearInterval(holder[timerKey]);
          holder[timerKey] = undefined;
          return;
        }
        paint();
      }, 250);
    }
  `;
}

export async function renderRuntimeHud(
  page: Page,
  payload: RuntimeHudPayload,
): Promise<void> {
  const source = getHudEvaluateSource();
  await page.evaluate(({ hudPayload, hudSource }) => {
    const runner = new Function('hudPayload', hudSource);
    runner(hudPayload);
  }, { hudPayload: payload, hudSource: source }).catch(() => {
    // Ignore HUD injection failures; this is observability only.
  });
}
