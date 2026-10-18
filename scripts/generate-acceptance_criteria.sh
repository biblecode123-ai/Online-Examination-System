#!/usr/bin/env bash
set -euo pipefail
# Save acceptance criteria first so every check is measured against them.
mkdir -p docs artifacts
cat > docs/acceptance-criteria.md <<'MD'
# Acceptance Criteria
MD
echo "Acceptance criteria written to docs/acceptance-criteria.md"