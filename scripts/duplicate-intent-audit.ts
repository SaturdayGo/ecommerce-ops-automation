import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

export type FunctionRecord = {
  filePath: string;
  line: number;
  name: string;
  kind: 'function' | 'arrow' | 'method';
  source: string;
  keywords?: string[];
};

export type DuplicateIntentGroup = {
  intentKey: string;
  sharedTokens: string[];
  records: FunctionRecord[];
};

export type DuplicateIntentReport = {
  scannedRoot: string;
  scannedFileCount: number;
  recordCount: number;
  groups: DuplicateIntentGroup[];
};

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'app', 'application', 'are', 'as', 'async', 'auto', 'await',
  'be', 'boolean', 'break', 'browser', 'button', 'by', 'case', 'catch', 'chrome',
  'class', 'click', 'collect', 'const', 'continue', 'create', 'current', 'darwin',
  'debug', 'default', 'derive', 'do', 'else', 'ensure', 'escape', 'exec', 'export',
  'false', 'file', 'fill', 'finally', 'find', 'for', 'format', 'from', 'front',
  'function', 'get', 'google', 'if', 'import', 'in', 'inspect', 'is', 'let',
  'load', 'locate', 'make', 'maybe', 'new', 'node', 'null', 'number', 'of', 'open',
  'or', 'osascript', 'page', 'parse', 'patch', 'pick', 'platform', 'proces',
  'promise', 'read', 'render', 'reset', 'resolve', 'return', 'root', 'scan',
  'scope', 'select', 'state', 'string', 'switch', 'sync', 'tell', 'text', 'that',
  'the', 'this', 'throw', 'timeout', 'true', 'try', 'type', 'typeof', 'undefined',
  'use', 'var', 'visible', 'void', 'wait', 'while', 'window', 'write',
]);

const TOKEN_REWRITE = new Map<string, string>([
  ['closest', 'nearest'],
  ['container', 'container'],
  ['containers', 'container'],
  ['fields', 'field'],
  ['labels', 'label'],
  ['locate', 'find'],
  ['located', 'find'],
  ['locates', 'find'],
  ['resolves', 'find'],
  ['resolving', 'find'],
  ['resolve', 'find'],
  ['shell', 'container'],
  ['wrappers', 'wrapper'],
]);

const ROOT_EXCLUDES = new Set(['.git', 'artifacts', 'node_modules', 'runlogs', 'screenshots']);

export function extractFunctionCatalogFromSource(sourceText: string, filePath: string): FunctionRecord[] {
  const sourceFile = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const records: FunctionRecord[] = [];

  const pushRecord = (name: string, kind: FunctionRecord['kind'], node: ts.Node) => {
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    records.push({
      filePath,
      line,
      name,
      kind,
      source: node.getText(sourceFile),
      keywords: collectIdentifierKeywords(node, sourceFile),
    });
  };

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      pushRecord(statement.name.text, 'function', statement);
      continue;
    }

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) {
          continue;
        }
        if (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer)) {
          pushRecord(declaration.name.text, 'arrow', declaration);
        }
      }
      continue;
    }

    if (ts.isClassDeclaration(statement)) {
      for (const member of statement.members) {
        if (!ts.isMethodDeclaration(member) || !member.name) {
          continue;
        }
        const name = ts.isIdentifier(member.name) ? member.name.text : member.name.getText(sourceFile);
        pushRecord(name, 'method', member);
      }
    }
  }

  return records;
}

function splitIdentifierWords(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-]+/g, ' ')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

function normalizeToken(token: string): string | null {
  if (!token) {
    return null;
  }

  const lowered = token.toLowerCase();
  if (/^\d+$/.test(lowered)) {
    return null;
  }
  const rewritten = TOKEN_REWRITE.get(lowered) ?? lowered;
  const singular = rewritten.endsWith('s') && rewritten.length > 4 ? rewritten.slice(0, -1) : rewritten;

  if (singular.length < 4 && singular !== 'sku') {
    return null;
  }
  if (STOP_WORDS.has(singular)) {
    return null;
  }
  return singular;
}

function collectIdentifierKeywords(node: ts.Node, sourceFile: ts.SourceFile): string[] {
  const tokens = new Set<string>();

  const pushWords = (value: string) => {
    for (const word of splitIdentifierWords(value)) {
      const token = normalizeToken(word);
      if (token) {
        tokens.add(token);
      }
    }
  };

  pushWords(node.getText(sourceFile));

  const visit = (child: ts.Node) => {
    if (ts.isIdentifier(child)) {
      pushWords(child.text);
    } else if (ts.isStringLiteralLike(child)) {
      pushWords(child.text);
    }
    ts.forEachChild(child, visit);
  };

  ts.forEachChild(node, visit);

  return [...tokens].sort();
}

function extractIntentTokens(record: FunctionRecord): string[] {
  if (record.keywords && record.keywords.length > 0) {
    return [...new Set(record.keywords)].sort();
  }

  const words = [
    ...splitIdentifierWords(record.name),
    ...record.source
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  ];

  const tokens = new Set<string>();
  for (const word of words) {
    const token = normalizeToken(word);
    if (token) {
      tokens.add(token);
    }
  }

  return [...tokens].sort();
}

function scoreOverlap(left: string[], right: string[]) {
  const rightSet = new Set(right);
  const shared = left.filter((token) => rightSet.has(token));
  const ratio = shared.length / Math.max(1, Math.min(left.length, right.length));
  return { shared, ratio };
}

export function findDuplicateIntentGroups(records: FunctionRecord[]): DuplicateIntentGroup[] {
  const tokensByRecord = records.map((record) => extractIntentTokens(record));
  const adjacency = new Map<number, Set<number>>();

  for (let index = 0; index < records.length; index += 1) {
    adjacency.set(index, new Set<number>());
  }

  for (let left = 0; left < records.length; left += 1) {
    for (let right = left + 1; right < records.length; right += 1) {
      const { shared, ratio } = scoreOverlap(tokensByRecord[left], tokensByRecord[right]);
      if (shared.length < 3 || ratio < 0.5) {
        continue;
      }
      adjacency.get(left)?.add(right);
      adjacency.get(right)?.add(left);
    }
  }

  const visited = new Set<number>();
  const groups: DuplicateIntentGroup[] = [];

  for (let start = 0; start < records.length; start += 1) {
    if (visited.has(start)) {
      continue;
    }
    const queue = [start];
    const cluster: number[] = [];
    visited.add(start);

    while (queue.length > 0) {
      const current = queue.shift()!;
      cluster.push(current);
      for (const neighbor of adjacency.get(current) ?? []) {
        if (visited.has(neighbor)) {
          continue;
        }
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }

    if (cluster.length < 2) {
      continue;
    }

    const sharedTokens = tokensByRecord[cluster[0]].filter((token) =>
      cluster.every((index) => tokensByRecord[index].includes(token)),
    );
    if (sharedTokens.length < 3) {
      continue;
    }

    groups.push({
      intentKey: sharedTokens.join(' '),
      sharedTokens,
      records: cluster.map((index) => records[index]).sort((left, right) => {
        if (left.filePath === right.filePath) {
          return left.line - right.line;
        }
        return left.filePath.localeCompare(right.filePath);
      }),
    });
  }

  return groups.sort((left, right) => {
    if (right.records.length !== left.records.length) {
      return right.records.length - left.records.length;
    }
    if (right.sharedTokens.length !== left.sharedTokens.length) {
      return right.sharedTokens.length - left.sharedTokens.length;
    }
    return left.intentKey.localeCompare(right.intentKey);
  });
}

export function renderDuplicateIntentReport(report: DuplicateIntentReport): string {
  const lines = [
    '# Duplicate-Intent Audit Report',
    '',
    `Scanned root: \`${report.scannedRoot}\``,
    `Scanned files: \`${report.scannedFileCount}\``,
    `Functions: \`${report.recordCount}\``,
    `Candidate groups: \`${report.groups.length}\``,
    '',
  ];

  if (report.groups.length === 0) {
    lines.push('No duplicate-intent candidate groups found.');
    return lines.join('\n');
  }

  report.groups.forEach((group, index) => {
    lines.push(`## Group ${index + 1}: ${group.intentKey}`);
    lines.push('');
    lines.push(`Shared tokens: ${group.sharedTokens.map((token) => `\`${token}\``).join(', ')}`);
    lines.push('');
    for (const record of group.records) {
      lines.push(`- \`${record.filePath}:${record.line}\` \`${record.name}\` (${record.kind})`);
    }
    lines.push('');
  });

  return lines.join('\n');
}

function walkTypeScriptFiles(targetPath: string): string[] {
  const stat = fs.statSync(targetPath);
  if (stat.isFile()) {
    return targetPath.endsWith('.ts') && !targetPath.endsWith('.test.ts') ? [targetPath] : [];
  }

  const discovered: string[] = [];

  for (const entry of fs.readdirSync(targetPath, { withFileTypes: true })) {
    if (ROOT_EXCLUDES.has(entry.name)) {
      continue;
    }
    const entryPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      discovered.push(...walkTypeScriptFiles(entryPath));
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) {
      continue;
    }
    discovered.push(entryPath);
  }

  return discovered.sort();
}

export function scanDuplicateIntent(rootPath: string): DuplicateIntentReport {
  const files = walkTypeScriptFiles(rootPath);
  const records = files.flatMap((filePath) => extractFunctionCatalogFromSource(fs.readFileSync(filePath, 'utf8'), filePath));
  const groups = findDuplicateIntentGroups(records);

  return {
    scannedRoot: rootPath,
    scannedFileCount: files.length,
    recordCount: records.length,
    groups,
  };
}

function parseCliArgs(argv: string[]) {
  let rootPath = path.resolve(process.cwd(), 'src');
  let outPath: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--out') {
      outPath = path.resolve(process.cwd(), argv[index + 1] ?? '');
      index += 1;
      continue;
    }
    rootPath = path.resolve(process.cwd(), arg);
  }

  return { rootPath, outPath };
}

async function main() {
  const { rootPath, outPath } = parseCliArgs(process.argv.slice(2));
  const report = scanDuplicateIntent(rootPath);
  const markdown = renderDuplicateIntentReport(report);

  if (outPath) {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${markdown}\n`);
    console.log(`duplicate-intent report written to ${outPath}`);
    return;
  }

  process.stdout.write(`${markdown}\n`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
