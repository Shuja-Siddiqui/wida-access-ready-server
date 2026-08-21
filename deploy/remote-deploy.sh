#!/usr/bin/env bash
set -euo pipefail
APP_DIR="${1:?}"
UNIT="${2:?}"
cd "$APP_DIR"
export NODE_OPTIONS="${NODE_OPTIONS:-} --dns-result-order=ipv4first"
npm ci --legacy-peer-deps
npm run build
sudo systemctl daemon-reload
sudo systemctl restart "$UNIT"
sudo systemctl is-active --quiet "$UNIT"
echo "$UNIT is active"
