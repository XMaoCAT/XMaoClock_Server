#!/usr/bin/env bash
set -euo pipefail

echo "[XMaoClock] 开始无痛更新宝塔环境部署..."
bash -c "$(curl -fsSL https://raw.githubusercontent.com/XMaoCAT/XMaoClock_Server/main/install-baota.sh)"
