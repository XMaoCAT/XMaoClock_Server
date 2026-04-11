# XMaoClock Server

XMaoClock 的公网远程控制平台。

这套平台部署到有公网 IP 或已绑定域名的服务器后，就可以让家里的 XMaoClock 主动向云端握手，并在外网统一管理多个设备。

支持能力：

- 多设备绑定与在线状态查看
- 设备备注名管理
- 浏览器时间同步
- 远程重启
- 联网后热点广播开关
- 计划闹钟新增、删除、清空、停止活跃闹钟
- RGB 颜色、亮度、预设色、光谱模式
- 开机动画切换
- 128x64 远程画板上传与结束显示
- GPIO `/Start`、`/Open`、`/Close`

## 一键部署

### Ubuntu 一键部署

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/XMaoCAT/XMaoClock_Server/main/install-ubuntu.sh)"
```

默认会：

- 安装 Node.js 20
- 下载本仓库到 `/opt/XMaoClock_Server`
- 创建并启动 `xmao-remote.service`
- 默认监听 `8080`

部署完成后访问：

```text
http://你的服务器公网IP:8080
```

### Windows 一键部署

以管理员身份打开 PowerShell 后执行：

```powershell
powershell -ExecutionPolicy Bypass -NoProfile -Command "irm https://raw.githubusercontent.com/XMaoCAT/XMaoClock_Server/main/install-windows.ps1 | iex"
```

默认会：

- 检测并安装 Node.js LTS
- 下载本仓库到 `C:\XMaoClock_Server`
- 创建开机自启任务 `XMaoClock Remote Hub`
- 放行 Windows 防火墙 `8080` 端口
- 立即启动服务

部署完成后访问：

```text
http://你的电脑公网IP:8080
```

## 设备接入流程

1. 在服务器上部署本平台
2. 打开管理页面，首次设置后台密码
3. 在后台添加设备串号
4. 到物理设备本地网页复制串号确认一致
5. 在设备串号下方填写公网域名或公网 IP
6. 设备主动向平台握手
7. 握手成功后，后台开始显示在线状态并允许远程控制
8. 如果后台没有添加该串号，设备端会提示：

```text
貌似没有正确在公网配置设备，请先在管理后台添加这个串号
```

## 默认访问地址

- 本机调试：`http://127.0.0.1:8080`
- 外网访问：`http://你的公网IP:8080`
- 绑定域名并反代后：`https://你的域名`

## 仓库结构

- `server.js`: Node.js 主服务，无第三方 npm 依赖
- `public/`: 管理网页
- `deploy/`: HTTPS / 反向代理 / systemd / Windows Caddy 模板
- `install-ubuntu.sh`: Ubuntu 一键部署脚本
- `install-windows.ps1`: Windows 一键部署脚本
- `API.md`: 接口文档
- `README-ubuntu.md`: Ubuntu 手动部署说明
- `README-windows.md`: Windows 手动部署说明

## 运行时文件

- `config.json`: 首次启动自动生成，可修改监听端口
- `data/store.json`: 自动保存后台密码、设备列表、设备令牌、命令历史

如果需要重置平台：

1. 先停止服务
2. 删除 `config.json`
3. 删除 `data/store.json`
4. 重新启动

## HTTPS / 域名

项目内已附带模板：

- `deploy/caddy/Caddyfile`
- `deploy/nginx/xmao-remote.conf`
- `deploy/systemd/xmao-remote.service`
- `deploy/windows/Caddyfile`
- `deploy/windows/start-with-caddy.bat`
- `deploy/README-HTTPS.md`

推荐做法：

1. 先完成一键部署
2. 再把域名解析到服务器公网 IP
3. 用 `Caddy` 或 `Nginx` 反代到 `127.0.0.1:8080`
4. 然后让设备端填写 `https://你的域名`

## 下一步文档

- [Ubuntu 手动部署](./README-ubuntu.md)
- [Windows 手动部署](./README-windows.md)
- [接口文档](./API.md)
- [HTTPS 模板说明](./deploy/README-HTTPS.md)
