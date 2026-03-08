import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';

export interface RunlogMirrorHandle {
  absolutePath: string;
  relativePath: string;
  close(): Promise<void>;
}

function toRelativePath(projectRoot: string, candidatePath: string): string {
  return path.relative(projectRoot, candidatePath).replace(/\\/g, '/');
}

export function createRunlogMirror(
  projectRoot: string,
  runId: string,
  mode: string,
  explicitPath?: string,
): RunlogMirrorHandle {
  const fallbackAbsolutePath = path.join(projectRoot, 'runlogs', `${runId}_${mode}.log`);
  const absolutePath = explicitPath
    ? (path.isAbsolute(explicitPath) ? explicitPath : path.join(projectRoot, explicitPath))
    : fallbackAbsolutePath;
  const relativePath = toRelativePath(projectRoot, absolutePath);

  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  const stream = fs.createWriteStream(absolutePath, { flags: 'a' });

  const originalLog = console.log.bind(console);
  const originalWarn = console.warn.bind(console);
  const originalError = console.error.bind(console);

  const mirror = (original: (...args: unknown[]) => void) => (...args: unknown[]) => {
    stream.write(`${util.format(...args)}\n`);
    original(...args);
  };

  console.log = mirror(originalLog);
  console.warn = mirror(originalWarn);
  console.error = mirror(originalError);

  return {
    absolutePath,
    relativePath,
    close() {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
      return new Promise<void>((resolve, reject) => {
        stream.end((error?: Error | null) => {
          if (error) reject(error);
          else resolve();
        });
      });
    },
  };
}
