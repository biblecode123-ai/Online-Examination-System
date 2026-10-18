#!/usr/bin/env bash
# artifact_first.sh - Generate report.md into artifacts/ with content
mkdir -p artifacts
echo "# Artifact First Report
Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
Status: complete

## Summary
" > artifacts/report.md
chmod +x scripts/generate-artifact_first.sh
echo "artifacts/report.md written."