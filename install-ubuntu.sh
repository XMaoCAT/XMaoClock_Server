#!/usr/bin/env bash
set -euo pipefail

REPO_ZIP_URL="https://codeload.github.com/XMaoCAT/XMaoClock_Server/zip/refs/heads/main"
INSTALL_DIR="${INSTALL_DIR:-/opt/XMaoClock_Server}"
SERVICE_NAME="xmao-remote"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
SERVICE_USER="${SUDO_USER:-$USER}"

if ! command -v sudo >/dev/null 2>&1 && [ "$(id -u)" -ne 0 ]; then
  echo "未检测到 sudo，请改用 root 运行此脚本。"
  exit 1
fi

SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  SUDO="sudo"
fi

TMP_DIR="$(mktemp -d)"
BACKUP_DIR="$TMP_DIR/backup"
trap 'rm -rf "$TMP_DIR"' EXIT

mkdir -p "$BACKUP_DIR/data"

echo "[1/8] 安装系统依赖..."
$SUDO apt update
$SUDO apt install -y curl ca-certificates unzip git

NEED_NODE_INSTALL="false"
if ! command -v node >/dev/null 2>&1; then
  NEED_NODE_INSTALL="true"
else
  NODE_MAJOR="$(node -v | sed 's/v//' | cut -d. -f1)"
  if [ "${NODE_MAJOR}" -lt 18 ]; then
    NEED_NODE_INSTALL="true"
  fi
fi

if [ "$NEED_NODE_INSTALL" = "true" ]; then
  echo "[2/8] 安装 Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO -E bash -
  $SUDO apt install -y nodejs
else
  echo "[2/8] Node.js 已存在，跳过安装..."
fi

NODE_BIN="$(command -v node)"

echo "[3/8] 下载仓库源码..."
curl -fsSL "$REPO_ZIP_URL" -o "$TMP_DIR/repo.zip"
unzip -q "$TMP_DIR/repo.zip" -d "$TMP_DIR"

echo "[4/8] 备份现有配置和数据..."
if [ -f "$INSTALL_DIR/config.json" ]; then
  $SUDO cp "$INSTALL_DIR/config.json" "$BACKUP_DIR/config.json"
fi
if [ -f "$INSTALL_DIR/data/store.json" ]; then
  $SUDO cp "$INSTALL_DIR/data/store.json" "$BACKUP_DIR/data/store.json"
fi

echo "[5/8] 写入安装目录 $INSTALL_DIR ..."
$SUDO rm -rf "$INSTALL_DIR"
$SUDO mkdir -p "$INSTALL_DIR"
$SUDO cp -r "$TMP_DIR/XMaoClock_Server-main/." "$INSTALL_DIR/"
$SUDO mkdir -p "$INSTALL_DIR/data"
if [ -f "$BACKUP_DIR/config.json" ]; then
  $SUDO cp "$BACKUP_DIR/config.json" "$INSTALL_DIR/config.json"
fi
if [ -f "$BACKUP_DIR/data/store.json" ]; then
  $SUDO cp "$BACKUP_DIR/data/store.json" "$INSTALL_DIR/data/store.json"
fi
$SUDO chown -R "$SERVICE_USER":"$SERVICE_USER" "$INSTALL_DIR"

echo "[6/8] 注册 systemd 服务..."
cat > "$TMP_DIR/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=XMaoClock Remote Hub
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=$INSTALL_DIR
ExecStart=$NODE_BIN $INSTALL_DIR/server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

$SUDO cp "$TMP_DIR/${SERVICE_NAME}.service" "$SERVICE_FILE"
$SUDO systemctl daemon-reload
$SUDO systemctl enable "$SERVICE_NAME"

echo "[7/8] 启动服务..."
$SUDO systemctl restart "$SERVICE_NAME"

echo "[8/8] 完成。"
echo
if [ -f "$BACKUP_DIR/config.json" ] || [ -f "$BACKUP_DIR/data/store.json" ]; then
  echo "已保留原有 config.json 与 data/store.json。"
  echo
fi
echo "服务状态："
$SUDO systemctl --no-pager --full status "$SERVICE_NAME" | sed -n '1,12p'
echo
echo "默认访问地址："
echo "  http://$(hostname -I | awk '{print $1}'):8080"
echo
echo "下一步："
echo "1. 浏览器打开后台，首次设置密码"
echo "2. 添加设备串号"
echo "3. 回到设备本地网页填写公网 IP 或域名"
