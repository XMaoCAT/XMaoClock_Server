#!/usr/bin/env bash
set -euo pipefail

echo "[XMaoClock] 开始无痛更新 Linux 部署..."
bash -c "$(curl -fsSL https://raw.githubusercontent.com/XMaoCAT/XMaoClock_Server/main/install-ubuntu.sh)"
