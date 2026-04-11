# XMaoClock Remote Hub 宝塔面板部署说明

这份文档专门写给想用宝塔面板做域名、网站、HTTPS、反向代理的人。

最适合的理解方式是：

- `XMaoClock Server` 本身是一个 Node.js 服务，实际监听 `127.0.0.1:9230` 或 `0.0.0.0:9230`
- 宝塔面板负责帮你做域名绑定、反向代理、SSL 证书、图形化管理
- 物理设备最后填写的是你的公网域名，例如 `https://clock.example.com`

也就是说，宝塔在这里主要负责“入口层”和“证书层”，业务服务本体还是我们这个 Node.js 平台。

## 1. 准备开始之前

你至少需要：

- 一台 Ubuntu 22.04 / 24.04 服务器
- 服务器有公网 IP
- 一个已经购买好的域名
- 域名管理后台可以添加 A 记录
- 你能通过 SSH 登录服务器

建议先准备好这些信息：

- 服务器公网 IP
- 宝塔面板准备使用的端口
- 你的二级域名，例如 `clock.example.com`

## 2. 宝塔面板官方安装脚本

根据宝塔官方文档，Ubuntu / Debian 常用安装命令如下：

```bash
if [ -f /usr/bin/curl ];then curl -sSO https://download.bt.cn/install/install_panel.sh;else wget -O install_panel.sh https://download.bt.cn/install/install_panel.sh;fi
bash install_panel.sh ed8484bec
```

安装完成后，终端会输出：

- 面板访问地址
- 用户名
- 密码

请立刻把这些信息保存好。

注意：如果你的服务器有云防火墙或安全组，至少要先放行：

```text
22
80
443
8888
```

如果你后续要临时直连测试 9230，也请额外放行：

```text
9230
```

## 3. 第一次进入宝塔面板要做什么

打开安装完成后显示的面板地址，例如：

```text
http://你的服务器IP:8888/xxxxx
```

首次登录建议做这几件事：

1. 修改宝塔登录密码。
2. 绑定宝塔账号可以选做，不是必须。
3. 在“软件商店”里安装 `Nginx`。
4. 如果你只部署 XMaoClock Server，不需要安装 MySQL、PHP、Redis。

只装 `Nginx` 就够了。

## 4. 先在服务器里把 XMaoClock 平台跑起来

宝塔只负责入口层，所以我们要先通过 SSH 把 Node 服务启动好。

### 第一步：安装 Node.js 20

SSH 登录服务器后执行：

```bash
sudo apt update
sudo apt install -y curl ca-certificates git unzip
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
```

### 第二步：下载项目

```bash
cd /opt
sudo git clone https://github.com/XMaoCAT/XMaoClock_Server.git
sudo chown -R $USER:$USER /opt/XMaoClock_Server
cd /opt/XMaoClock_Server
```

### 第三步：先运行测试一次

```bash
cd /opt/XMaoClock_Server
node server.js
```

然后浏览器直接访问：

```text
http://你的公网IP:9230
```

如果网页能打开，说明服务正常。

按 `Ctrl + C` 停掉前台进程。

### 第四步：写成 systemd 服务

```bash
sudo nano /etc/systemd/system/xmao-remote.service
```

写入：

```ini
[Unit]
Description=XMaoClock Remote Hub
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/opt/XMaoClock_Server
ExecStart=/usr/bin/node /opt/XMaoClock_Server/server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

把 `User=ubuntu` 改成你的实际用户名。

启动并设置开机自启：

```bash
sudo systemctl daemon-reload
sudo systemctl enable xmao-remote
sudo systemctl start xmao-remote
sudo systemctl status xmao-remote --no-pager
```

## 5. 在宝塔里创建网站

现在开始做图形化配置。

### 第一步：添加网站

在宝塔左侧进入：

```text
网站 -> 添加站点
```

填写建议：

- 域名：`clock.example.com`
- 根目录：随便填一个存在的目录，例如 `/www/wwwroot/clock.example.com`
- PHP 版本：选择“纯静态”即可
- 数据库：不要创建

因为真正返回页面的是我们的 Node 服务，这个站点主要是为了给 Nginx 和 SSL 托管入口。

### 第二步：确认域名已解析

去你的域名服务商后台添加：

```text
A 记录：clock.example.com -> 你的服务器公网IP
```

等域名生效后，再继续下面步骤。

## 6. 在宝塔里配置反向代理

进入：

```text
网站 -> 你的站点 -> 设置 -> 反向代理
```

新增一条反向代理，建议这样填：

- 代理名称：`xmao-remote`
- 目标 URL：`http://127.0.0.1:9230`
- 发送域名：`$host`

保存后，宝塔会帮你把公网访问转发给本机的 Node 服务。

如果你不放心，可以打开该站点的 Nginx 配置，确认里面存在类似：

```nginx
location / {
    proxy_pass http://127.0.0.1:9230;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

## 7. 在宝塔里申请 SSL 证书

进入：

```text
网站 -> 你的站点 -> 设置 -> SSL
```

推荐选择：

- `Let's Encrypt`

然后：

1. 勾选你的域名
2. 点击申请
3. 申请成功后打开“强制 HTTPS”

这样以后浏览器访问和设备端填写的地址都可以直接用：

```text
https://clock.example.com
```

## 8. 宝塔防火墙和云安全组怎么开

### 宝塔面板里的系统防火墙

进入：

```text
安全
```

确认至少放行：

- `80`
- `443`
- `22`
- `8888`

### 云厂商安全组

如果你是阿里云、腾讯云、华为云、AWS、Vultr、DigitalOcean 等服务器，也要同时在安全组里放行：

- `80/tcp`
- `443/tcp`
- `22/tcp`
- `8888/tcp`
- 如果临时调试直连，还可放 `9230/tcp`

## 9. 后台和物理设备如何配合

完成以上步骤后，按下面顺序：

1. 浏览器访问 `https://你的域名`
2. 首次设置后台密码
3. 登录后台
4. 添加设备串号
5. 回到物理设备本地网页
6. 在设备串号下方填写：`https://你的域名`
7. 点击保存
8. 设备成功握手后，后台就会显示该设备在线状态
9. 以后你在手机外网打开 `https://你的域名` 登录后台，就能控制设备

## 10. 宝塔环境如何切换后台监听端口

如果你要把后台服务从默认的 `9230` 改成别的端口，例如 `9527`，要同时改服务配置和反向代理目标。

### 第一步：修改服务配置

SSH 登录服务器后执行：

```bash
sudo nano /opt/XMaoClock_Server/config.json
```

把：

```json
{
  "host": "0.0.0.0",
  "port": 9230
}
```

改成：

```json
{
  "host": "0.0.0.0",
  "port": 9527
}
```

保存后重启服务：

```bash
sudo systemctl restart xmao-remote
sudo systemctl status xmao-remote --no-pager
```

### 第二步：修改宝塔反向代理目标

进入：

```text
网站 -> 你的站点 -> 设置 -> 反向代理
```

把目标 URL 从：

```text
http://127.0.0.1:9230
```

改成：

```text
http://127.0.0.1:9527
```

### 第三步：如果你直连端口调试，也要放行新端口

```bash
sudo ufw allow 9527/tcp
sudo ufw reload
```

### 第四步：如果设备不是通过域名访问，而是直连端口

那设备端也要改成：

```text
http://你的公网IP:9527
```

## 11. 宝塔环境下如何更新项目

SSH 登录服务器后执行：

```bash
cd /opt/XMaoClock_Server
git pull
sudo systemctl restart xmao-remote
sudo systemctl status xmao-remote --no-pager
```

如果你是重新执行一键安装脚本：

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/XMaoCAT/XMaoClock_Server/main/install-ubuntu.sh)"
```

脚本会保留 `config.json` 与 `data/store.json`。

## 12. 常见问题

### 宝塔里网站能打开，但页面显示 502 / 504

先检查 Node 服务是否真的在运行：

```bash
sudo systemctl status xmao-remote --no-pager
sudo journalctl -u xmao-remote -f
```

### 域名能打开后台，但设备握手失败

优先检查：

1. 后台有没有添加这个设备串号
2. 设备填的是不是完整的 `https://域名`
3. SSL 证书是否正常签发
4. 域名是否真的解析到了这台服务器

### 设备说“貌似没有正确在公网配置设备”

这不是域名问题，而是后台还没有绑定该设备串号。

### 我能不能不装宝塔，只装平台

可以。那就直接看：

- [README-ubuntu.md](./README-ubuntu.md)
- [README-docker.md](./README-docker.md)

## 13. 官方参考页面

为了和宝塔当前界面保持一致，你也可以对照官方文档：

- 安装宝塔面板：`https://docs.bt.cn/10.0/getting-started/quick-installation-of-bt-panel`
- 创建站点：`https://docs.bt.cn/getting-started/create-web`

