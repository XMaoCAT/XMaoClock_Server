# XMaoClock Remote Hub API 说明

本文档把当前远程控制平台的接口、鉴权方式、请求示例、响应示例、设备接入流程都整理成了一份完整说明。

## 1. 基础说明

### 服务基地址

按你的部署方式不同，常见基地址如下：

- `http://127.0.0.1:8080`
- `http://你的公网IP:8080`
- `https://你的域名`

### 接口分组

- 后台接口：`/api/admin/*`
- 设备接口：`/api/device/*`
- 引导接口：`/api/bootstrap`

### 鉴权方式

后台管理端：

- 先设置管理员密码
- 登录成功后服务端会下发 Cookie：`xmao_admin`
- 后续后台接口通过 Cookie Session 鉴权

设备端：

- 设备必须先握手获取 `deviceToken`
- 后续心跳和结果回报都要携带 `serial + deviceToken`

### 通用返回格式

成功：

```json
{
  "status": "success",
  "message": "..."
}
```

失败：

```json
{
  "status": "error",
  "message": "..."
}
```

## 2. 平台引导接口

### `GET /api/bootstrap`

作用：

- 检查是否需要首次设置管理员密码
- 获取服务器当前时间
- 获取已绑定设备数量

请求示例：

```bash
curl http://127.0.0.1:8080/api/bootstrap
```

成功响应示例：

```json
{
  "status": "success",
  "setupRequired": true,
  "serverTime": "2026-04-11T06:22:25.491Z",
  "deviceCount": 0
}
```

字段说明：

- `setupRequired`: `true` 表示还没有设置管理员密码
- `serverTime`: 服务器时间，ISO 8601 格式
- `deviceCount`: 当前后台已绑定的设备数量

## 3. 管理员账号相关接口

### `POST /api/admin/setup`

作用：首次设置管理员密码。只能在平台还未初始化时使用。

请求体：

```json
{
  "password": "12345678"
}
```

cURL 示例：

```bash
curl -X POST http://127.0.0.1:8080/api/admin/setup \
  -H "Content-Type: application/json" \
  -d '{"password":"12345678"}'
```

成功响应：

```json
{
  "status": "success",
  "message": "管理员密码已设置，请登录"
}
```

### `POST /api/admin/login`

作用：管理员登录。

请求体：

```json
{
  "password": "12345678"
}
```

cURL 示例：

```bash
curl -c cookie.txt -X POST http://127.0.0.1:8080/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"password":"12345678"}'
```

成功后会返回登录成功 JSON，并把 Cookie 保存到 `cookie.txt`。

### `POST /api/admin/logout`

作用：退出登录。

cURL 示例：

```bash
curl -b cookie.txt -X POST http://127.0.0.1:8080/api/admin/logout
```

### `GET /api/admin/session`

作用：检查当前管理员会话是否有效。

cURL 示例：

```bash
curl -b cookie.txt http://127.0.0.1:8080/api/admin/session
```

## 4. 设备管理接口

### `GET /api/admin/devices`

作用：获取后台当前所有设备列表。

cURL 示例：

```bash
curl -b cookie.txt http://127.0.0.1:8080/api/admin/devices
```

返回字段包含：

- `serial`
- `alias`
- `online`
- `lastSeenAt`
- `createdAt`
- `lastHandshakeAt`
- `firmwareVersion`
- `mac`
- `wifiIp`
- `wifiSsid`
- `uptimeMinutes`
- `deviceTime`
- `sensor`
- `apBroadcastEnabled`
- `scheduledAlarms`
- `activeAlarms`
- `rgb`
- `bootAnimationType`
- `canvasDisplayActive`
- `canvasDisplayDuration`
- `pendingQueueCount`
- `commandHistory`

### `POST /api/admin/devices`

作用：在公网平台预先绑定一个设备串号。只有绑定后，物理设备才能握手成功。

请求体：

```json
{
  "serial": "XM-ABCDE-FGHIJ-KLMNO-PQRST",
  "alias": "卧室时钟"
}
```

cURL 示例：

```bash
curl -b cookie.txt -X POST http://127.0.0.1:8080/api/admin/devices \
  -H "Content-Type: application/json" \
  -d '{"serial":"XM-ABCDE-FGHIJ-KLMNO-PQRST","alias":"卧室时钟"}'
```

成功响应示例：

```json
{
  "status": "success",
  "message": "设备串号已加入公网平台，接下来去设备内网页面填写公网地址即可握手",
  "device": {
    "serial": "XM-ABCDE-FGHIJ-KLMNO-PQRST",
    "alias": "卧室时钟",
    "online": false
  }
}
```

### `POST /api/admin/devices/:serial/alias`

作用：修改后台显示的设备备注名。

请求体：

```json
{
  "alias": "客厅主钟"
}
```

cURL 示例：

```bash
curl -b cookie.txt -X POST http://127.0.0.1:8080/api/admin/devices/XM-ABCDE-FGHIJ-KLMNO-PQRST/alias \
  -H "Content-Type: application/json" \
  -d '{"alias":"客厅主钟"}'
```

### `DELETE /api/admin/devices/:serial`

作用：删除后台绑定。删除后设备的后续心跳会被拒绝。

cURL 示例：

```bash
curl -b cookie.txt -X DELETE http://127.0.0.1:8080/api/admin/devices/XM-ABCDE-FGHIJ-KLMNO-PQRST
```

## 5. 向设备发送控制命令

### `POST /api/admin/devices/:serial/commands`

通用请求格式：

```json
{
  "type": "ping",
  "params": {}
}
```

cURL 模板：

```bash
curl -b cookie.txt -X POST http://127.0.0.1:8080/api/admin/devices/XM-ABCDE-FGHIJ-KLMNO-PQRST/commands \
  -H "Content-Type: application/json" \
  -d '{"type":"ping","params":{}}'
```

### 当前支持的命令类型

- `ping`
- `restart`
- `sync_time`
- `start_pin`
- `open_pin`
- `close_pin`
- `set_ap_broadcast`
- `add_alarm`
- `delete_alarm`
- `clear_alarms`
- `stop_alarm`
- `set_rgb_color`
- `set_rgb_brightness`
- `set_rgb_mode`
- `set_boot_animation`
- `canvas_upload`
- `canvas_end`

### 命令示例

#### `sync_time`

```json
{
  "type": "sync_time",
  "params": {
    "epochMs": 1712817000000,
    "timezoneOffsetMinutes": -480
  }
}
```

#### `start_pin`

```json
{
  "type": "start_pin",
  "params": {
    "pin": 13,
    "seconds": 3
  }
}
```

#### `open_pin`

```json
{
  "type": "open_pin",
  "params": {
    "pin": 13
  }
}
```

#### `close_pin`

```json
{
  "type": "close_pin",
  "params": {
    "pin": 13
  }
}
```

#### `set_ap_broadcast`

```json
{
  "type": "set_ap_broadcast",
  "params": {
    "enabled": true
  }
}
```

#### `add_alarm`

```json
{
  "type": "add_alarm",
  "params": {
    "time": "07:30:00",
    "alarmType": "buzzer",
    "pin": 13,
    "duration": 5
  }
}
```

说明：

- `time` 必须是 `HH:MM:SS`
- `alarmType` 允许 `buzzer` 或 `pin`
- 当 `alarmType = buzzer` 时，`pin` 会被忽略
- 当 `alarmType = pin` 时，需要合法的引脚号

#### `delete_alarm`

```json
{
  "type": "delete_alarm",
  "params": {
    "alarm": "07:30:00|buzzer"
  }
}
```

#### `clear_alarms`

```json
{
  "type": "clear_alarms",
  "params": {}
}
```

#### `stop_alarm`

```json
{
  "type": "stop_alarm",
  "params": {
    "id": "07:30:00"
  }
}
```

#### `set_rgb_color`

```json
{
  "type": "set_rgb_color",
  "params": {
    "r": 255,
    "g": 0,
    "b": 0
  }
}
```

#### `set_rgb_brightness`

```json
{
  "type": "set_rgb_brightness",
  "params": {
    "brightness": 40
  }
}
```

#### `set_rgb_mode`

```json
{
  "type": "set_rgb_mode",
  "params": {
    "mode": "preset",
    "color": "blue"
  }
}
```

可选模式：

- `off`
- `spectrum`
- `preset`

#### `set_boot_animation`

```json
{
  "type": "set_boot_animation",
  "params": {
    "type": 2
  }
}
```

#### `canvas_upload`

```json
{
  "type": "canvas_upload",
  "params": {
    "bitmapHex": "010203...总长度2048位十六进制字符",
    "duration": 60
  }
}
```

说明：

- `bitmapHex` 是 128x64 单色位图的十六进制数据
- `duration = 0` 表示持续显示，直到主动结束

#### `canvas_end`

```json
{
  "type": "canvas_end",
  "params": {}
}
```

## 6. 设备接入接口

### `POST /api/device/handshake`

作用：物理设备首次连接到公网平台时，获取 `deviceToken`。

请求体示例：

```json
{
  "serial": "XM-ABCDE-FGHIJ-KLMNO-PQRST",
  "alias": "XMaoClock-PQRST",
  "firmwareVersion": "Apr 11 2026 14:10:00",
  "mac": "AA:BB:CC:DD:EE:FF",
  "wifiIp": "192.168.1.8",
  "wifiSsid": "MyWiFi"
}
```

成功响应：

```json
{
  "status": "success",
  "message": "握手成功，设备已接入公网平台",
  "deviceToken": "dev_xxxxxxxxxxxxx",
  "alias": "卧室时钟",
  "pollIntervalMs": 8000
}
```

如果后台没有提前绑定该串号，失败响应为：

```json
{
  "status": "error",
  "message": "貌似没有正确在公网配置设备，请先在管理后台添加这个串号"
}
```

### `POST /api/device/heartbeat`

作用：设备定时上报状态，并拉取待执行命令。

请求体示例：

```json
{
  "serial": "XM-ABCDE-FGHIJ-KLMNO-PQRST",
  "deviceToken": "dev_xxxxxxxxxxxxx",
  "alias": "XMaoClock-PQRST",
  "firmwareVersion": "Apr 11 2026 14:10:00",
  "mac": "AA:BB:CC:DD:EE:FF",
  "wifiConnected": true,
  "wifiSsid": "MyWiFi",
  "wifiIp": "192.168.1.8",
  "uptimeMinutes": 123,
  "apBroadcastEnabled": false,
  "displayTime": "2026-04-11 14:30:10",
  "sensor": {
    "available": true,
    "temperature": 25.1,
    "humidity": 46.8
  },
  "scheduledAlarms": [
    "07:30:00|buzzer"
  ],
  "activeAlarms": [],
  "rgb": {
    "r": 255,
    "g": 0,
    "b": 0,
    "brightness": 50,
    "spectrum": false
  },
  "bootAnimationType": 2,
  "canvasDisplayActive": false,
  "canvasDisplayDuration": 0,
  "pendingResultsJson": []
}
```

成功响应：

```json
{
  "status": "success",
  "message": "云端在线，等待下一次控制指令",
  "pollIntervalMs": 8000,
  "commands": [
    {
      "id": "cmd_xxxxx",
      "type": "ping",
      "params": {}
    }
  ]
}
```

如果 `serial` 或 `deviceToken` 缺失，会返回：

```json
{
  "status": "error",
  "message": "缺少串号或设备令牌"
}
```

如果 `deviceToken` 不匹配，会返回：

```json
{
  "status": "error",
  "message": "设备令牌无效，请重新握手"
}
```

### `POST /api/device/report`

作用：设备主动上报命令执行结果。

请求体示例：

```json
{
  "serial": "XM-ABCDE-FGHIJ-KLMNO-PQRST",
  "deviceToken": "dev_xxxxxxxxxxxxx",
  "resultsJson": [
    {
      "commandId": "cmd_xxxxx",
      "success": true,
      "message": "设备在线"
    }
  ]
}
```

成功响应：

```json
{
  "status": "success",
  "message": "执行结果已收录"
}
```

## 7. 设备状态字段说明

设备在后台展示时，服务端会根据心跳整理出以下重点字段：

- `online`: 最近 20 秒内有心跳则为 `true`
- `lastSeenAt`: 最近一次心跳时间
- `lastHandshakeAt`: 最近一次握手时间
- `wifiSsid`: 当前连接的 Wi-Fi 名称
- `wifiIp`: 当前设备局域网 IP
- `uptimeMinutes`: 运行分钟数
- `deviceTime`: 设备显示时间
- `sensor`: 温湿度状态
- `apBroadcastEnabled`: 联网后是否仍广播设备热点
- `scheduledAlarms`: 已保存的闹钟列表
- `activeAlarms`: 正在触发中的闹钟列表
- `rgb`: RGB 灯颜色和亮度状态
- `bootAnimationType`: 当前开机动画类型
- `canvasDisplayActive`: 是否正在显示远程画板内容
- `canvasDisplayDuration`: 远程画板显示时长
- `commandHistory`: 最近的命令记录

## 8. 典型接入流程

### 管理端流程

1. 部署平台。
2. 调用或打开 `/api/bootstrap`，确认是否需要初始化。
3. 调用 `/api/admin/setup` 设置管理员密码。
4. 调用 `/api/admin/login` 登录后台。
5. 调用 `/api/admin/devices` 绑定设备串号。
6. 调用 `/api/admin/devices/:serial/commands` 给设备下发控制命令。

### 设备端流程

1. 本地网页里填写公网地址。
2. 设备调用 `/api/device/handshake`。
3. 平台返回 `deviceToken`。
4. 设备保存 `deviceToken`。
5. 设备定时调用 `/api/device/heartbeat` 上报状态并拉取命令。
6. 设备执行命令后调用 `/api/device/report` 上报结果。

## 9. 浏览器与设备的最小联调示例

### 第一步：设置管理员密码

```bash
curl -X POST http://127.0.0.1:8080/api/admin/setup \
  -H "Content-Type: application/json" \
  -d '{"password":"12345678"}'
```

### 第二步：登录并保存 Cookie

```bash
curl -c cookie.txt -X POST http://127.0.0.1:8080/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"password":"12345678"}'
```

### 第三步：添加设备

```bash
curl -b cookie.txt -X POST http://127.0.0.1:8080/api/admin/devices \
  -H "Content-Type: application/json" \
  -d '{"serial":"XM-ABCDE-FGHIJ-KLMNO-PQRST","alias":"卧室时钟"}'
```

### 第四步：模拟设备握手

```bash
curl -X POST http://127.0.0.1:8080/api/device/handshake \
  -H "Content-Type: application/json" \
  -d '{"serial":"XM-ABCDE-FGHIJ-KLMNO-PQRST","alias":"XMaoClock-PQRST","firmwareVersion":"Apr 11 2026 14:10:00","mac":"AA:BB:CC:DD:EE:FF","wifiIp":"192.168.1.8","wifiSsid":"MyWiFi"}'
```

### 第五步：给设备发一个 ping 命令

```bash
curl -b cookie.txt -X POST http://127.0.0.1:8080/api/admin/devices/XM-ABCDE-FGHIJ-KLMNO-PQRST/commands \
  -H "Content-Type: application/json" \
  -d '{"type":"ping","params":{}}'
```
