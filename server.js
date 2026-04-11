const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const CONFIG_FILE = path.join(ROOT_DIR, 'config.json');
const STORE_FILE = path.join(DATA_DIR, 'store.json');
const ONLINE_WINDOW_MS = 20000;
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_HISTORY = 60;
const COMMAND_RETRY_WINDOW_MS = 15000;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml'
};

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
}

function ensureJsonFile(filePath, defaultValue) {
  if (!fs.existsSync(filePath)) {
    writeJson(filePath, defaultValue);
  }
}

function loadJson(filePath, fallbackValue) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    return fallbackValue;
  }
}

function nowIso() {
  return new Date().toISOString();
}

function sha256(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

function createId(prefix) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
}

function clamp(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(num)));
}

function normalizeSerial(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeAlias(value, fallback) {
  const alias = String(value || '').trim();
  return alias.length > 0 ? alias.slice(0, 40) : fallback;
}

function resolveDeviceAlias(currentAlias, serial, reportedAlias) {
  const trimmedCurrent = String(currentAlias || '').trim();
  const trimmedReported = String(reportedAlias || '').trim();
  const serialText = String(serial || '').trim();

  if (trimmedCurrent && trimmedCurrent.toUpperCase() !== serialText.toUpperCase()) {
    return trimmedCurrent.slice(0, 40);
  }

  if (trimmedReported) {
    return trimmedReported.slice(0, 40);
  }

  return normalizeAlias(trimmedCurrent, serialText);
}

function isValidTimeString(value) {
  return /^\d{2}:\d{2}:\d{2}$/.test(String(value || '').trim());
}

function isHexBitmap(value) {
  const text = String(value || '').trim();
  return /^[0-9a-fA-F]+$/.test(text);
}

function sanitizeScheduledAlarms(input) {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map(item => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 64);
}

function sanitizeActiveAlarms(input) {
  if (!Array.isArray(input)) {
    return [];
  }

  return input.slice(0, 16).map(item => ({
    id: String(item && item.id ? item.id : '').trim(),
    type: String(item && item.type ? item.type : '').trim(),
    pin: clamp(item && item.pin, -1, 39, -1),
    startMs: clamp(item && item.startMs, 0, Number.MAX_SAFE_INTEGER, 0),
    durationMs: clamp(item && item.durationMs, 0, Number.MAX_SAFE_INTEGER, 0)
  })).filter(item => item.id);
}

function sanitizeRgbState(input) {
  const rgb = input || {};
  return {
    r: clamp(rgb.r, 0, 255, 0),
    g: clamp(rgb.g, 0, 255, 0),
    b: clamp(rgb.b, 0, 255, 0),
    brightness: clamp(rgb.brightness, 0, 100, 50),
    spectrum: !!rgb.spectrum
  };
}

function sanitizeDevice(device) {
  const lastSeenAt = device.lastSeenAt || '';
  const online = lastSeenAt ? (Date.now() - Date.parse(lastSeenAt)) < ONLINE_WINDOW_MS : false;
  return {
    serial: device.serial,
    alias: device.alias,
    online,
    lastSeenAt,
    createdAt: device.createdAt || '',
    lastHandshakeAt: device.lastHandshakeAt || '',
    firmwareVersion: device.firmwareVersion || '',
    mac: device.mac || '',
    wifiIp: device.wifiIp || '',
    wifiSsid: device.wifiSsid || '',
    uptimeMinutes: device.uptimeMinutes || 0,
    deviceTime: device.deviceTime || '',
    sensor: device.sensor || { available: false },
    apBroadcastEnabled: !!device.apBroadcastEnabled,
    scheduledAlarms: sanitizeScheduledAlarms(device.scheduledAlarms),
    activeAlarms: sanitizeActiveAlarms(device.activeAlarms),
    rgb: sanitizeRgbState(device.rgb),
    bootAnimationType: clamp(device.bootAnimationType, 1, 2, 1),
    canvasDisplayActive: !!device.canvasDisplayActive,
    canvasDisplayDuration: clamp(device.canvasDisplayDuration, 0, 86400, 0),
    pendingQueueCount: Array.isArray(device.pendingQueue) ? device.pendingQueue.length : 0,
    commandHistory: Array.isArray(device.commandHistory) ? device.commandHistory.slice(0, 12) : []
  };
}

function createDefaultConfig() {
  return {
    host: '0.0.0.0',
    port: 9230,
    sessionSecret: crypto.randomBytes(32).toString('hex'),
    devicePollIntervalMs: 8000
  };
}

function createDefaultStore() {
  return {
    adminPasswordHash: '',
    devices: {}
  };
}

ensureDir(DATA_DIR);
ensureJsonFile(CONFIG_FILE, createDefaultConfig());
ensureJsonFile(STORE_FILE, createDefaultStore());

const config = loadJson(CONFIG_FILE, createDefaultConfig());
let store = loadJson(STORE_FILE, createDefaultStore());
const sessions = new Map();

if (process.env.HOST) {
  config.host = String(process.env.HOST).trim() || config.host;
}

if (process.env.PORT) {
  config.port = clamp(process.env.PORT, 1, 65535, config.port);
}

if (process.env.DEVICE_POLL_INTERVAL_MS) {
  config.devicePollIntervalMs = clamp(process.env.DEVICE_POLL_INTERVAL_MS, 5000, 60000, config.devicePollIntervalMs);
}

if (!config.sessionSecret) {
  config.sessionSecret = crypto.randomBytes(32).toString('hex');
}

if (process.env.SESSION_SECRET) {
  config.sessionSecret = String(process.env.SESSION_SECRET).trim() || config.sessionSecret;
}

writeJson(CONFIG_FILE, config);

function saveStore() {
  writeJson(STORE_FILE, store);
}

function parseCookies(req) {
  const cookieHeader = req.headers.cookie || '';
  const cookies = {};
  cookieHeader.split(';').forEach(chunk => {
    const index = chunk.indexOf('=');
    if (index > -1) {
      const key = chunk.slice(0, index).trim();
      const value = chunk.slice(index + 1).trim();
      cookies[key] = decodeURIComponent(value);
    }
  });
  return cookies;
}

function createSession() {
  const token = createId('sess');
  sessions.set(token, {
    expiresAt: Date.now() + SESSION_TTL_MS
  });
  return token;
}

function getSessionToken(req) {
  const cookies = parseCookies(req);
  const token = cookies.xmao_admin || '';
  if (!token) {
    return '';
  }
  const session = sessions.get(token);
  if (!session) {
    return '';
  }
  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return '';
  }
  return token;
}

function requireAdmin(req, res) {
  const token = getSessionToken(req);
  if (!token) {
    sendJson(res, 401, { status: 'error', message: '请先登录管理平台' });
    return false;
  }
  return true;
}

function sendJson(res, statusCode, data, extraHeaders = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders
  });
  res.end(JSON.stringify(data));
}

function sendText(res, statusCode, text, extraHeaders = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    ...extraHeaders
  });
  res.end(text);
}

function sendStaticFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME_TYPES[ext] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': mime,
    'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=300'
  });
  fs.createReadStream(filePath).pipe(res);
}

function getRequestBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error('请求体过大'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

async function readJsonBody(req, res) {
  try {
    const raw = await getRequestBody(req);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    sendJson(res, 400, { status: 'error', message: 'JSON 请求体解析失败' });
    return null;
  }
}

function getOrCreateDevice(serial, alias) {
  const normalizedSerial = normalizeSerial(serial);
  if (!store.devices[normalizedSerial]) {
    store.devices[normalizedSerial] = {
      serial: normalizedSerial,
      alias: normalizeAlias(alias, normalizedSerial),
      createdAt: nowIso(),
      lastSeenAt: '',
      lastHandshakeAt: '',
      firmwareVersion: '',
      mac: '',
      wifiIp: '',
      wifiSsid: '',
      uptimeMinutes: 0,
      deviceTime: '',
      sensor: { available: false },
      apBroadcastEnabled: false,
      scheduledAlarms: [],
      activeAlarms: [],
      rgb: { r: 0, g: 0, b: 0, brightness: 50, spectrum: false },
      bootAnimationType: 1,
      canvasDisplayActive: false,
      canvasDisplayDuration: 0,
      deviceToken: '',
      pendingQueue: [],
      commandHistory: []
    };
  }
  const device = store.devices[normalizedSerial];
  device.scheduledAlarms = sanitizeScheduledAlarms(device.scheduledAlarms);
  device.activeAlarms = sanitizeActiveAlarms(device.activeAlarms);
  device.rgb = sanitizeRgbState(device.rgb);
  device.bootAnimationType = clamp(device.bootAnimationType, 1, 2, 1);
  device.canvasDisplayActive = !!device.canvasDisplayActive;
  device.canvasDisplayDuration = clamp(device.canvasDisplayDuration, 0, 86400, 0);
  device.pendingQueue = Array.isArray(device.pendingQueue)
    ? device.pendingQueue.map(id => String(id || '').trim()).filter(Boolean)
    : [];
  device.commandHistory = Array.isArray(device.commandHistory) ? device.commandHistory.slice(0, MAX_HISTORY) : [];
  cleanupPendingQueue(device);
  return device;
}

function getDeviceBySerial(serial) {
  const normalizedSerial = normalizeSerial(serial);
  return store.devices[normalizedSerial] || null;
}

function queueCommand(device, type, params = {}) {
  const command = {
    id: createId('cmd'),
    type,
    params,
    status: 'queued',
    createdAt: nowIso(),
    resultMessage: ''
  };

  device.commandHistory.unshift(command);
  device.commandHistory = device.commandHistory.slice(0, MAX_HISTORY);
  device.pendingQueue.push(command.id);
  saveStore();
  return command;
}

function findCommand(device, commandId) {
  return (device.commandHistory || []).find(item => item.id === commandId) || null;
}

function cleanupPendingQueue(device) {
  const nextQueue = [];
  const seen = new Set();

  (Array.isArray(device.pendingQueue) ? device.pendingQueue : []).forEach(id => {
    const commandId = String(id || '').trim();
    if (!commandId || seen.has(commandId)) {
      return;
    }

    const command = findCommand(device, commandId);
    if (!command) {
      return;
    }

    if (command.status === 'success' || command.status === 'error') {
      return;
    }

    seen.add(commandId);
    nextQueue.push(commandId);
  });

  device.pendingQueue = nextQueue;
  return nextQueue;
}

function shouldDispatchCommand(command) {
  if (!command) {
    return false;
  }

  if (command.status === 'queued') {
    return true;
  }

  if (command.status !== 'sent') {
    return false;
  }

  const dispatchedAtMs = command.dispatchedAt ? Date.parse(command.dispatchedAt) : 0;
  if (!Number.isFinite(dispatchedAtMs) || !dispatchedAtMs) {
    return true;
  }

  return (Date.now() - dispatchedAtMs) >= COMMAND_RETRY_WINDOW_MS;
}

function buildDispatchCommands(device) {
  const dispatchedAt = nowIso();

  return cleanupPendingQueue(device)
    .map(id => findCommand(device, id))
    .filter(shouldDispatchCommand)
    .map(command => {
      command.status = 'sent';
      command.dispatchedAt = dispatchedAt;
      command.deliveryAttempts = Number(command.deliveryAttempts || 0) + 1;
      return {
        id: command.id,
        type: command.type,
        params: command.params || {}
      };
    });
}

function parseResultsInput(input) {
  if (!input) {
    return [];
  }
  if (Array.isArray(input)) {
    return input;
  }
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }
  return [];
}

function applyCommandResults(device, resultsInput) {
  const results = parseResultsInput(resultsInput);
  let touched = false;

  results.forEach(result => {
    const commandId = String(result.commandId || '').trim();
    if (!commandId) {
      return;
    }

    const target = findCommand(device, commandId);
    if (!target) {
      return;
    }

    target.status = result.success ? 'success' : 'error';
    target.resultMessage = String(result.message || '');
    target.executedAt = nowIso();
    device.pendingQueue = (Array.isArray(device.pendingQueue) ? device.pendingQueue : []).filter(id => id !== commandId);
    touched = true;
  });

  if (touched) {
    cleanupPendingQueue(device);
    saveStore();
  }
}

function updateDeviceHeartbeat(device, payload) {
  device.lastSeenAt = nowIso();
  device.firmwareVersion = String(payload.firmwareVersion || device.firmwareVersion || '');
  device.mac = String(payload.mac || device.mac || '');
  device.wifiIp = String(payload.wifiIp || '');
  device.wifiSsid = String(payload.wifiSsid || '');
  device.uptimeMinutes = clamp(payload.uptimeMinutes, 0, 52560000, 0);
  device.deviceTime = String(payload.displayTime || '');
  device.apBroadcastEnabled = !!payload.apBroadcastEnabled;
  device.alias = resolveDeviceAlias(device.alias, device.serial, payload.alias);
  device.scheduledAlarms = sanitizeScheduledAlarms(payload.scheduledAlarms);
  device.activeAlarms = sanitizeActiveAlarms(payload.activeAlarms);
  device.rgb = sanitizeRgbState(payload.rgb);
  device.bootAnimationType = clamp(payload.bootAnimationType, 1, 2, 1);
  device.canvasDisplayActive = !!payload.canvasDisplayActive;
  device.canvasDisplayDuration = clamp(payload.canvasDisplayDuration, 0, 86400, 0);

  const sensor = payload.sensor || {};
  if (sensor && sensor.available) {
    device.sensor = {
      available: true,
      temperature: Number(sensor.temperature),
      humidity: Number(sensor.humidity)
    };
  } else {
    device.sensor = { available: false };
  }

  saveStore();
}

function getDeviceList() {
  return Object.values(store.devices)
    .map(sanitizeDevice)
    .sort((a, b) => {
      if (a.online !== b.online) {
        return a.online ? -1 : 1;
      }
      return (b.lastSeenAt || '').localeCompare(a.lastSeenAt || '');
    });
}

function matchRoute(pathname, pattern) {
  const pathParts = pathname.split('/').filter(Boolean);
  const patternParts = pattern.split('/').filter(Boolean);
  if (pathParts.length !== patternParts.length) {
    return null;
  }

  const params = {};
  for (let i = 0; i < patternParts.length; i++) {
    const patternPart = patternParts[i];
    const pathPart = pathParts[i];
    if (patternPart.startsWith(':')) {
      params[patternPart.slice(1)] = decodeURIComponent(pathPart);
    } else if (patternPart !== pathPart) {
      return null;
    }
  }
  return params;
}

async function handleAdminSetup(req, res) {
  if (store.adminPasswordHash) {
    sendJson(res, 400, { status: 'error', message: '管理员密码已经设置过了' });
    return;
  }

  const body = await readJsonBody(req, res);
  if (!body) {
    return;
  }

  const password = String(body.password || '');
  if (password.length < 6) {
    sendJson(res, 400, { status: 'error', message: '密码至少需要 6 位' });
    return;
  }

  store.adminPasswordHash = sha256(password);
  saveStore();
  sendJson(res, 200, { status: 'success', message: '管理员密码已设置，请登录' });
}

async function handleAdminLogin(req, res) {
  if (!store.adminPasswordHash) {
    sendJson(res, 400, { status: 'error', message: '请先完成首次密码设置' });
    return;
  }

  const body = await readJsonBody(req, res);
  if (!body) {
    return;
  }

  const password = String(body.password || '');
  if (sha256(password) !== store.adminPasswordHash) {
    sendJson(res, 401, { status: 'error', message: '密码错误' });
    return;
  }

  const token = createSession();
  sendJson(res, 200, { status: 'success', message: '登录成功' }, {
    'Set-Cookie': `xmao_admin=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
  });
}

function handleAdminLogout(req, res) {
  const token = getSessionToken(req);
  if (token) {
    sessions.delete(token);
  }

  sendJson(res, 200, { status: 'success', message: '已退出登录' }, {
    'Set-Cookie': 'xmao_admin=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'
  });
}

function handleAdminSession(req, res) {
  if (!requireAdmin(req, res)) {
    return;
  }

  sendJson(res, 200, {
    status: 'success',
    setupRequired: !store.adminPasswordHash,
    deviceCount: Object.keys(store.devices).length
  });
}

async function handleAdminAddDevice(req, res) {
  if (!requireAdmin(req, res)) {
    return;
  }

  const body = await readJsonBody(req, res);
  if (!body) {
    return;
  }

  const serial = normalizeSerial(body.serial);
  if (!serial) {
    sendJson(res, 400, { status: 'error', message: '请填写设备串号' });
    return;
  }

  const device = getOrCreateDevice(serial, body.alias || serial);
  device.alias = normalizeAlias(body.alias, device.alias || serial);
  saveStore();

  sendJson(res, 200, {
    status: 'success',
    message: '设备串号已加入公网平台，接下来去设备内网页面填写公网地址即可握手',
    device: sanitizeDevice(device)
  });
}

async function handleAdminRenameDevice(req, res, params) {
  if (!requireAdmin(req, res)) {
    return;
  }

  const device = getDeviceBySerial(params.serial);
  if (!device) {
    sendJson(res, 404, { status: 'error', message: '未找到该设备' });
    return;
  }

  const body = await readJsonBody(req, res);
  if (!body) {
    return;
  }

  device.alias = normalizeAlias(body.alias, device.serial);
  saveStore();
  sendJson(res, 200, { status: 'success', message: '设备备注已更新', device: sanitizeDevice(device) });
}

function commandShape(type, params) {
  return { type, params };
}

async function handleAdminCommand(req, res, params) {
  if (!requireAdmin(req, res)) {
    return;
  }

  const device = getDeviceBySerial(params.serial);
  if (!device) {
    sendJson(res, 404, { status: 'error', message: '未找到该设备' });
    return;
  }

  const body = await readJsonBody(req, res);
  if (!body) {
    return;
  }

  const type = String(body.type || '').trim();
  const rawParams = body.params || {};
  let command = null;

  if (type === 'restart') {
    command = commandShape('restart', {});
  } else if (type === 'ping') {
    command = commandShape('ping', {});
  } else if (type === 'sync_time') {
    command = commandShape('sync_time', {
      epochMs: Number(rawParams.epochMs || Date.now()),
      timezoneOffsetMinutes: Number(rawParams.timezoneOffsetMinutes || new Date().getTimezoneOffset())
    });
  } else if (type === 'start_pin') {
    command = commandShape('start_pin', {
      pin: clamp(rawParams.pin, 0, 39, -1),
      seconds: clamp(rawParams.seconds, 1, 600, 3)
    });
  } else if (type === 'open_pin') {
    command = commandShape('open_pin', {
      pin: clamp(rawParams.pin, 0, 39, -1)
    });
  } else if (type === 'close_pin') {
    command = commandShape('close_pin', {
      pin: clamp(rawParams.pin, 0, 39, -1)
    });
  } else if (type === 'set_ap_broadcast') {
    command = commandShape('set_ap_broadcast', {
      enabled: !!rawParams.enabled
    });
  } else if (type === 'add_alarm') {
    command = commandShape('add_alarm', {
      time: String(rawParams.time || '').trim(),
      alarmType: String(rawParams.alarmType || 'buzzer').trim(),
      pin: clamp(rawParams.pin, 0, 39, -1),
      duration: clamp(rawParams.duration, 0, 86400, 0)
    });
  } else if (type === 'delete_alarm') {
    command = commandShape('delete_alarm', {
      alarm: String(rawParams.alarm || '').trim()
    });
  } else if (type === 'clear_alarms') {
    command = commandShape('clear_alarms', {});
  } else if (type === 'stop_alarm') {
    command = commandShape('stop_alarm', {
      id: String(rawParams.id || '').trim()
    });
  } else if (type === 'set_rgb_color') {
    command = commandShape('set_rgb_color', {
      r: clamp(rawParams.r, 0, 255, -1),
      g: clamp(rawParams.g, 0, 255, -1),
      b: clamp(rawParams.b, 0, 255, -1)
    });
  } else if (type === 'set_rgb_brightness') {
    command = commandShape('set_rgb_brightness', {
      brightness: clamp(rawParams.brightness, 0, 100, -1)
    });
  } else if (type === 'set_rgb_mode') {
    command = commandShape('set_rgb_mode', {
      mode: String(rawParams.mode || '').trim(),
      color: String(rawParams.color || '').trim()
    });
  } else if (type === 'set_boot_animation') {
    command = commandShape('set_boot_animation', {
      type: clamp(rawParams.type, 1, 2, 0)
    });
  } else if (type === 'canvas_upload') {
    command = commandShape('canvas_upload', {
      bitmapHex: String(rawParams.bitmapHex || '').trim(),
      duration: clamp(rawParams.duration, 0, 86400, 0)
    });
  } else if (type === 'canvas_end') {
    command = commandShape('canvas_end', {});
  }

  if (!command) {
    sendJson(res, 400, { status: 'error', message: '不支持的命令类型' });
    return;
  }

  if ((command.type === 'start_pin' || command.type === 'open_pin' || command.type === 'close_pin') && command.params.pin < 0) {
    sendJson(res, 400, { status: 'error', message: '引脚参数无效' });
    return;
  }

  if (command.type === 'add_alarm') {
    if (!isValidTimeString(command.params.time)) {
      sendJson(res, 400, { status: 'error', message: '闹钟时间必须是 HH:MM:SS' });
      return;
    }
    if (!['buzzer', 'pin'].includes(command.params.alarmType)) {
      sendJson(res, 400, { status: 'error', message: '闹钟类型必须是 buzzer 或 pin' });
      return;
    }
    if (command.params.alarmType === 'pin' && command.params.pin < 0) {
      sendJson(res, 400, { status: 'error', message: '引脚闹钟必须提供有效引脚' });
      return;
    }
  }

  if (command.type === 'delete_alarm' && !command.params.alarm) {
    sendJson(res, 400, { status: 'error', message: '请先选择要删除的闹钟' });
    return;
  }

  if (command.type === 'stop_alarm' && !command.params.id) {
    sendJson(res, 400, { status: 'error', message: '请先选择要停止的活跃闹钟' });
    return;
  }

  if (command.type === 'set_rgb_color' && (command.params.r < 0 || command.params.g < 0 || command.params.b < 0)) {
    sendJson(res, 400, { status: 'error', message: 'RGB 颜色值必须在 0 到 255 之间' });
    return;
  }

  if (command.type === 'set_rgb_brightness' && command.params.brightness < 0) {
    sendJson(res, 400, { status: 'error', message: '亮度必须在 0 到 100 之间' });
    return;
  }

  if (command.type === 'set_rgb_mode') {
    if (!['off', 'spectrum', 'preset'].includes(command.params.mode)) {
      sendJson(res, 400, { status: 'error', message: 'RGB 模式必须是 off、spectrum 或 preset' });
      return;
    }
    if (command.params.mode === 'preset' && !['red', 'green', 'blue'].includes(command.params.color)) {
      sendJson(res, 400, { status: 'error', message: 'RGB 预设颜色必须是 red、green 或 blue' });
      return;
    }
  }

  if (command.type === 'set_boot_animation' && ![1, 2].includes(command.params.type)) {
    sendJson(res, 400, { status: 'error', message: '开机动画类型仅支持 1 或 2' });
    return;
  }

  if (command.type === 'canvas_upload') {
    if (command.params.bitmapHex.length !== 2048 || !isHexBitmap(command.params.bitmapHex)) {
      sendJson(res, 400, { status: 'error', message: '画板位图格式无效，应为 128x64 的十六进制位图' });
      return;
    }
  }

  const queued = queueCommand(device, command.type, command.params);
  sendJson(res, 200, { status: 'success', message: '命令已加入队列，等待设备下次心跳拉取', command: queued });
}

function handleAdminDeleteDevice(req, res, params) {
  if (!requireAdmin(req, res)) {
    return;
  }

  const serial = normalizeSerial(params.serial);
  if (!store.devices[serial]) {
    sendJson(res, 404, { status: 'error', message: '未找到该设备' });
    return;
  }

  delete store.devices[serial];
  saveStore();
  sendJson(res, 200, { status: 'success', message: '设备绑定已删除' });
}

function handleAdminDeviceList(req, res) {
  if (!requireAdmin(req, res)) {
    return;
  }

  sendJson(res, 200, {
    status: 'success',
    devices: getDeviceList(),
    serverTime: nowIso()
  });
}

async function handleDeviceHandshake(req, res) {
  const body = await readJsonBody(req, res);
  if (!body) {
    return;
  }

  const serial = normalizeSerial(body.serial);
  if (!serial) {
    sendJson(res, 400, { status: 'error', message: '缺少设备串号' });
    return;
  }

  const device = getDeviceBySerial(serial);
  if (!device) {
    sendJson(res, 403, { status: 'error', message: '貌似没有正确在公网配置设备，请先在管理后台添加这个串号' });
    return;
  }

  if (!device.deviceToken) {
    device.deviceToken = createId('dev');
  }

  device.lastHandshakeAt = nowIso();
  device.firmwareVersion = String(body.firmwareVersion || device.firmwareVersion || '');
  device.mac = String(body.mac || device.mac || '');
  device.wifiIp = String(body.wifiIp || device.wifiIp || '');
  device.wifiSsid = String(body.wifiSsid || device.wifiSsid || '');
  device.alias = resolveDeviceAlias(device.alias, serial, body.alias);
  saveStore();

  sendJson(res, 200, {
    status: 'success',
    message: '握手成功，设备已接入公网平台',
    deviceToken: device.deviceToken,
    alias: device.alias,
    pollIntervalMs: clamp(config.devicePollIntervalMs, 5000, 60000, 8000)
  });
}

async function handleDeviceHeartbeat(req, res) {
  const body = await readJsonBody(req, res);
  if (!body) {
    return;
  }

  const serial = normalizeSerial(body.serial);
  const token = String(body.deviceToken || '').trim();
  if (!serial || !token) {
    sendJson(res, 400, { status: 'error', message: '缺少串号或设备令牌' });
    return;
  }

  const device = getDeviceBySerial(serial);
  if (!device) {
    sendJson(res, 403, { status: 'error', message: '公网平台未配置该设备串号' });
    return;
  }

  if (!device.deviceToken || device.deviceToken !== token) {
    sendJson(res, 401, { status: 'error', message: '设备令牌无效，请重新握手' });
    return;
  }

  applyCommandResults(device, body.pendingResultsJson || body.pendingResults || []);
  updateDeviceHeartbeat(device, body);

  const commands = buildDispatchCommands(device);
  saveStore();

  sendJson(res, 200, {
    status: 'success',
    message: '云端在线，等待下一次控制指令',
    pollIntervalMs: clamp(config.devicePollIntervalMs, 5000, 60000, 8000),
    commands
  });
}

async function handleDeviceReport(req, res) {
  const body = await readJsonBody(req, res);
  if (!body) {
    return;
  }

  const serial = normalizeSerial(body.serial);
  const token = String(body.deviceToken || '').trim();
  if (!serial || !token) {
    sendJson(res, 400, { status: 'error', message: '缺少串号或设备令牌' });
    return;
  }

  const device = getDeviceBySerial(serial);
  if (!device) {
    sendJson(res, 403, { status: 'error', message: '公网平台未配置该设备串号' });
    return;
  }

  if (!device.deviceToken || device.deviceToken !== token) {
    sendJson(res, 401, { status: 'error', message: '设备令牌无效，请重新握手' });
    return;
  }

  applyCommandResults(device, body.resultsJson || body.results || []);
  sendJson(res, 200, { status: 'success', message: '执行结果已收录' });
}

function handleBootstrap(req, res) {
  sendJson(res, 200, {
    status: 'success',
    setupRequired: !store.adminPasswordHash,
    serverTime: nowIso(),
    deviceCount: Object.keys(store.devices).length
  });
}

async function routeRequest(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
  const pathname = requestUrl.pathname;

  if (req.method === 'GET' && pathname === '/api/bootstrap') {
    handleBootstrap(req, res);
    return;
  }

  if (req.method === 'POST' && pathname === '/api/admin/setup') {
    await handleAdminSetup(req, res);
    return;
  }

  if (req.method === 'POST' && pathname === '/api/admin/login') {
    await handleAdminLogin(req, res);
    return;
  }

  if (req.method === 'POST' && pathname === '/api/admin/logout') {
    handleAdminLogout(req, res);
    return;
  }

  if (req.method === 'GET' && pathname === '/api/admin/session') {
    handleAdminSession(req, res);
    return;
  }

  if (req.method === 'GET' && pathname === '/api/admin/devices') {
    handleAdminDeviceList(req, res);
    return;
  }

  if (req.method === 'POST' && pathname === '/api/admin/devices') {
    await handleAdminAddDevice(req, res);
    return;
  }

  let params = matchRoute(pathname, '/api/admin/devices/:serial/alias');
  if (req.method === 'POST' && params) {
    await handleAdminRenameDevice(req, res, params);
    return;
  }

  params = matchRoute(pathname, '/api/admin/devices/:serial/commands');
  if (req.method === 'POST' && params) {
    await handleAdminCommand(req, res, params);
    return;
  }

  params = matchRoute(pathname, '/api/admin/devices/:serial');
  if (req.method === 'DELETE' && params) {
    handleAdminDeleteDevice(req, res, params);
    return;
  }

  if (req.method === 'POST' && pathname === '/api/device/handshake') {
    await handleDeviceHandshake(req, res);
    return;
  }

  if (req.method === 'POST' && pathname === '/api/device/heartbeat') {
    await handleDeviceHeartbeat(req, res);
    return;
  }

  if (req.method === 'POST' && pathname === '/api/device/report') {
    await handleDeviceReport(req, res);
    return;
  }

  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname.replace(/^\//, ''));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendText(res, 403, 'Forbidden');
    return;
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    sendStaticFile(res, filePath);
    return;
  }

  filePath = path.join(PUBLIC_DIR, 'index.html');
  if (fs.existsSync(filePath)) {
    sendStaticFile(res, filePath);
    return;
  }

  sendText(res, 404, 'Not Found');
}

const server = http.createServer((req, res) => {
  routeRequest(req, res).catch(error => {
    console.error('[RemotePlatform] Unhandled error:', error);
    sendJson(res, 500, { status: 'error', message: '服务器内部错误' });
  });
});

server.listen(config.port, config.host, () => {
  console.log('[RemotePlatform] XMaoClock remote control platform started');
  console.log(`[RemotePlatform] Open http://127.0.0.1:${config.port} on this server to complete setup`);
  console.log(`[RemotePlatform] Listening on ${config.host}:${config.port}`);
});

