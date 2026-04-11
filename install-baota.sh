#!/usr/bin/env bash
set -euo pipefail

REPO_ZIP_URL="https://codeload.github.com/XMaoCAT/XMaoClock_Server/zip/refs/heads/main"
INSTALL_DIR="${INSTALL_DIR:-/www/wwwroot/XMaoClock_Server}"
SERVICE_NAME="xmao-remote"
SERVICE_FILE="/etc/systemd/system/${SERVICE_NAME}.service"
SERVICE_USER="${SUDO_USER:-$USER}"
PKG_MANAGER=""

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

detect_package_manager() {
  if command -v apt-get >/dev/null 2>&1; then
    PKG_MANAGER="apt"
  elif command -v dnf >/dev/null 2>&1; then
    PKG_MANAGER="dnf"
  elif command -v yum >/dev/null 2>&1; then
    PKG_MANAGER="yum"
  else
    echo "未检测到受支持的包管理器。当前脚本支持 apt / dnf / yum。"
    exit 1
  fi
}

install_system_dependencies() {
  case "$PKG_MANAGER" in
    apt)
      $SUDO apt-get update
      $SUDO apt-get install -y curl ca-certificates unzip git
      ;;
    dnf)
      $SUDO dnf install -y curl ca-certificates unzip git
      ;;
    yum)
      $SUDO yum install -y curl ca-certificates unzip git
      ;;
  esac
}

setup_nodesource_repo() {
  case "$PKG_MANAGER" in
    apt)
      curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO -E bash -
      ;;
    dnf|yum)
      curl -fsSL https://rpm.nodesource.com/setup_20.x | $SUDO bash -
      ;;
  esac
}

install_nodejs() {
  case "$PKG_MANAGER" in
    apt)
      $SUDO apt-get install -y nodejs
      ;;
    dnf)
      $SUDO dnf install -y nodejs
      ;;
    yum)
      $SUDO yum install -y nodejs
      ;;
  esac
}

detect_package_manager

echo "[1/8] 检查已有宝塔环境..."
if [ -d /www/server/panel ]; then
  echo "检测到宝塔面板目录: /www/server/panel"
  echo "本脚本不会安装或重装宝塔，只部署 XMaoClock 服务。"
else
  echo "未检测到典型宝塔目录 /www/server/panel。"
  echo "如果你本机不是宝塔环境，脚本也可以继续部署服务本体。"
fi

echo "[2/8] 安装系统依赖..."
install_system_dependencies

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
  echo "[3/8] 安装 Node.js 20..."
  setup_nodesource_repo
  install_nodejs
else
  echo "[3/8] Node.js 已存在，跳过安装..."
fi

NODE_BIN="$(command -v node)"

echo "[4/8] 下载仓库源码..."
curl -fsSL "$REPO_ZIP_URL" -o "$TMP_DIR/repo.zip"
unzip -q "$TMP_DIR/repo.zip" -d "$TMP_DIR"

echo "[5/8] 备份现有配置和数据..."
if [ -f "$INSTALL_DIR/config.json" ]; then
  $SUDO cp "$INSTALL_DIR/config.json" "$BACKUP_DIR/config.json"
fi
if [ -f "$INSTALL_DIR/data/store.json" ]; then
  $SUDO cp "$INSTALL_DIR/data/store.json" "$BACKUP_DIR/data/store.json"
fi

echo "[6/8] 写入安装目录 $INSTALL_DIR ..."
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

if [ -f "$INSTALL_DIR/config.json" ]; then
  "$NODE_BIN" -e "const fs=require('fs');const file=process.argv[1];const data=JSON.parse(fs.readFileSync(file,'utf8'));if(!('port' in data)||Number(data.port)===8080){data.port=9230;}if(!('host' in data)||String(data.host).trim()===''||data.host==='0.0.0.0'){data.host='127.0.0.1';}fs.writeFileSync(file,JSON.stringify(data,null,2));" "$INSTALL_DIR/config.json"
else
  cat > "$TMP_DIR/config.json" <<EOF
{
  "host": "127.0.0.1",
  "port": 9230
}
EOF
  $SUDO cp "$TMP_DIR/config.json" "$INSTALL_DIR/config.json"
  $SUDO chown "$SERVICE_USER":"$SERVICE_USER" "$INSTALL_DIR/config.json"
fi

echo "[7/8] 注册并启动 systemd 服务..."
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
$SUDO systemctl restart "$SERVICE_NAME"

echo "[8/8] 完成。"
echo
echo "服务状态："
$SUDO systemctl --no-pager --full status "$SERVICE_NAME" | sed -n '1,12p'
echo
echo "当前服务监听："
echo "  http://127.0.0.1:9230"
echo
echo "接下来请在宝塔里做这 4 步："
echo "1. 网站 -> 添加站点 -> 绑定你的域名"
echo "2. 网站 -> 站点设置 -> 反向代理 -> 目标 URL 填 http://127.0.0.1:9230"
echo "3. 网站 -> SSL -> 申请 Let's Encrypt 证书"
echo "4. 外网访问你的域名，首次设置后台密码"
