# XMaoClock Server

XMaoClock 的公网远程控制平台。

你把这套平台部署到一台有公网 IP 的 Ubuntu 服务器、Windows 电脑、Docker 主机，或者带域名和 HTTPS 的宝塔服务器后，家里的 XMaoClock 设备就能主动向公网平台握手，然后你可以在手机、平板、电脑浏览器里统一管理多个设备。

支持能力：

- 多设备绑定与在线状态查看
- 多设备备注名管理
- 浏览器时间同步
- 远程重启
- 联网后热点广播开关
- 计划闹钟新增、删除、清空、停止活跃闹钟
- RGB 颜色、亮度、预设色、光谱模式
- 开机动画切换
- 128x64 远程画板上传与结束显示
- GPIO `/Start`、`/Open`、`/Close`
- 设备命令历史查看
- 纯 Node.js 单文件后端，无数据库依赖
- Docker Compose 与 GitHub Actions 已内置

## 1. 先看你适合哪种部署方式

| 场景 | 推荐文档 | 适合谁 | 特点 |
| --- | --- | --- | --- |
| Ubuntu 云服务器 | [README-ubuntu.md](./README-ubuntu.md) | 最常见、最稳 | 适合长期在线 |
| Windows 公网电脑 | [README-windows.md](./README-windows.md) | 家里闲置电脑 / Windows VPS | 上手简单 |
| Docker / Docker Compose | [README-docker.md](./README-docker.md) | 喜欢容器化的人 | 迁移方便，升级方便 |
| 已有宝塔面板 + 域名 + HTTPS | [README-baota.md](./README-baota.md) | 已经在用宝塔的人 | 直接当普通 Node 项目部署 |
| 只想看接口 | [API.md](./API.md) | 设备开发 / 二次开发 | 请求与响应说明 |

## 2. 最快跑通流程

1. 先选一种方式把平台部署起来。
2. 浏览器打开后台地址，首次设置管理员密码。
3. 登录后台，添加你的设备串号。
4. 去物理设备本地网页，复制并确认设备串号。
5. 在设备串号下方填写你的公网 IP、域名，或者 HTTPS 域名。
6. 设备主动发起握手。
7. 如果后台已绑定这个串号，设备就会进入在线列表。
8. 之后你在手机外网打开后台页面，就可以直接控制设备。

如果后台没有提前添加这个串号，设备端会提示：

```text
貌似没有正确在公网配置设备，请先在管理后台添加这个串号
```

## 3. 一键部署命令

### Linux 一键部署

在 Ubuntu / Debian / CentOS / AlmaLinux / Rocky Linux 上执行：

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/XMaoCAT/XMaoClock_Server/main/install-ubuntu.sh)"
```

一键脚本会自动：

- 安装 Node.js 20
- 自动识别 `apt` / `dnf` / `yum`
- 下载仓库到 `/opt/XMaoClock_Server`
- 创建并启动 `xmao-remote.service`
- 默认监听 `9230`
- 如果你之前装过，会自动保留 `config.json` 和 `data/store.json`

部署完成后访问：

```text
http://你的服务器公网IP:9230
```

### 宝塔现有环境一键部署

如果你的服务器已经装好了宝塔，不要重装面板，直接执行：

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/XMaoCAT/XMaoClock_Server/main/install-baota.sh)"
```

这个脚本会：

- 不安装、不重装宝塔面板
- 自动安装 Node.js 20
- 把项目部署到 `/www/wwwroot/XMaoClock_Server`
- 创建 `xmao-remote` 服务
- 默认监听 `127.0.0.1:9230`
- 方便你在宝塔里用反向代理接入域名

### Windows 一键部署

以管理员身份打开 PowerShell 后执行：

```powershell
powershell -ExecutionPolicy Bypass -NoProfile -Command "irm https://raw.githubusercontent.com/XMaoCAT/XMaoClock_Server/main/install-windows.ps1 | iex"
```

一键脚本会自动：

- 检测并安装 Node.js LTS
- 下载仓库到 `C:\XMaoClock_Server`
- 创建开机自启任务 `XMaoClock Remote Hub`
- 放行 Windows 防火墙 `9230`
- 如果你之前装过，会自动保留 `config.json` 和 `data\store.json`
- 立即启动服务

部署完成后访问：

```text
http://你的电脑公网IP:9230
```

### Docker Compose 一键启动

```bash
git clone https://github.com/XMaoCAT/XMaoClock_Server.git
cd XMaoClock_Server
cp .env.example .env
nano .env
docker compose up -d --build
```

详细容器化说明见：[README-docker.md](./README-docker.md)

## 4. 设备端应该填写什么地址

按你的部署方式填写：

- 直接暴露 9230 端口：`http://你的公网IP:9230`
- 绑定域名但没配 HTTPS：`http://你的域名:9230` 或 `http://你的域名`
- 做了反向代理并已启用 HTTPS：`https://你的域名`

推荐优先使用：

```text
https://你的域名
```

这样后面更稳，也方便手机外网访问。

## 5. 环境变量与配置项

服务支持以下环境变量覆盖：

| 变量名 | 默认值 | 作用 |
| --- | --- | --- |
| `HOST` | `0.0.0.0` | 服务监听地址 |
| `PORT` | `9230` | 服务监听端口 |
| `DEVICE_POLL_INTERVAL_MS` | `8000` | 设备心跳轮询间隔，允许范围 `5000` 到 `60000` |
| `SESSION_SECRET` | 自动生成 | 后台登录会话密钥，生产环境建议显式设置 |

首次启动后会自动生成：

- `config.json`
- `data/store.json`

其中：

- `config.json` 保存端口、主机、会话密钥等配置
- `data/store.json` 保存管理员密码哈希、设备列表、设备令牌、命令历史

### 如何切换端口

默认端口现在是 `9230`。

如果你想改成别的端口，可以按下面方式改：

- Ubuntu / Linux 手动部署：编辑 `config.json`，把 `"port": 9230` 改成你想要的端口，然后重启服务
- Windows 手动部署：编辑 `config.json`，把 `"port": 9230` 改成你想要的端口，然后重启进程或计划任务
- Docker / Docker Compose：编辑 `.env` 里的 `PORT=9230`，改完后重新执行 `docker compose up -d --build`
- 宝塔 / Nginx / Caddy：如果你把服务改成了别的端口，也要把反向代理目标从 `127.0.0.1:9230` 一起改掉

详细步骤分别写在：

- [README-ubuntu.md](./README-ubuntu.md)
- [README-windows.md](./README-windows.md)
- [README-docker.md](./README-docker.md)
- [README-baota.md](./README-baota.md)

## 6. 远程控制的完整业务流

1. 平台部署成功。
2. 管理员首次打开网页并设置后台密码。
3. 后台添加物理设备串号。
4. 物理设备网页中填写公网地址。
5. 设备请求 `/api/device/handshake`。
6. 平台校验串号是否已绑定。
7. 校验通过后，平台返回 `deviceToken`。
8. 设备保存 `deviceToken` 并定时请求 `/api/device/heartbeat`。
9. 管理员在后台点击按钮发送命令。
10. 平台把命令放进设备的待执行队列。
11. 设备下一次心跳拉取命令并执行。
12. 设备把结果通过 `/api/device/report` 回传。

## 7. 更新、备份、重置

### 更新平台

如果你是用 Git 克隆部署的：

```bash
git pull
```

如果你是 Docker Compose：

```bash
docker compose pull
docker compose up -d --build
```

如果你是 Ubuntu / Windows 一键脚本：

- 可以再次运行一键脚本
- 脚本会保留 `config.json` 与 `data/store.json`

### 备份最重要的两个文件

```text
config.json
data/store.json
```

只要这两个文件还在，你的管理员密码、绑定设备和大部分状态就还在。

### 想彻底重置平台

1. 停止服务。
2. 删除 `config.json`。
3. 删除 `data/store.json`。
4. 重新启动服务。

## 8. 仓库结构

- `server.js`: Node.js 主服务
- `public/`: 管理网页
- `deploy/`: HTTPS / Caddy / Nginx / systemd / Windows 模板
- `install-ubuntu.sh`: Ubuntu 一键部署脚本
- `install-windows.ps1`: Windows 一键部署脚本
- `Dockerfile`: Docker 镜像构建文件
- `docker-compose.yml`: Docker Compose 编排
- `.github/workflows/ci.yml`: GitHub Actions 自动检查
- `API.md`: 详细接口文档
- `README-ubuntu.md`: Ubuntu 手动部署说明
- `README-windows.md`: Windows 手动部署说明
- `README-docker.md`: Docker / Docker Compose 说明
- `README-baota.md`: 宝塔面板详细说明

## 9. 文档导航

- [Ubuntu 手动部署](./README-ubuntu.md)
- [Windows 手动部署](./README-windows.md)
- [Docker / Docker Compose 部署](./README-docker.md)
- [宝塔面板 + 域名 + HTTPS 部署](./README-baota.md)
- [接口文档](./API.md)
- [HTTPS 模板说明](./deploy/README-HTTPS.md)

## 10. 已内置的自动检查

仓库已经带了 GitHub Actions：

- 检查 `server.js` 语法
- 检查 `public/app.js` 语法
- 检查 Ubuntu 一键脚本语法
- 检查 Windows 一键脚本语法
- 检查 `docker-compose.yml`
- 构建 Docker 镜像

如果你把这个仓库推到 GitHub，Actions 会自动运行。

