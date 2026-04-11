# XMaoClock Remote Hub Windows 部署说明

这份文档适合 Windows 10 / 11、Windows Server，或者家里一台带公网映射能力的 Windows 电脑。

如果你只想先跑起来，可以直接使用一键部署脚本。下面我把完整命令也都写出来，方便你一步一步照做。

## 1. 开始前需要准备什么

你至少需要：

- 一台 Windows 10 / 11 或 Windows Server
- 这台机器能访问外网
- 你有管理员权限
- 如果要外网直连，需要公网 IP、端口映射，或者把域名解析到这台机器
- 如果你想走 HTTPS，建议配合 Caddy

## 2. 一键部署

以管理员身份打开 PowerShell，然后执行：

```powershell
powershell -ExecutionPolicy Bypass -NoProfile -Command "irm https://raw.githubusercontent.com/XMaoCAT/XMaoClock_Server/main/install-windows.ps1 | iex"
```

脚本会自动：

- 安装 Node.js LTS
- 下载仓库到 `C:\XMaoClock_Server`
- 创建开机自启任务 `XMaoClock Remote Hub`
- 开放 Windows 防火墙 `9230`
- 启动服务
- 保留旧的 `config.json` 与 `data\store.json`

执行完成后访问：

```text
http://你的公网IP:9230
```

## 3. 手动部署全流程

### 第一步：安装 Node.js

#### 方式 A：使用 winget 安装

以管理员身份打开 PowerShell，执行：

```powershell
winget install -e --id OpenJS.NodeJS.LTS
```

安装后关闭 PowerShell 再重新打开，然后验证：

```powershell
node -v
npm -v
```

#### 方式 B：手动下载安装包

也可以去 Node.js 官网下载 LTS 安装包，安装后再运行：

```powershell
node -v
```

## 4. 下载项目到固定目录

### 方式 A：使用 Git

```powershell
cd C:\
git clone https://github.com/XMaoCAT/XMaoClock_Server.git
```

如果你没有 Git，可以去 Git 官网安装，或者直接在 GitHub 页面下载 ZIP。

### 方式 B：手动下载 ZIP

1. 打开仓库页面。
2. 点击 `Code`。
3. 点击 `Download ZIP`。
4. 解压到：

```text
C:\XMaoClock_Server
```

## 5. 测试启动一次

```powershell
cd C:\XMaoClock_Server
node server.js
```

如果终端出现服务启动信息，打开浏览器访问：

```text
http://127.0.0.1:9230
```

如果本机可打开，再继续配置开机自启。

按 `Ctrl + C` 停止前台进程。

## 6. 配成开机自启

### 方式 A：使用 PowerShell 任务计划程序命令

以管理员身份打开 PowerShell，执行：

```powershell
$TaskName = 'XMaoClock Remote Hub'
$InstallDir = 'C:\XMaoClock_Server'
$NodePath = (Get-Command node).Source
$Action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c cd /d `"$InstallDir`" && `"$NodePath`" server.js"
$Trigger = New-ScheduledTaskTrigger -AtStartup
$Principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -RunLevel Highest
Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Principal $Principal -Force
```

### 方式 B：图形界面配置

1. 打开“任务计划程序”。
2. 点击“创建任务”。
3. 名称填：`XMaoClock Remote Hub`。
4. 触发器选“系统启动时”。
5. 操作选“启动程序”。
6. 程序填：

```text
cmd.exe
```

7. 参数填：

```text
/c cd /d C:\XMaoClock_Server && node server.js
```

## 7. 打开防火墙端口

以管理员身份打开 PowerShell：

```powershell
New-NetFirewallRule -DisplayName 'XMaoClock Remote 9230' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 9230
```

查看规则是否存在：

```powershell
Get-NetFirewallRule -DisplayName 'XMaoClock Remote 9230'
```

如果你的机器在路由器后面，还要在路由器里做端口映射。

## 8. 启动、停止、重启常用命令

前台启动：

```powershell
cd C:\XMaoClock_Server
node server.js
```

后台隐藏启动：

```powershell
Start-Process -FilePath (Get-Command node).Source -ArgumentList 'server.js' -WorkingDirectory 'C:\XMaoClock_Server' -WindowStyle Hidden
```

停止现有服务进程：

```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like '*XMaoClock_Server*server.js*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```

## 9. 首次登录后台

浏览器打开：

```text
http://你的公网IP:9230
```

首次使用流程：

1. 设置管理员密码。
2. 登录后台。
3. 添加设备串号。
4. 可选填写备注名。
5. 回到物理设备本地网页。
6. 在设备串号下方填写公网 IP 或域名。
7. 等待握手成功。
8. 设备出现在线状态后，即可远程控制。

## 10. Windows 如何切换监听端口

默认端口是 `9230`。如果你想改成别的端口，例如 `9527`，按下面步骤做。

### 方法一：直接修改 `config.json`

用记事本打开：

```powershell
notepad C:\XMaoClock_Server\config.json
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

保存后，先停止旧进程，再重新启动：

```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like '*XMaoClock_Server*server.js*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

Start-Process -FilePath (Get-Command node).Source -ArgumentList 'server.js' -WorkingDirectory 'C:\XMaoClock_Server' -WindowStyle Hidden
```

### 方法二：直接在命令行里临时换端口

```powershell
cd C:\XMaoClock_Server
$env:PORT = '9527'
node server.js
```

这种方式适合测试，不适合长期作为开机自启方案。

### 改端口后要一起做的事

1. 放行新端口：

```powershell
New-NetFirewallRule -DisplayName 'XMaoClock Remote 9527' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 9527
```

2. 如果你不再使用旧端口，可以删除旧规则：

```powershell
Remove-NetFirewallRule -DisplayName 'XMaoClock Remote 9230' -ErrorAction SilentlyContinue
```

3. 如果你使用 Caddy，把：

```caddyfile
reverse_proxy 127.0.0.1:9230
```

改成：

```caddyfile
reverse_proxy 127.0.0.1:9527
```

4. 如果设备不是走域名 HTTPS，而是直接连端口，那设备端也要改成：

```text
http://你的公网IP:9527
```

## 11. 给域名配 HTTPS

如果你已经把域名解析到这台 Windows 机器，最简单的 HTTPS 方案是 Caddy。

### 第一步：安装 Caddy

如果有 `winget`：

```powershell
winget install -e --id CaddyServer.Caddy
```

### 第二步：编辑 Caddyfile

```powershell
notepad C:\XMaoClock_Server\deploy\windows\Caddyfile
```

把示例域名改成你的真实域名，例如：

```caddyfile
clock.example.com {
    reverse_proxy 127.0.0.1:9230
}
```

### 第三步：启动 Caddy

如果 `caddy.exe` 已在 PATH 中：

```powershell
cd C:\XMaoClock_Server
caddy run --config .\deploy\windows\Caddyfile
```

或者直接双击：

```text
C:\XMaoClock_Server\deploy\windows\start-with-caddy.bat
```

### 第四步：访问和设备填写

浏览器访问：

```text
https://你的域名
```

设备端也建议填写：

```text
https://你的域名
```

## 12. 更新平台

### 如果你是 Git 克隆的

```powershell
cd C:\XMaoClock_Server
git pull
```

拉取后重启 Node 进程。

### 如果你是再次执行一键脚本

```powershell
powershell -ExecutionPolicy Bypass -NoProfile -Command "irm https://raw.githubusercontent.com/XMaoCAT/XMaoClock_Server/main/install-windows.ps1 | iex"
```

脚本会保留旧的 `config.json` 与 `data\store.json`。

## 13. 备份与重置

### 备份

```powershell
Copy-Item C:\XMaoClock_Server\config.json C:\XMaoClock_Server\config.backup.json -Force
Copy-Item C:\XMaoClock_Server\data\store.json C:\XMaoClock_Server\data\store.backup.json -Force
```

### 重置

先停止服务进程，然后删除：

```powershell
Remove-Item C:\XMaoClock_Server\config.json -Force -ErrorAction SilentlyContinue
Remove-Item C:\XMaoClock_Server\data\store.json -Force -ErrorAction SilentlyContinue
```

再重新启动 `node server.js`。

## 14. 常见问题

### 本机能打开，外网打不开

优先检查：

1. Windows 防火墙是否已放行 9230
2. 路由器是否做了端口映射
3. 运营商是否屏蔽了家庭宽带入站端口
4. 机器是否真的有公网可访问地址

### 设备提示串号没有在公网平台配置

说明你还没有在后台添加这个设备串号。请先在管理页里添加，再回到设备端重新保存一次公网地址。

### 想不带端口号访问

请使用上面的 Caddy 域名反向代理方案。

