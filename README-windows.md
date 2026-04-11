# XMaoClock Remote Hub Windows 部署说明

这份说明适合 Windows 10 / 11 服务器或带公网 IP 的电脑。

## 0. 一键部署

以管理员身份打开 PowerShell，直接执行：

```powershell
powershell -ExecutionPolicy Bypass -NoProfile -Command "irm https://raw.githubusercontent.com/XMaoCAT/XMaoClock_Server/main/install-windows.ps1 | iex"
```

脚本默认会把平台安装到：

```text
C:\XMaoClock_Server
```

下面是手动部署版。

## 1. 安装 Node.js

前往 Node.js 官网安装 18 或更新版本。

安装完成后打开 PowerShell：

```powershell
node -v
```

能看到版本号就说明安装成功。

## 2. 放置平台目录

把整个仓库内容放到固定位置，例如：

`C:\XMaoClock_Server`

## 3. 启动平台

双击：

`start-server.bat`

或者在 PowerShell 里执行：

```powershell
cd C:\XMaoClock_Server
node server.js
```

默认访问地址：

- 本机：`http://127.0.0.1:8080`
- 局域网/公网：`http://你的公网IP:8080`

首次启动会自动创建：

- `config.json`
- `data\store.json`

## 4. 首次后台设置

打开网页后：

1. 先设置后台密码
2. 用这个密码登录
3. 在后台添加设备串号
4. 打开物理设备本地网页
5. 在设备串号下方填入公网 IP 或域名
6. 设备握手成功后，会进入设备列表

## 5. 域名使用方式

如果你已经把域名解析到这台 Windows 服务器：

- 设备端可填写 `http://你的域名:8080`
- 如果你前面有 IIS / Nginx / Caddy 做 443 反代，也可以直接填 `https://你的域名`

项目内已经放好了 Windows 版模板：

- `deploy/windows/Caddyfile`
- `deploy/windows/start-with-caddy.bat`

改好域名后，就可以用 Caddy 把公网 HTTPS 反代到本机的 `8080`。

## 6. 配成开机自动启动

最简单的方式是“任务计划程序”。

### 方法一：登录后自动启动

1. 打开“任务计划程序”
2. 新建任务
3. 触发器选“登录时”
4. 操作选“启动程序”
5. 程序填写：

```text
cmd.exe
```

6. 参数填写：

```text
/c cd /d C:\XMaoClock_Server && node server.js
```

### 方法二：服务器开机即启动

把触发器改成“系统启动时”即可。

## 7. Windows 防火墙

如果平台需要公网访问，请放行端口：

```powershell
netsh advfirewall firewall add rule name="XMaoClock Remote 8080" dir=in action=allow protocol=TCP localport=8080
```

## 8. 常见问题

### 浏览器能打开，本地设备握手失败

通常是下面几种原因：

- 运营商或云服务器安全组没有放行 8080
- Windows 防火墙未放行
- 设备填写了错误的公网 IP 或端口
- 后台没有提前添加该设备串号

### 想彻底重置平台

先关闭运行中的 `node server.js`，然后删除：

- `config.json`
- `data\store.json`

重新启动后会回到首次初始化。

### 我只想让家里设备连接到一个域名

那就把你的域名解析到服务器公网 IP，然后把这个域名填到设备本地网页即可。
