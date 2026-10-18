#!/usr/bin/env bash
set -euo pipefail
mkdir -p docs
cat > docs/assumption-log.md <<'MD'
# Assumption Log
MD
echo "Created docs/assumption-log.md"