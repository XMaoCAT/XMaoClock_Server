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

    Write-Host '[1/7] 正在安装 Node.js LTS ...'
    winget install --accept-package-agreements --accept-source-agreements -e --id OpenJS.NodeJS.LTS | Out-Host

    $env:Path = [System.Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path', 'User')

    if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
        throw 'Node.js 安装完成后仍未检测到 node 命令，请重新打开 PowerShell 再执行一次脚本。'
    }
}

Assert-Admin
Ensure-Node

$TempRoot = Join-Path $env:TEMP ("XMaoClock_Server_" + [guid]::NewGuid().ToString('N'))
$ZipFile = Join-Path $TempRoot 'repo.zip'
$ExtractDir = Join-Path $TempRoot 'repo'

Write-Host '[2/7] 下载仓库源码 ...'
New-Item -ItemType Directory -Path $TempRoot -Force | Out-Null
Invoke-WebRequest -Uri $RepoZipUrl -OutFile $ZipFile

Write-Host '[3/7] 解压源码 ...'
Expand-Archive -LiteralPath $ZipFile -DestinationPath $ExtractDir -Force
$SourceDir = Get-ChildItem -Directory $ExtractDir | Select-Object -First 1
if (-not $SourceDir) {
    throw '源码解压失败，未找到目录。'
}

Write-Host "[4/7] 写入安装目录 $InstallDir ..."
if (Test-Path $InstallDir) {
    Remove-Item $InstallDir -Recurse -Force
}
New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
Copy-Item -Path (Join-Path $SourceDir.FullName '*') -Destination $InstallDir -Recurse -Force
New-Item -ItemType Directory -Path (Join-Path $InstallDir 'data') -Force | Out-Null

$NodePath = (Get-Command node).Source

Write-Host '[5/7] 注册开机自启任务 ...'
try {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
} catch {}

$Action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument "/c cd /d `"$InstallDir`" && `"$NodePath`" server.js"
$Trigger = New-ScheduledTaskTrigger -AtStartup
$Principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -RunLevel Highest
Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Principal $Principal -Force | Out-Null

Write-Host '[6/7] 放行防火墙 8080 端口 ...'
if (-not (Get-NetFirewallRule -DisplayName 'XMaoClock Remote 8080' -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName 'XMaoClock Remote 8080' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8080 | Out-Null
}

Write-Host '[7/7] 启动服务进程 ...'
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -like "*XMaoClock_Server*server.js*" } |
    ForEach-Object {
        try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch {}
    }

Start-Process -FilePath $NodePath -ArgumentList 'server.js' -WorkingDirectory $InstallDir -WindowStyle Hidden

Remove-Item $TempRoot -Recurse -Force

Write-Host ''
Write-Host '部署完成。'
Write-Host "安装目录：$InstallDir"
Write-Host '默认访问地址：'
Write-Host '  http://127.0.0.1:8080'
Write-Host '  http://你的公网IP:8080'
Write-Host ''
Write-Host '下一步：'
Write-Host '1. 浏览器打开后台，首次设置密码'
Write-Host '2. 添加设备串号'
Write-Host '3. 回到设备本地网页填写公网 IP 或域名'
