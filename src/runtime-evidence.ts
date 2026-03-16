import path from 'node:path';

export function normalizeProjectArtifactPath(artifactPath: string, projectRoot: string): string {
    const trimmed = artifactPath.trim();
    if (!trimmed) return '';

    const absolutePath = path.isAbsolute(trimmed) ? trimmed : path.resolve(projectRoot, trimmed);
    const relativePath = path.relative(projectRoot, absolutePath);

    if (!relativePath || relativePath.startsWith('..')) {
        return absolutePath.replace(/\\/g, '/');
    }

    return relativePath.replace(/\\/g, '/');
}

export function appendProjectArtifactPath(
    currentPaths: string[],
    artifactPath: string | null | undefined,
    projectRoot: string,
): string[] {
    const normalizedCurrent = currentPaths.filter((entry) => Boolean(entry && entry.trim()));
    if (!artifactPath || !artifactPath.trim()) {
        return normalizedCurrent;
    }

    const normalizedArtifactPath = normalizeProjectArtifactPath(artifactPath, projectRoot);
    if (!normalizedArtifactPath || normalizedCurrent.includes(normalizedArtifactPath)) {
        return normalizedCurrent;
    }

    return [...normalizedCurrent, normalizedArtifactPath];
}
