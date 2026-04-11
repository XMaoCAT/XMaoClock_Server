# XMaoClock Remote Hub 宝塔面板直接部署说明

这份文档默认你的服务器已经装好了宝塔面板。

重点先说清楚：

- XMaoClock Server 是一个普通 Node.js 小项目
- 它可以直接部署进你现有的宝塔环境
- 不需要为了它重装宝塔
- 也不要求服务器必须是“纯净系统”

你刚才看到的“建议在纯净系统安装宝塔”，那是宝塔官方安装面板脚本自己的提示，不是 XMaoClock 项目的要求。

如果你的服务器已经有宝塔，请不要再执行宝塔面板安装脚本，直接部署本项目即可。

## 1. 你现在应该用哪种方式

如果你已经有宝塔，推荐直接用这个命令：

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/XMaoCAT/XMaoClock_Server/main/install-baota.sh)"
```

这个脚本会做的事情只有：

- 检查当前服务器环境
- 自动安装 Node.js 20
- 下载 XMaoClock Server 项目
- 部署到 `/www/wwwroot/XMaoClock_Server`
- 创建并启动 `xmao-remote` 服务
- 让服务监听在 `127.0.0.1:9230`

它不会做这些事：

- 不会安装宝塔面板
- 不会重装宝塔面板
- 不会覆盖你的站点列表
- 不会清空你原来的其他项目

## 2. 一键部署后你还要做什么

部署脚本跑完后，再去宝塔里做 4 步。

### 第一步：添加一个站点

进入：

```text
网站 -> 添加站点
```

建议填写：

- 域名：你的域名，例如 `clock.example.com`
- 根目录：可以填写 `/www/wwwroot/clock.example.com`
- PHP 版本：选“纯静态”
- 数据库：不创建

这里的网站主要用于让宝塔托管域名、Nginx 和证书入口。

### 第二步：配置反向代理

进入：

```text
网站 -> 你的站点 -> 设置 -> 反向代理
```

新增一条代理，推荐填写：

- 代理名称：`xmao-remote`
- 目标 URL：`http://127.0.0.1:9230`
- 发送域名：`$host`

保存后，公网访问你的域名时，就会被宝塔转发到 XMaoClock 服务。

### 第三步：申请 SSL 证书

进入：

```text
网站 -> 你的站点 -> SSL
```

推荐直接申请：

- Let's Encrypt

证书签发成功后，打开“强制 HTTPS”。

### 第四步：浏览器打开后台

现在你就可以访问：

```text
https://你的域名
```

首次打开时：

1. 设置管理员密码
2. 登录后台
3. 添加设备串号
4. 回到实体设备网页填写公网域名

## 3. 如果你想手动部署，而不是一键脚本

### Ubuntu / Debian

```bash
sudo apt update
sudo apt install -y curl ca-certificates git unzip
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

cd /www/wwwroot
sudo git clone https://github.com/XMaoCAT/XMaoClock_Server.git
sudo chown -R $USER:$USER /www/wwwroot/XMaoClock_Server
cd /www/wwwroot/XMaoClock_Server
node server.js
```

### CentOS / AlmaLinux / Rocky Linux

如果系统有 `dnf`：

```bash
sudo dnf install -y curl ca-certificates git unzip
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo dnf install -y nodejs

cd /www/wwwroot
sudo git clone https://github.com/XMaoCAT/XMaoClock_Server.git
sudo chown -R $USER:$USER /www/wwwroot/XMaoClock_Server
cd /www/wwwroot/XMaoClock_Server
node server.js
```

如果系统只有 `yum`：

```bash
sudo yum install -y curl ca-certificates git unzip
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs

cd /www/wwwroot
sudo git clone https://github.com/XMaoCAT/XMaoClock_Server.git
sudo chown -R $USER:$USER /www/wwwroot/XMaoClock_Server
cd /www/wwwroot/XMaoClock_Server
node server.js
```

能打开下面这个地址，就说明服务本体正常：

```text
http://127.0.0.1:9230
```

然后再回宝塔里做站点、反向代理和 SSL。

## 4. systemd 手动注册方式

如果你不想用一键脚本，也可以自己建服务。

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
User=root
WorkingDirectory=/www/wwwroot/XMaoClock_Server
ExecStart=/usr/bin/node /www/wwwroot/XMaoClock_Server/server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

如果你不是 `root` 运行，请把 `User=root` 改成你的实际用户名。

然后执行：

```bash
sudo systemctl daemon-reload
sudo systemctl enable xmao-remote
sudo systemctl start xmao-remote
sudo systemctl status xmao-remote --no-pager
```

## 5. 宝塔里需要注意的端口

项目默认端口是：

```text
9230
```

如果你只通过宝塔反向代理访问，通常不用放行 9230 公网端口，因为外部访问走的是：

- `80`
- `443`

只有你想直接公网访问 `http://IP:9230` 时，才需要开放 9230。

## 6. 设备端应该填写什么

推荐填写：

```text
https://你的域名
```

例如：

```text
https://clock.example.com
```

不要填 `127.0.0.1`，那是服务器本地回环地址，只给宝塔反向代理内部使用。

## 7. 如果你已经部署过旧版本

推荐直接运行无痛更新命令：

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/XMaoCAT/XMaoClock_Server/main/update-baota.sh)"
```

脚本会保留：

- `config.json`
- `data/store.json`

也就是说：

- 后台密码会保留
- 已绑定设备会保留
- 历史数据会保留

## 8. 最后一句最关键

在“已有宝塔”的前提下，XMaoClock 应该被当成一个普通项目部署：

- 宝塔负责域名、Nginx、SSL、入口
- XMaoClock 负责业务服务本体

两者是配合关系，不是“为了 XMaoClock 必须重新装一套宝塔”的关系。
