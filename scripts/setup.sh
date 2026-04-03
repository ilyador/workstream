#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_DIR="$PROJECT_DIR/deploy"
SYSTEMD_DIR="$HOME/.config/systemd/user"

echo "Setting up WorkStream from: $PROJECT_DIR"

mkdir -p "$SYSTEMD_DIR"

# Unmask any previously masked services first
systemctl --user unmask codesync-server codesync-worker codesync-web codesync-bot codesync-git-sync 2>/dev/null || true

# Generate service files from templates (replace __PROJECT_DIR__ placeholder)
for template in "$DEPLOY_DIR"/*.service "$DEPLOY_DIR"/*.timer; do
  [ -f "$template" ] || continue
  name="$(basename "$template")"
  dest="$SYSTEMD_DIR/$name"
  sed "s|__PROJECT_DIR__|$PROJECT_DIR|g" "$template" > "$dest"
  echo "  Installed $dest"
done

# Reload and enable
systemctl --user daemon-reload
systemctl --user enable \
  codesync-server.service \
  codesync-worker.service \
  codesync-web.service \
  codesync-git-sync.timer 2>/dev/null || true

# Bot is optional (needs TELEGRAM_BOT_TOKEN)
systemctl --user enable codesync-bot.service 2>/dev/null || true

echo ""
echo "Done! Services enabled."
echo "Start:  systemctl --user start codesync-server codesync-worker codesync-web"
echo "Timer:  systemctl --user start codesync-git-sync.timer"
echo "Logs:   journalctl --user -u codesync-server -f"
