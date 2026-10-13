#!/usr/bin/env bash
set -euo pipefail
cd /workspace/flowmcp
export npm_config_cache=/workspace/.npm-cache
npm ci
backend=/workspace/shared/flow-backend
expected=06ceeab230da519a7686a12c6c9711eae20ea165
if [ ! -d "$backend" ]; then
  git clone https://github.com/GTAI-1/flow-mcp.git "$backend"
  git -C "$backend" checkout --detach "$expected"
fi
test "$(git -C "$backend" rev-parse HEAD)" = "$expected" || { echo 'Backend version differs; inspect before changing it.' >&2; exit 1; }
npm ci --prefix "$backend"
npm run build --prefix "$backend"
npm test
