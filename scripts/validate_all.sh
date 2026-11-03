#!/usr/bin/env bash
# Validate all Apigee proxy bundles in apigee-ide-gateways with validate_bundle.py --strict
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VALIDATOR="${APIGEE_VALIDATOR:-${REPO_ROOT}/../apigee-skills/skills/apigee-proxy-builder/scripts/validate_bundle.py}"

for PROXY_DIR in "${REPO_ROOT}"/proxies/*; do
  if [[ -d "${PROXY_DIR}/apiproxy" ]]; then
    NAME="$(basename "${PROXY_DIR}")"
    echo "=== Validating ${NAME} ==="
    python3 "${VALIDATOR}" "${PROXY_DIR}" --strict
  fi
done
