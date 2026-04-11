# XMaoClock Remote Hub Ubuntu 部署说明

这份文档按“从 0 开始能照着做”的方式写，适用于 Ubuntu 22.04 / 24.04。

如果你只想最快跑通，可以直接看根目录 [README.md](./README.md) 的一键部署。这里是完整手动版。

## 1. 开始前你需要准备什么

你至少需要：

- 一台 Ubuntu 22.04 或 24.04 服务器
- 服务器可以连接外网
- 你能通过 SSH 登录这台服务器
- 如果你打算用域名，还需要一个已经买好的域名
- 如果你打算让手机外网访问，建议服务器有公网 IP

建议提前确认：

```bash
uname -a
lsb_release -a
ip addr
```

## 2. 最快一键部署

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/XMaoCAT/XMaoClock_Server/main/install-ubuntu.sh)"
```

脚本会自动：

- 安装 Node.js 20
- 下载本仓库到 `/opt/XMaoClock_Server`
- 创建 `xmao-remote.service`
- 自动启动服务
- 保留旧的 `config.json` 和 `data/store.json`

执行完后，先试着访问：

```text
http://你的公网IP:9230
```

## 3. 手动部署全流程

### 第一步：连接服务器

在你自己的电脑终端执行：

```bash
ssh 用户名@你的服务器公网IP
```

示例：

```bash
ssh root@123.123.123.123
```

### 第二步：更新系统并安装基础工具

登录服务器后执行：

```bash
sudo apt update
sudo apt install -y curl ca-certificates git unzip ufw
```

### 第三步：安装 Node.js 20

依次执行：

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

如果 `node -v` 能看到 `v20.x.x`，说明环境正常。

### 第四步：下载项目

有两种常见方式。

#### 方式 A：用 Git 克隆

```bash
cd /opt
sudo git clone https://github.com/XMaoCAT/XMaoClock_Server.git
sudo chown -R $USER:$USER /opt/XMaoClock_Server
cd /opt/XMaoClock_Server
```

#### 方式 B：手动上传 ZIP 后解压

如果你是从本地把项目传到服务器，也可以：

```bash
sudo mkdir -p /opt/XMaoClock_Server
sudo chown -R $USER:$USER /opt/XMaoClock_Server
cd /opt/XMaoClock_Server
```

然后用 `scp`、WinSCP、FinalShell 等工具把仓库文件上传到这里。

### 第五步：启动服务测试一次

```bash
cd /opt/XMaoClock_Server
node server.js
```

看到类似输出即可：

```text
[RemotePlatform] XMaoClock remote control platform started
[RemotePlatform] Open http://127.0.0.1:9230 on this server to complete setup
[RemotePlatform] Listening on 0.0.0.0:9230
```

这时先不要关闭 SSH 窗口，另外打开浏览器访问：

```text
http://你的服务器公网IP:9230
```

如果网页能打开，说明程序正常。

按 `Ctrl + C` 停掉前台进程，然后继续做开机自启。

## 4. 配成 systemd 开机自启

### 第一步：创建服务文件

```bash
sudo nano /etc/systemd/system/xmao-remote.service
```

把下面内容完整粘进去：

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

你只需要根据自己的环境改两处：

- `User=ubuntu` 改成你的实际用户名
- `/opt/XMaoClock_Server` 如果你不是装这里，也一起改掉

### 第二步：加载并启动服务

```bash
sudo systemctl daemon-reload
sudo systemctl enable xmao-remote
sudo systemctl start xmao-remote
sudo systemctl status xmao-remote --no-pager
```

### 第三步：以后常用的服务命令

启动：

```bash
sudo systemctl start xmao-remote
```

停止：

```bash
sudo systemctl stop xmao-remote
```

重启：

```bash
sudo systemctl restart xmao-remote
```

查看状态：

```bash
sudo systemctl status xmao-remote --no-pager
```

查看实时日志：

```bash
sudo journalctl -u xmao-remote -f
```

## 5. 打开防火墙端口

### 如果你直接暴露 9230

```bash
sudo ufw allow 9230/tcp
sudo ufw reload
sudo ufw status
```

### 如果你后面还要配域名和 HTTPS

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw reload
sudo ufw status
```

如果你用的是云服务器，还要去云厂商控制台的安全组里放行相同端口。

## 6. 首次登录后台

浏览器访问：

```text
http://你的公网IP:9230
```

第一次打开时，按下面顺序做：

1. 设置管理员密码。
2. 用这个密码登录。
3. 点击添加设备。
4. 输入物理设备串号。
5. 可选填写备注名，例如“卧室时钟”。
6. 保存后，回到物理设备本地网页。
7. 在设备串号下方输入服务器公网 IP 或域名。
8. 设备握手成功后，后台就能显示在线状态。

## 7. Ubuntu 如何切换监听端口

默认端口是 `9230`。如果你想改成例如 `9527`、`9000`、`12345`，按下面步骤做。

### 方法一：直接修改 `config.json`

编辑配置文件：

```bash
sudo nano /opt/XMaoClock_Server/config.json
```

把里面的：

```json
{
  "host": "0.0.0.0",
  "port": 9230
}
```

改成你想要的端口，例如：

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

### 方法二：临时使用环境变量覆盖

如果你只是临时测试，也可以直接前台运行：

```bash
cd /opt/XMaoClock_Server
PORT=9527 node server.js
```

但这种方式只适合测试，长期运行还是推荐改 `config.json`。

### 改端口后别忘了同步这几处

1. 放行新的防火墙端口：

```bash
sudo ufw allow 9527/tcp
sudo ufw reload
```

2. 如果你在用 Nginx 反代，把：

```nginx
proxy_pass http://127.0.0.1:9230;
```

改成：

```nginx
proxy_pass http://127.0.0.1:9527;
```

3. 如果你在用 Caddy，把：

```caddyfile
reverse_proxy 127.0.0.1:9230
```

改成：

```caddyfile
reverse_proxy 127.0.0.1:9527
```

4. 如果你不是用域名反代，而是让设备直连端口，那设备端也要改成新的地址，例如：

```text
http://你的公网IP:9527
```

## 8. 域名和 HTTPS

如果你已经有域名，比如：

```text
clock.example.com
```

先去域名服务商后台添加解析：

```text
A 记录：clock.example.com -> 你的服务器公网IP
```

等解析生效后，你有两种主流方式：

- 方式 A：Nginx 反向代理
- 方式 B：Caddy 自动 HTTPS

### 方式 A：Nginx 反向代理

安装 Nginx：

```bash
sudo apt install -y nginx
```

创建站点配置：

```bash
sudo nano /etc/nginx/sites-available/xmao-remote.conf
```

写入：

```nginx
server {
    listen 80;
    server_name clock.example.com;

    client_max_body_size 4m;

    location / {
        proxy_pass http://127.0.0.1:9230;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 90s;
    }
}
```

启用配置：

```bash
sudo ln -s /etc/nginx/sites-available/xmao-remote.conf /etc/nginx/sites-enabled/xmao-remote.conf
sudo nginx -t
sudo systemctl reload nginx
```

之后访问：

```text
http://clock.example.com
```

### 方式 B：Caddy 自动签发 HTTPS

安装 Caddy：

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

编辑 Caddy 配置：

```bash
sudo nano /etc/caddy/Caddyfile
```

写入：

```caddyfile
clock.example.com {
    reverse_proxy 127.0.0.1:9230
}
```

重载 Caddy：

```bash
sudo systemctl reload caddy
sudo systemctl status caddy --no-pager
```

成功后访问：

```text
https://clock.example.com
```

设备端也建议填写：

```text
https://clock.example.com
```

## 9. 推荐给设备填写的地址

推荐顺序如下：

1. 最好：`https://你的域名`
2. 次优：`http://你的域名`
3. 临时测试：`http://你的公网IP:9230`

## 10. 升级平台

### 如果你是 Git 部署

```bash
cd /opt/XMaoClock_Server
git pull
sudo systemctl restart xmao-remote
```

### 推荐：无痛更新命令

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/XMaoCAT/XMaoClock_Server/main/update-linux.sh)"
```

这个命令会自动拉取最新网页与服务端代码，并保留旧的 `config.json` 与 `data/store.json`。

## 11. 备份与重置

### 备份

建议至少备份这两个文件：

```bash
cp /opt/XMaoClock_Server/config.json ~/xmao-config-backup.json
cp /opt/XMaoClock_Server/data/store.json ~/xmao-store-backup.json
```

### 重置整个平台

```bash
sudo systemctl stop xmao-remote
rm -f /opt/XMaoClock_Server/config.json
rm -f /opt/XMaoClock_Server/data/store.json
sudo systemctl start xmao-remote
```

## 12. 常见问题

### 浏览器打不开 `http://公网IP:9230`

依次检查：

1. `sudo systemctl status xmao-remote --no-pager`
2. `sudo ufw status`
3. 云服务器安全组是否放行 9230
4. `curl http://127.0.0.1:9230/api/bootstrap`

### 本地浏览器能打开，但设备握手失败

优先检查：

1. 后台是否已经添加该串号
2. 设备填写的是不是正确的公网地址
3. 如果用了域名，域名是否解析到了正确公网 IP
4. 如果用了 HTTPS，证书是否已正常签发

### 想只通过域名访问，不带 `:9230`

请使用上面的 Nginx 或 Caddy 反向代理方案。

