# XMaoClock Remote Hub API 说明

接口统一返回 JSON。

## 通用说明

- 后台接口以 `/api/admin/` 开头
- 设备接口以 `/api/device/` 开头
- 后台登录使用 Cookie Session
- 设备认证使用 `serial + deviceToken`

## 1. 获取平台初始化状态

### `GET /api/bootstrap`

返回示例：

```json
{
  "status": "success",
  "setupRequired": true,
  "serverTime": "2026-04-11T06:22:25.491Z",
  "deviceCount": 0
}
```

## 2. 首次设置管理员密码

### `POST /api/admin/setup`

请求体：

```json
{
  "password": "12345678"
}
```

返回：

```json
{
  "status": "success",
  "message": "管理员密码已设置，请登录"
}
```

## 3. 管理员登录

### `POST /api/admin/login`

请求体：

```json
{
  "password": "12345678"
}
```

成功后会下发 Cookie：

- `xmao_admin`

## 4. 管理员退出

### `POST /api/admin/logout`

## 5. 查看登录状态

### `GET /api/admin/session`

## 6. 获取设备列表

### `GET /api/admin/devices`

返回字段包含：

- `serial`
- `alias`
- `online`
- `lastSeenAt`
- `lastHandshakeAt`
- `firmwareVersion`
- `mac`
- `wifiIp`
- `wifiSsid`
- `uptimeMinutes`
- `deviceTime`
- `sensor`
- `apBroadcastEnabled`
- `pendingQueueCount`
- `commandHistory`

## 7. 添加设备串号

### `POST /api/admin/devices`

请求体：

```json
{
  "serial": "XM-ABCDE-FGHIJ-KLMNO-PQRST",
  "alias": "卧室时钟"
}
```

说明：

- `serial` 必填
- `alias` 选填
- 只要后台添加过串号，物理设备就可以拿这个串号去握手

## 8. 重命名设备

### `POST /api/admin/devices/:serial/alias`

请求体：

```json
{
  "alias": "客厅主钟"
}
```

## 9. 删除设备绑定

### `DELETE /api/admin/devices/:serial`

删除后：

- 设备后续心跳会被拒绝
- 设备本地会提示该串号未在公网平台配置

## 10. 发送命令到设备

### `POST /api/admin/devices/:serial/commands`

请求体通用格式：

```json
{
  "type": "ping",
  "params": {}
}
```

当前支持的 `type`：

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

### `sync_time` 示例

```json
{
  "type": "sync_time",
  "params": {
    "epochMs": 1712817000000,
    "timezoneOffsetMinutes": -480
  }
}
```

### `start_pin` 示例

```json
{
  "type": "start_pin",
  "params": {
    "pin": 13,
    "seconds": 3
  }
}
```

### `set_ap_broadcast` 示例

```json
{
  "type": "set_ap_broadcast",
  "params": {
    "enabled": true
  }
}
```

### `add_alarm` 示例

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

- `alarmType` 为 `buzzer` 时，`pin` 会被忽略
- `alarmType` 为 `pin` 时，需要提供有效引脚

### `delete_alarm` 示例

```json
{
  "type": "delete_alarm",
  "params": {
    "alarm": "07:30:00|buzzer"
  }
}
```

### `clear_alarms` 示例

```json
{
  "type": "clear_alarms",
  "params": {}
}
```

### `stop_alarm` 示例

```json
{
  "type": "stop_alarm",
  "params": {
    "id": "07:30:00"
  }
}
```

### `set_rgb_color` 示例

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

### `set_rgb_brightness` 示例

```json
{
  "type": "set_rgb_brightness",
  "params": {
    "brightness": 40
  }
}
```

### `set_rgb_mode` 示例

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

### `set_boot_animation` 示例

```json
{
  "type": "set_boot_animation",
  "params": {
    "type": 2
  }
}
```

### `canvas_upload` 示例

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

- `bitmapHex` 是 128x64 单色位图压缩后的十六进制字符串
- `duration = 0` 表示持续显示，直到主动结束

### `canvas_end` 示例

```json
{
  "type": "canvas_end",
  "params": {}
}
```

## 11. 设备首次握手

### `POST /api/device/handshake`

请求体：

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

成功返回：

```json
{
  "status": "success",
  "message": "握手成功，设备已接入公网平台",
  "deviceToken": "dev_xxxxxxxxxxxxx",
  "alias": "卧室时钟",
  "pollIntervalMs": 8000
}
```

心跳上报中还会携带：

- `scheduledAlarms`
- `activeAlarms`
- `rgb`
- `bootAnimationType`
- `canvasDisplayActive`
- `canvasDisplayDuration`

如果后台未添加该串号，会返回：

```json
{
  "status": "error",
  "message": "貌似没有正确在公网配置设备，请先在管理后台添加这个串号"
}
```

## 12. 设备心跳

### `POST /api/device/heartbeat`

请求体：

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
  "pendingResultsJson": []
}
```

成功返回：

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

## 13. 设备回报命令执行结果

### `POST /api/device/report`

请求体：

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

## 14. 典型接入流程

1. 部署平台并访问管理页
2. 设置后台密码并登录
3. 添加设备串号
4. 在物理设备本地网页填写公网 IP 或域名
5. 设备调用 `/api/device/handshake`
6. 握手成功后，设备保存 `deviceToken`
7. 设备定时调用 `/api/device/heartbeat`
8. 后台向该设备下发控制命令
9. 设备执行后调用 `/api/device/report`
