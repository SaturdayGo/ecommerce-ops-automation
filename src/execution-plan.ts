export type ModuleId =
  | '1a'
  | '1b'
  | '1c'
  | '1d'
  | '1e'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6a'
  | '6b'
  | '7'
  | '8';

export interface ExecutionPlan {
  modeKind: 'smoke' | 'full' | 'modules';
  modeLabel: string;
  displayLabel: string;
  moduleIds: ModuleId[];
  selected: Set<ModuleId>;
}

const FULL_MODULE_SEQUENCE: ModuleId[] = [
  '1b',
  '1a',
  '1c',
  '1d',
  '1e',
  '2',
  '3',
  '4',
  '5',
  '6a',
  '6b',
  '7',
  '8',
];

const SMOKE_MODULE_SEQUENCE: ModuleId[] = ['1b', '1a', '1c', '1d', '1e', '2', '5'];

const MODULE_ALIASES: Record<string, ModuleId> = {
  '1a': '1a',
  '1b': '1b',
  '1c': '1c',
  '1d': '1d',
  '1e': '1e',
  '2': '2',
  '3': '3',
  '4': '4',
  '5': '5',
  '6a': '6a',
  '6b': '6b',
  '7': '7',
  '8': '8',
  module1a: '1a',
  module1b: '1b',
  module1c: '1c',
  module1d: '1d',
  module1e: '1e',
  module2: '2',
  module3: '3',
  module4: '4',
  module5: '5',
  module6a: '6a',
  module6b: '6b',
  module7: '7',
  module8: '8',
  category: '1a',
  title: '1b',
  carousel: '1c',
  marketing: '1d',
  video: '1e',
  attributes: '2',
  customs: '3',
  pricing: '4',
  sku: '5',
  sku_images: '5',
  buyers_note: '6a',
  detail_images: '6b',
  shipping: '7',
  other: '8',
};

function pushUnique<T>(items: T[], value: T): void {
  if (!items.includes(value)) items.push(value);
}

function readFlagValues(args: string[], flagNames: string[]): string[] {
  const values: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    for (const flagName of flagNames) {
      if (arg === flagName) {
        const next = args[index + 1];
        if (next && !next.startsWith('--')) {
          values.push(next);
        }
      } else if (arg.startsWith(`${flagName}=`)) {
        values.push(arg.slice(flagName.length + 1));
      }
    }
  }
  return values;
}

function normalizeRequestedModule(token: string): ModuleId {
  const normalized = token.trim().toLowerCase().replace(/\s+/g, '').replace(/-/g, '');
  const mapped = MODULE_ALIASES[normalized];
  if (!mapped) {
    throw new Error(`未知模块选择: ${token}`);
  }
  return mapped;
}

export function parseRequestedModules(args: string[]): ModuleId[] | null {
  const rawValues = readFlagValues(args, ['--modules', '--module']);
  if (rawValues.length === 0) return null;

  const modules: ModuleId[] = [];
  for (const rawValue of rawValues) {
    const tokens = rawValue
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    for (const token of tokens) {
      pushUnique(modules, normalizeRequestedModule(token));
    }
  }
  return modules.length > 0 ? modules : null;
}

export function buildExecutionPlan(input: {
  smoke: boolean;
  requestedModules: ModuleId[] | null;
}): ExecutionPlan {
  const moduleIds = input.requestedModules
    ? [...input.requestedModules]
    : input.smoke
      ? [...SMOKE_MODULE_SEQUENCE]
      : [...FULL_MODULE_SEQUENCE];

  if (input.requestedModules) {
    const joined = moduleIds.join('-');
    return {
      modeKind: 'modules',
      modeLabel: `modules-${joined}`,
      displayLabel: `MODULES (${moduleIds.join(', ')})`,
      moduleIds,
      selected: new Set(moduleIds),
    };
  }

  return {
    modeKind: input.smoke ? 'smoke' : 'full',
    modeLabel: input.smoke ? 'smoke' : 'full',
    displayLabel: input.smoke ? 'SMOKE (模块1/2/5)' : 'FULL (全模块)',
    moduleIds,
    selected: new Set(moduleIds),
  };
}

export function shouldRunModule(plan: ExecutionPlan, moduleId: ModuleId): boolean {
  return plan.selected.has(moduleId);
}

export function requiresVideoCategoryBootstrap(plan: ExecutionPlan): boolean {
  return plan.selected.has('1e') && !plan.selected.has('1a');
}
