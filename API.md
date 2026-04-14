# XMaoClock Remote Hub API 说明

本文档对应当前任务队列版本的 XMaoClock 公网远程控制平台。

当前平台的核心模式是：

- 后台把任务写入 `data/tasks.json`
- 设备主动 `GET /api/device/tasks` 拉取任务
- 设备准备开始处理时调用 `/api/device/tasks/started`
- 设备处理完成后调用 `/api/device/tasks/complete`
- 服务端收到完成回执后删除对应任务

## 1. 基础说明

### 服务基地址

常见基地址如下：

- `http://127.0.0.1:9230`
- `http://你的公网IP:9230`
- `https://你的域名`

### 接口分组

- 后台接口：`/api/admin/*`
- 设备接口：`/api/device/*`
- 引导接口：`/api/bootstrap`

### 鉴权方式

后台管理端：

- 首次运行先设置管理员密码
- 登录成功后服务端下发 Cookie：`xmao_admin`
- 后续后台接口通过 Cookie Session 鉴权

设备端：

- 设备必须先握手获取 `deviceToken`
- 后续心跳、拉取任务、开始回执、完成回执都要携带 `serial + deviceToken`

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
curl http://127.0.0.1:9230/api/bootstrap
```

成功响应示例：

```json
{
  "status": "success",
  "setupRequired": true,
  "serverTime": "2026-04-13T10:57:19.720Z",
  "deviceCount": 0
}
```

## 3. 管理员账号相关接口

### `POST /api/admin/setup`

作用：首次设置管理员密码。只能在平台还未初始化时使用。

请求体：

```json
{
  "password": "12345678"
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
curl -c cookie.txt -X POST http://127.0.0.1:9230/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"password":"12345678"}'
```

### `POST /api/admin/logout`

作用：退出登录。

### `GET /api/admin/session`

作用：检查当前管理员会话是否有效。

## 4. 设备管理接口

### `GET /api/admin/devices`

作用：获取后台当前所有设备列表。

返回字段重点包括：

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
- `pendingTasks`
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

### `POST /api/admin/devices/:serial/alias`

作用：修改后台显示的设备备注名。

### `DELETE /api/admin/devices/:serial`

作用：删除后台绑定。删除后设备后续心跳和任务同步会被拒绝。

## 5. 后台任务下发接口

当前公网平台只保留四类远程任务能力：

- 闹钟
- 钢琴
- LittleFS 存储
- GPIO 引脚激活

### `POST /api/admin/devices/:serial/commands`

作用：给设备加入一条待执行任务。任务会写入 `data/tasks.json` 并分配独立 `id`。

通用请求格式：

```json
{
  "type": "storage_write_text",
  "params": {
    "fileName": "memo.txt",
    "content": "hello"
  }
}
```

成功响应示例：

```json
{
  "status": "success",
  "message": "任务已加入 tasks.json 队列，等待设备通过任务 API 拉取",
  "command": {
    "id": "cmd_xxxxx",
    "type": "storage_write_text",
    "params": {
      "fileName": "memo.txt",
      "content": "hello"
    },
    "status": "queued",
    "createdAt": "2026-04-13T10:57:19.734Z",
    "resultMessage": "任务已写入云端任务队列，等待设备下一次同步拉取"
  }
}
```

### 当前支持的任务类型

- `start_pin`
- `open_pin`
- `close_pin`
- `add_alarm`
- `delete_alarm`
- `clear_alarms`
- `stop_alarm`
- `piano_play_note`
- `piano_play_melody`
- `storage_write_text`
- `storage_delete_file`

### 任务示例

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

#### `add_alarm`

```json
{
  "type": "add_alarm",
  "params": {
    "time": "07:30:00",
    "alarmType": "buzzer"
  }
}
```

#### `piano_play_note`

```json
{
  "type": "piano_play_note",
  "params": {
    "note": "C4",
    "durationMs": 500
  }
}
```

#### `piano_play_melody`

```json
{
  "type": "piano_play_melody",
  "params": {
    "name": "经典闹钟"
  }
}
```

#### `storage_write_text`

```json
{
  "type": "storage_write_text",
  "params": {
    "fileName": "memo.txt",
    "content": "hello"
  }
}
```

#### `storage_delete_file`

```json
{
  "type": "storage_delete_file",
  "params": {
    "fileName": "memo.txt"
  }
}
```

### `DELETE /api/admin/devices/:serial/tasks/:taskId`

作用：取消某一条尚未完成的待执行任务。

### `DELETE /api/admin/devices/:serial/tasks`

作用：一次取消该设备当前全部待执行任务。

## 6. 设备接入与任务同步接口

### `POST /api/device/handshake`

作用：物理设备首次连接到公网平台时，获取 `deviceToken`。

请求体示例：

```json
{
  "serial": "XM-ABCDE-FGHIJ-KLMNO-PQRST",
  "alias": "XMaoClock-PQRST",
  "firmwareVersion": "Apr 13 2026 18:39:00",
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

### `POST /api/device/heartbeat`

作用：设备定时上报状态。心跳响应不再直接下发命令，只返回轮询间隔和云端状态。

请求体示例：

```json
{
  "serial": "XM-ABCDE-FGHIJ-KLMNO-PQRST",
  "deviceToken": "dev_xxxxxxxxxxxxx",
  "alias": "XMaoClock-PQRST",
  "firmwareVersion": "Apr 13 2026 18:39:00",
  "mac": "AA:BB:CC:DD:EE:FF",
  "wifiConnected": true,
  "wifiSsid": "MyWiFi",
  "wifiIp": "192.168.1.8",
  "uptimeMinutes": 123,
  "apBroadcastEnabled": false,
  "displayTime": "2026-04-13 18:40:10",
  "sensor": {
    "available": true,
    "temperature": 25.1,
    "humidity": 46.8
  },
  "scheduledAlarms": [
    "07:30:00|buzzer"
  ],
  "activeAlarms": []
}
```

成功响应：

```json
{
  "status": "success",
  "message": "云端在线，等待下一次任务同步",
  "pollIntervalMs": 8000
}
```

### `GET /api/device/tasks`

作用：设备主动拉取待执行任务。

请求示例：

```bash
curl "http://127.0.0.1:9230/api/device/tasks?serial=XM-ABCDE-FGHIJ-KLMNO-PQRST&deviceToken=dev_xxxxxxxxxxxxx"
```

成功响应示例：

```json
{
  "status": "success",
  "tasks": [
    {
      "id": "cmd_xxxxx",
      "type": "storage_write_text",
      "params": {
        "fileName": "memo.txt",
        "content": "hello"
      }
    }
  ],
  "pollIntervalMs": 8000,
  "message": "已返回待执行任务"
}
```

### `POST /api/device/tasks/started`

作用：设备已经收到任务，准备开始处理时上报。

请求体示例：

```json
{
  "serial": "XM-ABCDE-FGHIJ-KLMNO-PQRST",
  "deviceToken": "dev_xxxxxxxxxxxxx",
  "resultsJson": [
    {
      "commandId": "cmd_xxxxx",
      "type": "storage_write_text",
      "status": "processing",
      "message": "设备已接收指令，准备开始处理"
    }
  ]
}
```

成功响应：

```json
{
  "status": "success",
  "message": "任务开始状态已收录"
}
```

### `POST /api/device/tasks/complete`

作用：设备执行完成后上报最终结果。服务端收到后会把对应任务从 `data/tasks.json` 删除。

请求体示例：

```json
{
  "serial": "XM-ABCDE-FGHIJ-KLMNO-PQRST",
  "deviceToken": "dev_xxxxxxxxxxxxx",
  "resultsJson": [
    {
      "commandId": "cmd_xxxxx",
      "type": "storage_write_text",
      "success": true,
      "message": "文件 memo.txt 已写入"
    }
  ]
}
```

成功响应：

```json
{
  "status": "success",
  "message": "任务完成结果已收录，并已从 tasks.json 队列删除"
}
```

### `POST /api/device/report`

兼容旧固件的别名接口，当前会映射到 `/api/device/tasks/complete`。

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
- `rgb`: 设备上报的 RGB 当前状态
- `bootAnimationType`: 设备上报的开机动画状态
- `canvasDisplayActive`: 设备上报的画板显示状态
- `canvasDisplayDuration`: 设备上报的画板显示时长
- `pendingTasks`: 当前未完成的任务列表
- `commandHistory`: 最近的任务历史记录

## 8. 典型接入流程

### 管理端流程

1. 部署平台。
2. 调用或打开 `/api/bootstrap`，确认是否需要初始化。
3. 调用 `/api/admin/setup` 设置管理员密码。
4. 调用 `/api/admin/login` 登录后台。
5. 调用 `/api/admin/devices` 绑定设备串号。
6. 调用 `/api/admin/devices/:serial/commands` 给设备加入任务队列。
7. 必要时调用取消接口移除单条或全部待执行任务。

### 设备端流程

1. 本地网页里填写公网地址。
2. 设备调用 `/api/device/handshake`。
3. 平台返回 `deviceToken`。
4. 设备保存 `deviceToken`。
5. 设备定时调用 `/api/device/heartbeat` 上报状态。
6. 设备随后调用 `GET /api/device/tasks` 拉取任务。
7. 设备准备开始处理时调用 `/api/device/tasks/started`。
8. 设备处理完成后调用 `/api/device/tasks/complete`。

## 9. 浏览器与设备的最小联调示例

### 第一步：设置管理员密码

```bash
curl -X POST http://127.0.0.1:9230/api/admin/setup \
  -H "Content-Type: application/json" \
  -d '{"password":"12345678"}'
```

### 第二步：登录并保存 Cookie

```bash
curl -c cookie.txt -X POST http://127.0.0.1:9230/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"password":"12345678"}'
```

### 第三步：添加设备

```bash
curl -b cookie.txt -X POST http://127.0.0.1:9230/api/admin/devices \
  -H "Content-Type: application/json" \
  -d '{"serial":"XM-ABCDE-FGHIJ-KLMNO-PQRST","alias":"卧室时钟"}'
```

### 第四步：模拟设备握手

```bash
curl -X POST http://127.0.0.1:9230/api/device/handshake \
  -H "Content-Type: application/json" \
  -d '{"serial":"XM-ABCDE-FGHIJ-KLMNO-PQRST","alias":"XMaoClock-PQRST","firmwareVersion":"Apr 13 2026 18:39:00","mac":"AA:BB:CC:DD:EE:FF","wifiIp":"192.168.1.8","wifiSsid":"MyWiFi"}'
```

### 第五步：给设备加入一个写文件任务

```bash
curl -b cookie.txt -X POST http://127.0.0.1:9230/api/admin/devices/XM-ABCDE-FGHIJ-KLMNO-PQRST/commands \
  -H "Content-Type: application/json" \
  -d '{"type":"storage_write_text","params":{"fileName":"memo.txt","content":"hello"}}'
```

### 第六步：设备拉取任务

```bash
curl "http://127.0.0.1:9230/api/device/tasks?serial=XM-ABCDE-FGHIJ-KLMNO-PQRST&deviceToken=dev_xxxxxxxxxxxxx"
```

### 第七步：设备回执已开始处理

```bash
curl -X POST http://127.0.0.1:9230/api/device/tasks/started \
  -H "Content-Type: application/json" \
  -d '{"serial":"XM-ABCDE-FGHIJ-KLMNO-PQRST","deviceToken":"dev_xxxxxxxxxxxxx","resultsJson":[{"commandId":"cmd_xxxxx","type":"storage_write_text","status":"processing","message":"设备已接收指令，准备开始处理"}]}'
```

### 第八步：设备回执处理完成

```bash
curl -X POST http://127.0.0.1:9230/api/device/tasks/complete \
  -H "Content-Type: application/json" \
  -d '{"serial":"XM-ABCDE-FGHIJ-KLMNO-PQRST","deviceToken":"dev_xxxxxxxxxxxxx","resultsJson":[{"commandId":"cmd_xxxxx","type":"storage_write_text","success":true,"message":"文件 memo.txt 已写入"}]}'
```
