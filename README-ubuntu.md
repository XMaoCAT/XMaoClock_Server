# XMaoClock Remote Hub Ubuntu 部署说明

这份说明按“新手可直接照做”的方式写，适合 Ubuntu 22.04 / 24.04。

## 0. 一键部署

如果你不想手动操作，直接执行：

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/XMaoCAT/XMaoClock_Server/main/install-ubuntu.sh)"
```

脚本默认会把平台安装到：

```text
/opt/XMaoClock_Server
```

下面是手动部署版。

## 1. 准备环境

先安装 Node.js 18+：

```bash
sudo apt update
sudo apt install -y curl
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v
```

如果 `node -v` 能看到版本号，说明环境正常。

## 2. 放置平台目录

把整个仓库内容上传到服务器，例如：

```bash
sudo mkdir -p /opt/XMaoClock_Server
sudo chown -R $USER:$USER /opt/XMaoClock_Server
cd /opt/XMaoClock_Server
```

然后把本仓库文件放进去。

## 3. 启动平台

```bash
cd /opt/XMaoClock_Server
bash ./start-server.sh
```

默认监听：

- 地址：`0.0.0.0`
- 端口：`8080`

浏览器访问：

- `http://你的服务器公网IP:8080`

第一次启动后会自动生成：

- `config.json`
- `data/store.json`

## 4. 首次初始化后台

打开管理页后：

1. 设置后台密码
2. 登录后台
3. 添加设备串号
4. 回到物理设备本地网页
5. 在设备串号下方填写你的公网域名或公网 IP
6. 设备完成握手后，就会出现在后台在线列表里

如果后台没有提前添加这个串号，设备端会提示：

`貌似没有正确在公网配置设备，请先在管理后台添加这个串号`

## 5. 绑定域名

如果你已经有域名，推荐把域名解析到这台服务器公网 IP。

例如：

- `clock.example.com -> 你的公网IP`

设备端可以直接填写：

- `http://clock.example.com:8080`
- 或者你反代后填写 `https://clock.example.com`

## 6. 反向代理到 80/443（推荐）

如果你希望用户直接访问域名，不带端口，推荐用 Nginx 反向代理。

项目里已经给你放好了模板：

- `deploy/nginx/xmao-remote.conf`
- `deploy/caddy/Caddyfile`
- `deploy/systemd/xmao-remote.service`

### Nginx 示例

```nginx
server {
    listen 80;
    server_name clock.example.com;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

如果你配置了 HTTPS，设备端建议填写完整的 `https://域名`。

如果你更想省事，可以直接使用项目内的 `deploy/caddy/Caddyfile`，把域名改掉后让 Caddy 反代到 `127.0.0.1:8080`。

## 7. 配成开机自启

创建 systemd 服务：

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

把 `User` 和路径改成你的实际用户名与目录。

启用服务：

```bash
sudo systemctl daemon-reload
sudo systemctl enable xmao-remote
sudo systemctl start xmao-remote
sudo systemctl status xmao-remote
```

## 8. 防火墙放行

如果你直接开放 8080：

```bash
sudo ufw allow 8080/tcp
```

如果你走 Nginx：

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
```

## 9. 常见问题

### 设备端提示无法连接公网服务器

检查：

- 服务器端口是否开放
- 域名是否解析正确
- 设备填写的是不是完整地址
- 服务器服务是否真的在运行

### 设备端提示串号未正确配置

说明后台里还没有添加这个设备串号。

先登录后台，添加设备串号，再让设备重新保存一次公网地址即可。

### 想重置整个平台

停止服务后删除：

- `config.json`
- `data/store.json`

再重新启动，就会回到首次初始化状态。
