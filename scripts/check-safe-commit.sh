#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

staged_files="$(git diff --cached --name-only --diff-filter=ACMR)"

if [[ -z "$staged_files" ]]; then
  exit 0
fi

blocked_paths='(^|/)(\.auth/|\.chrome-profile/|runtime/|runlogs/|screenshots/|artifacts/|\.env($|\.)|.*storage-state\.json$|.*cookies.*\.json$|.*session.*\.json$|.*token.*\.json$|.*secret.*\.json$)'
blocked_content='(OPENAI_API_KEY|access_token|refresh_token|id_token|password[[:space:]]*[:=]|storageState|cookie|sessionStorage|localStorage)'
content_scan_allowlist='^(\.gitignore|SECURITY\.md|\.githooks/pre-commit|scripts/check-safe-commit\.sh)$'

while IFS= read -r file; do
  [[ -z "$file" ]] && continue

  if [[ "$file" =~ $blocked_paths ]]; then
    echo "Blocked commit: sensitive path staged -> $file" >&2
    echo "Refusing to commit auth/runtime/evidence/env material." >&2
    exit 1
  fi

  if [[ "$file" =~ $content_scan_allowlist ]]; then
    continue
  fi

  if git diff --cached -- "$file" | rg -n -i "$blocked_content" >/dev/null; then
    echo "Blocked commit: suspicious secret/session content detected -> $file" >&2
    echo "Review the staged diff and move sensitive state out of git." >&2
    exit 1
  fi
done <<< "$staged_files"

exit 0
