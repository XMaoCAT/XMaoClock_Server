# XMaoClock Remote Hub Docker / Docker Compose 部署说明

如果你喜欢容器化，或者你未来打算迁移服务器、回滚版本、备份数据，这一套是最省心的。

本项目已经内置：

- `Dockerfile`
- `docker-compose.yml`
- `.env.example`

你只需要准备 Docker 环境即可。

## 1. 容器化部署有什么好处

- 系统更干净，不需要你手动装 Node.js
- 搬迁方便，复制目录就能迁走
- 升级方便，重新构建镜像即可
- 配置清晰，环境变量一眼能看懂
- `data/store.json` 可直接持久化

## 2. 必备文件说明

- `.env.example`: 环境变量示例
- `.env`: 你自己复制并修改后的实际配置
- `docker-compose.yml`: 容器编排
- `data/`: 持久化目录，管理员密码、设备列表、命令历史都在里面

## 3. Ubuntu / Debian Docker 部署

### 第一步：安装 Docker Engine

在 Ubuntu 上执行：

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable docker
sudo systemctl start docker
docker --version
docker compose version
```

### 第二步：下载项目

```bash
cd /opt
sudo git clone https://github.com/XMaoCAT/XMaoClock_Server.git
sudo chown -R $USER:$USER /opt/XMaoClock_Server
cd /opt/XMaoClock_Server
```

### 第三步：准备环境变量

```bash
cp .env.example .env
nano .env
```

建议至少改掉：

```text
SESSION_SECRET=请换成你自己的长随机字符串
```

默认 `.env` 示例：

```env
HOST=0.0.0.0
PORT=9230
DEVICE_POLL_INTERVAL_MS=8000
SESSION_SECRET=please-change-this-to-a-long-random-string
```

### 第四步：启动容器

```bash
docker compose up -d --build
```

### 第五步：查看状态

```bash
docker compose ps
docker compose logs -f
```

### 第六步：访问后台

```text
http://你的公网IP:9230
```

### 第七步：开放防火墙

```bash
sudo ufw allow 9230/tcp
sudo ufw reload
```

## 4. Windows Docker Desktop 部署

### 第一步：安装 Docker Desktop

你可以从 Docker 官网安装 Docker Desktop，安装完成后确认：

```powershell
docker --version
docker compose version
```

### 第二步：下载项目

```powershell
cd C:\
git clone https://github.com/XMaoCAT/XMaoClock_Server.git
cd C:\XMaoClock_Server
```

如果没有 Git，也可以下载 ZIP 并解压到 `C:\XMaoClock_Server`。

### 第三步：准备 `.env`

```powershell
Copy-Item .env.example .env
notepad .env
```

把 `SESSION_SECRET` 改成你自己的随机字符串。

### 第四步：启动 Compose

```powershell
docker compose up -d --build
```

### 第五步：查看状态和日志

```powershell
docker compose ps
docker compose logs -f
```

### 第六步：放行防火墙

```powershell
New-NetFirewallRule -DisplayName 'XMaoClock Remote 9230' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 9230
```

### 第七步：访问后台

```text
http://你的公网IP:9230
```

## 5. 容器里的数据保存在哪里

`docker-compose.yml` 已经把本机目录映射到容器里：

```text
./data -> /app/data
```

所以最重要的数据文件仍然是：

```text
data/store.json
```

这意味着：

- 你删除并重建容器，后台密码和设备列表仍然保留
- 你只要把整个项目目录和 `data/` 备份下来，就能迁移

## 6. 更新平台

如果你已经是 Git 克隆方式：

```bash
git pull
docker compose up -d --build
```

如果你只是下载 ZIP：

1. 备份旧目录中的 `.env` 与 `data/store.json`
2. 替换为新版本文件
3. 再执行：

```bash
docker compose up -d --build
```

## 7. Docker / Compose 如何切换端口

默认端口是 `9230`。如果你要改成别的端口，例如 `9527`，最简单的方式就是改 `.env`。

### 第一步：修改 `.env`

```bash
nano .env
```

把：

```env
PORT=9230
```

改成：

```env
PORT=9527
```

### 第二步：重新构建并启动

```bash
docker compose up -d --build
```

### 第三步：如果有防火墙，放行新端口

Ubuntu:

```bash
sudo ufw allow 9527/tcp
sudo ufw reload
```

Windows:

```powershell
New-NetFirewallRule -DisplayName 'XMaoClock Remote 9527' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 9527
```

### 第四步：设备端地址也要同步

如果你不是通过域名反代，而是让设备直接访问端口，那么设备端地址也要改成：

```text
http://你的公网IP:9527
```

## 8. 常用 Docker 命令

启动：

```bash
docker compose up -d --build
```

停止：

```bash
docker compose down
```

重启：

```bash
docker compose restart
```

查看日志：

```bash
docker compose logs -f
```

查看容器状态：

```bash
docker compose ps
```

重新构建：

```bash
docker compose build --no-cache
docker compose up -d
```

## 9. 域名和 HTTPS

如果你还想把容器版接到域名和 HTTPS：

- 可以用项目里的 Caddy / Nginx 模板
- 也可以配合宝塔面板

更详细的域名说明请看：

- [README-baota.md](./README-baota.md)
- [deploy/README-HTTPS.md](./deploy/README-HTTPS.md)

## 10. 设备端应该填什么

- 临时测试：`http://公网IP:9230`
- 正式环境：`https://你的域名`

## 11. 常见问题

### `docker compose up -d --build` 后网页打不开

先执行：

```bash
docker compose ps
docker compose logs -f
```

然后确认：

1. `PORT` 是否被别的程序占用
2. 防火墙是否放行
3. 云服务器安全组是否放行
4. 浏览器访问的是不是正确公网 IP

### 我改了 `.env`，为什么页面没变化

因为你改的是环境变量，需要重建或重启容器：

```bash
docker compose up -d --build
```

### 我以后迁移服务器要拷什么

至少把下面三个东西带走：

```text
.env
docker-compose.yml
data/store.json
```

