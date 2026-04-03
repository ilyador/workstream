#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="${ROOT_DIR:-$SCRIPT_DIR/..}"
LOCK_FILE="${LOCK_FILE:-/tmp/codesync-git-sync.lock}"
GIT_REMOTE="${GIT_REMOTE:-origin}"
GIT_BRANCH="${GIT_BRANCH:-main}"

if ! command -v git >/dev/null 2>&1; then
  echo "git is not available in PATH."
  exit 1
fi

if [[ ! -d "$ROOT_DIR/.git" ]]; then
  echo "Not a git repository: $ROOT_DIR"
  exit 1
fi

# Prevent overlapping timer runs.
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "Another git sync run is already active; skipping."
  exit 0
fi

cd "$ROOT_DIR"

# Skip auto-pull when tracked files are modified/staged.
if ! git diff --quiet --ignore-submodules -- || ! git diff --cached --quiet --ignore-submodules --; then
  echo "Tracked files have local changes; skipping auto-pull."
  exit 0
fi

current_branch="$(git symbolic-ref --short -q HEAD || true)"
if [[ -z "$current_branch" ]]; then
  echo "Repository is in detached HEAD; skipping auto-pull."
  exit 0
fi

if [[ "$current_branch" != "$GIT_BRANCH" ]]; then
  echo "Current branch is '$current_branch' (expected '$GIT_BRANCH'); skipping auto-pull."
  exit 0
fi

git fetch --prune "$GIT_REMOTE" "$GIT_BRANCH"

if ! git show-ref --verify --quiet "refs/remotes/$GIT_REMOTE/$GIT_BRANCH"; then
  echo "Remote branch '$GIT_REMOTE/$GIT_BRANCH' does not exist."
  exit 1
fi

local_sha="$(git rev-parse HEAD)"
remote_sha="$(git rev-parse "refs/remotes/$GIT_REMOTE/$GIT_BRANCH")"
base_sha="$(git merge-base HEAD "refs/remotes/$GIT_REMOTE/$GIT_BRANCH")"

if [[ "$local_sha" == "$remote_sha" ]]; then
  echo "Already up to date at $local_sha."
  exit 0
fi

if [[ "$local_sha" != "$base_sha" ]]; then
  echo "Local branch has diverged from '$GIT_REMOTE/$GIT_BRANCH'; skipping auto-pull."
  exit 0
fi

git pull --ff-only "$GIT_REMOTE" "$GIT_BRANCH"
new_sha="$(git rev-parse HEAD)"
echo "Updated '$GIT_BRANCH': $local_sha -> $new_sha"

# Reinstall deps if lockfile changed.
# Load nvm so pnpm resolves.
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [[ -s "$NVM_DIR/nvm.sh" ]]; then
  # shellcheck disable=SC1090
  source "$NVM_DIR/nvm.sh"
fi

if git diff --name-only "$local_sha" "$new_sha" | grep -qE '(^|/)pnpm-lock\.yaml$'; then
  echo "pnpm-lock.yaml changed; running pnpm install..."
  pnpm install --frozen-lockfile
fi
