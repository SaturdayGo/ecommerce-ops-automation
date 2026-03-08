import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';

export interface BrowserVideoArtifactsConfig {
  enabled: boolean;
  artifactRoot: string;
  videoDir: string;
  videoPath: string;
  framesDir: string;
  manifestPath: string;
  frameFps: string;
  extractFrames: boolean;
  ffmpegPath: string;
}

export interface PlaywrightVideoHandle {
  saveAs(path: string): Promise<void>;
}

function toBool(value: string | undefined): boolean {
  return value === '1' || value === 'true';
}

export function getBrowserVideoArtifactsConfig(
  projectRoot: string,
  runId: string,
  mode: string,
  env: Record<string, string | undefined> = process.env,
): BrowserVideoArtifactsConfig {
  const enabled = toBool(env.RECORD_BROWSER_VIDEO);
  const artifactRoot = path.join(projectRoot, 'artifacts', 'browser-video', `${runId}_${mode}`);
  return {
    enabled,
    artifactRoot,
    videoDir: artifactRoot,
    videoPath: path.join(artifactRoot, 'browser-run.webm'),
    framesDir: path.join(artifactRoot, 'frames'),
    manifestPath: path.join(artifactRoot, 'manifest.json'),
    frameFps: env.VIDEO_FRAME_FPS || '0.5',
    extractFrames: enabled && toBool(env.EXTRACT_VIDEO_FRAMES),
    ffmpegPath: env.FFMPEG_PATH || 'ffmpeg',
  };
}

export function extractVideoFrames(
  videoPath: string,
  framesDir: string,
  ffmpegPath: string,
  fps: string,
): string[] {
  fs.mkdirSync(framesDir, { recursive: true });
  const pattern = path.join(framesDir, 'frame-%04d.jpg');
  execFileSync(ffmpegPath, ['-y', '-i', videoPath, '-vf', `fps=${fps}`, pattern], { stdio: 'ignore' });
  return fs.readdirSync(framesDir)
    .filter(name => name.endsWith('.jpg'))
    .sort()
    .map(name => path.join(framesDir, name));
}

export async function persistRecordedVideo(
  video: PlaywrightVideoHandle | null | undefined,
  targetPath: string,
): Promise<string | null> {
  if (!video) return null;
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  await video.saveAs(targetPath);
  return targetPath;
}

export function canonicalizeRecordedVideo(
  videoDir: string,
  targetPath: string,
): string | null {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  const candidates = fs.readdirSync(videoDir)
    .filter(name => name.endsWith('.webm'))
    .sort();
  const sourcePath = candidates
    .map(name => path.join(videoDir, name))
    .find(candidatePath => candidatePath !== targetPath);

  if (!sourcePath && fs.existsSync(targetPath)) {
    return targetPath;
  }

  if (!sourcePath) {
    return null;
  }

  if (sourcePath !== targetPath) {
    fs.renameSync(sourcePath, targetPath);
  }
  return targetPath;
}

export function writeBrowserVideoManifest(
  config: BrowserVideoArtifactsConfig,
  payload: {
    runId: string;
    mode: string;
    videoPath: string | null;
    framePaths: string[];
    eventsPath?: string | null;
  },
): void {
  fs.mkdirSync(config.artifactRoot, { recursive: true });
  fs.writeFileSync(
    config.manifestPath,
    JSON.stringify({
      version: '1.0',
      run_id: payload.runId,
      mode: payload.mode,
      video_path: payload.videoPath,
      events_path: payload.eventsPath || null,
      frame_paths: payload.framePaths,
      generated_at: new Date().toISOString(),
    }, null, 2) + '\n',
    'utf8',
  );
}
