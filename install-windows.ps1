$ErrorActionPreference = 'Stop'

$RepoZipUrl = 'https://codeload.github.com/XMaoCAT/XMaoClock_Server/zip/refs/heads/main'
$InstallDir = 'C:\XMaoClock_Server'
$TaskName = 'XMaoClock Remote Hub'

function Assert-Admin {
    $currentUser = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
    if (-not $currentUser.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw '请以管理员身份打开 PowerShell 后再执行此脚本。'
    }
}

function Ensure-Node {
    if (Get-Command node -ErrorAction SilentlyContinue) {
        return
    }

    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        throw '未检测到 Node.js，且系统没有 winget，无法自动安装。请先手动安装 Node.js LTS。'
    }

    Write-Host '[1/8] 正在安装 Node.js LTS ...'
    winget install --accept-package-agreements --accept-source-agreements -e --id OpenJS.NodeJS.LTS | Out-Host

    $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path', 'User')

    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        throw 'Node.js 安装完成后仍未检测到 node 命令，请重新打开 PowerShell 再执行一次脚本。'
    }
}

Assert-Admin
Ensure-Node

$TempRoot = Join-Path $env:TEMP ('XMaoClock_Server_' + [guid]::NewGuid().ToString('N'))
$ZipFile = Join-Path $TempRoot 'repo.zip'
$ExtractDir = Join-Path $TempRoot 'repo'
$BackupDir = Join-Path $TempRoot 'backup'

Write-Host '[2/8] 下载仓库源码 ...'
New-Item -ItemType Directory -Path $TempRoot -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $BackupDir 'data') -Force | Out-Null
Invoke-WebRequest -Uri $RepoZipUrl -OutFile $ZipFile

Write-Host '[3/8] 解压源码 ...'
Expand-Archive -LiteralPath $ZipFile -DestinationPath $ExtractDir -Force
$SourceDir = Get-ChildItem -Directory $ExtractDir | Select-Object -First 1
if (-not $SourceDir) {
    throw '源码解压失败，未找到目录。'
}

Write-Host '[4/8] 备份现有配置和数据 ...'
if (Test-Path (Join-Path $InstallDir 'config.json')) {
    Copy-Item -Path (Join-Path $InstallDir 'config.json') -Destination (Join-Path $BackupDir 'config.json') -Force
}
if (Test-Path (Join-Path $InstallDir 'data\store.json')) {
    Copy-Item -Path (Join-Path $InstallDir 'data\store.json') -Destination (Join-Path $BackupDir 'data\store.json') -Force
}

Write-Host "[5/8] 写入安装目录 $InstallDir ..."
if (Test-Path $InstallDir) {
    Remove-Item $InstallDir -Recurse -Force
}
New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
Copy-Item -Path (Join-Path $SourceDir.FullName '*') -Destination $InstallDir -Recurse -Force
New-Item -ItemType Directory -Path (Join-Path $InstallDir 'data') -Force | Out-Null
if (Test-Path (Join-Path $BackupDir 'config.json')) {
    Copy-Item -Path (Join-Path $BackupDir 'config.json') -Destination (Join-Path $InstallDir 'config.json') -Force
}
if (Test-Path (Join-Path $BackupDir 'data\store.json')) {
    Copy-Item -Path (Join-Path $BackupDir 'data\store.json') -Destination (Join-Path $InstallDir 'data\store.json') -Force
}

$NodePath = (Get-Command node).Source

$ConfigPath = Join-Path $InstallDir 'config.json'
if (Test-Path $ConfigPath) {
    $Config = Get-Content $ConfigPath -Raw | ConvertFrom-Json
    if (-not $Config.port -or [int]$Config.port -eq 8080) {
        $Config.port = 9230
        $Config | ConvertTo-Json -Depth 10 | Set-Content -Path $ConfigPath -Encoding utf8
    }
}

Write-Host '[6/8] 注册开机自启任务 ...'
try {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
} catch {}

$Action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c cd /d `"$InstallDir`" && `"$NodePath`" server.js"
$Trigger = New-ScheduledTaskTrigger -AtStartup
$Principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -RunLevel Highest
Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Principal $Principal -Force | Out-Null

Write-Host '[7/8] 放行防火墙 9230 端口 ...'
if (Get-NetFirewallRule -DisplayName 'XMaoClock Remote 8080' -ErrorAction SilentlyContinue) {
    Remove-NetFirewallRule -DisplayName 'XMaoClock Remote 8080' | Out-Null
}
if (-not (Get-NetFirewallRule -DisplayName 'XMaoClock Remote 9230' -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName 'XMaoClock Remote 9230' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 9230 | Out-Null
}

Write-Host '[8/8] 启动服务进程 ...'
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -like '*XMaoClock_Server*server.js*' } |
    ForEach-Object {
        try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch {}
    }

Start-Process -FilePath $NodePath -ArgumentList 'server.js' -WorkingDirectory $InstallDir -WindowStyle Hidden

$PreservedConfig = Test-Path (Join-Path $BackupDir 'config.json')
$PreservedStore = Test-Path (Join-Path $BackupDir 'data\store.json')

Remove-Item $TempRoot -Recurse -Force

Write-Host ''
Write-Host '部署完成。'
if ($PreservedConfig -or $PreservedStore) {
    Write-Host '已保留原有 config.json 与 data\store.json。'
}
Write-Host "安装目录：$InstallDir"
Write-Host '默认访问地址：'
Write-Host '  http://127.0.0.1:9230'
Write-Host '  http://你的公网IP:9230'
Write-Host ''
Write-Host '下一步：'
Write-Host '1. 浏览器打开后台，首次设置密码'
Write-Host '2. 添加设备串号'
Write-Host '3. 回到设备本地网页填写公网 IP 或域名'

