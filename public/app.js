const state = {
  setupRequired: false,
  loggedIn: false,
  devices: [],
  openCards: new Set(),
  pollTimer: null,
  theme: localStorage.getItem('xmao_remote_theme') || 'dark'
};

const canvasEditors = new Map();

const els = {
  root: document.documentElement,
  serverState: document.getElementById('server-state'),
  setupPanel: document.getElementById('setup-panel'),
  setupForm: document.getElementById('setup-form'),
  setupPassword: document.getElementById('setup-password'),
  loginPanel: document.getElementById('login-panel'),
  loginForm: document.getElementById('login-form'),
  loginPassword: document.getElementById('login-password'),
  dashboardPanel: document.getElementById('dashboard-panel'),
  logoutBtn: document.getElementById('logout-btn'),
  deviceForm: document.getElementById('device-form'),
  deviceSerial: document.getElementById('device-serial'),
  deviceAlias: document.getElementById('device-alias'),
  deviceCount: document.getElementById('device-count'),
  onlineCount: document.getElementById('online-count'),
  deviceGrid: document.getElementById('device-grid'),
  toast: document.getElementById('toast'),
  template: document.getElementById('device-card-template'),
  themeButtons: Array.from(document.querySelectorAll('[data-theme-choice]'))
};

function clamp(value, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  return Math.max(min, Math.min(max, Math.round(num)));
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showToast(message, duration = 2200) {
  if (!els.toast) return;
  els.toast.textContent = message;
  els.toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove('show'), duration);
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `HTTP ${response.status}`);
  return data;
}

function applyTheme(theme) {
  state.theme = theme === 'light' ? 'light' : 'dark';
  els.root.setAttribute('data-theme', state.theme);
  localStorage.setItem('xmao_remote_theme', state.theme);
  els.themeButtons.forEach(button => button.classList.toggle('active', button.dataset.themeChoice === state.theme));
}

function initTheme() {
  applyTheme(state.theme);
  els.themeButtons.forEach(button => {
    button.addEventListener('click', () => applyTheme(button.dataset.themeChoice));
  });
}

function setView() {
  els.setupPanel.classList.toggle('hidden', !state.setupRequired);
  els.loginPanel.classList.toggle('hidden', state.setupRequired || state.loggedIn);
  els.dashboardPanel.classList.toggle('hidden', state.setupRequired || !state.loggedIn);
  els.logoutBtn.classList.toggle('hidden', !state.loggedIn);
  els.serverState.textContent = state.setupRequired ? '等待首次初始化' : state.loggedIn ? '管理后台在线' : '等待登录';
}

function formatAgo(value) {
  if (!value) return '尚未握手';
  const diff = Date.now() - Date.parse(value);
  if (!Number.isFinite(diff) || diff < 0) return value;
  if (diff < 60000) return `${Math.max(1, Math.floor(diff / 1000))} 秒前`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  return `${Math.floor(diff / 86400000)} 天前`;
}

function makeInfoTile(label, value, emphasis = false) {
  return `<div class="info-tile${emphasis ? ' emphasis' : ''}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value || '--')}</strong></div>`;
}

function normalizeAlarmTime(value) {
  const text = String(value || '').trim();
  if (/^\d{2}:\d{2}$/.test(text)) return `${text}:00`;
  return /^\d{2}:\d{2}:\d{2}$/.test(text) ? text : '';
}

function describeAlarm(alarm) {
  const parts = String(alarm || '').split('|');
  const time = parts[0] || '--:--:--';
  if (parts[1] === 'pin') return `${time} · 引脚 ${parts[2] || '--'} · ${parts[3] || '0'} 秒`;
  return `${time} · 蜂鸣器`;
}

function bootAnimationName(type) {
  return Number(type) === 2 ? 'V6.0 酱炫版' : '经典版';
}

function rgbHex(rgb) {
  const toHex = value => clamp(value, 0, 255).toString(16).padStart(2, '0');
  return `#${toHex(rgb && rgb.r)}${toHex(rgb && rgb.g)}${toHex(rgb && rgb.b)}`;
}

function renderHistory(history) {
  if (!history || history.length === 0) return '<div class="history-empty">还没有命令记录。</div>';
  return history.map(item => `
    <div class="history-item ${escapeHtml(item.status || '')}">
      <strong>${escapeHtml(item.type || 'unknown')} · ${escapeHtml(item.status || 'queued')}</strong>
      <div>${escapeHtml(item.resultMessage || '等待设备执行或回报结果')}</div>
      <small>创建时间: ${escapeHtml(item.createdAt || '--')}${item.executedAt ? ` · 执行时间: ${escapeHtml(item.executedAt)}` : ''}</small>
    </div>
  `).join('');
}

function renderScheduledAlarms(device) {
  if (!device.scheduledAlarms || device.scheduledAlarms.length === 0) return '<div class="empty-line">还没有计划闹钟</div>';
  return device.scheduledAlarms.map(alarm => `
    <div class="alarm-chip">
      <span>${escapeHtml(describeAlarm(alarm))}</span>
      <button class="chip-btn delete-alarm-btn" type="button" data-alarm="${escapeHtml(alarm)}">删除</button>
    </div>
  `).join('');
}

function renderActiveAlarms(device) {
  if (!device.activeAlarms || device.activeAlarms.length === 0) return '<div class="empty-line">当前没有正在响铃或执行中的闹钟</div>';
  return device.activeAlarms.map(item => `
    <div class="active-alarm-row">
      <div><strong>${escapeHtml(item.id || '--')}</strong><small>${escapeHtml(item.type === 'pin' ? `引脚 ${item.pin}` : '蜂鸣器')}</small></div>
      <button class="chip-btn stop-alarm-btn" type="button" data-id="${escapeHtml(item.id || '')}">停止</button>
    </div>
  `).join('');
}

function renderPinCards() {
  return `
    <div class="pin-card-grid">
      <form class="pin-form" data-type="start_pin"><h4>定时拉高引脚</h4><label><span>引脚</span><input name="pin" type="number" min="0" max="39" placeholder="13"></label><label><span>秒数</span><input name="seconds" type="number" min="1" max="600" value="3"></label><button class="primary-btn" type="submit">发送 /Start</button></form>
      <form class="pin-form" data-type="open_pin"><h4>保持高电平</h4><label><span>引脚</span><input name="pin" type="number" min="0" max="39" placeholder="13"></label><button class="primary-btn" type="submit">发送 /Open</button></form>
      <form class="pin-form" data-type="close_pin"><h4>拉低引脚</h4><label><span>引脚</span><input name="pin" type="number" min="0" max="39" placeholder="13"></label><button class="primary-btn danger-btn" type="submit">发送 /Close</button></form>
    </div>
  `;
}
function createDeviceCardMarkup(device) {
  const isOpen = state.openCards.has(device.serial);
  const rgb = device.rgb || { r: 0, g: 0, b: 0, brightness: 50, spectrum: false };
  const currentColor = rgbHex(rgb);
  const infoTiles = [
    makeInfoTile('局域网 IP', device.wifiIp || '--'),
    makeInfoTile('当前 WiFi', device.wifiSsid || '--'),
    makeInfoTile('设备时间', device.deviceTime || '--', true),
    makeInfoTile('运行分钟', String(device.uptimeMinutes || 0)),
    makeInfoTile('温度', device.sensor && device.sensor.available ? `${device.sensor.temperature} °C` : '未上报'),
    makeInfoTile('湿度', device.sensor && device.sensor.available ? `${device.sensor.humidity} %` : '未上报'),
    makeInfoTile('设备 MAC', device.mac || '--'),
    makeInfoTile('固件版本', device.firmwareVersion || '--'),
    makeInfoTile('计划闹钟', String((device.scheduledAlarms || []).length)),
    makeInfoTile('活跃闹钟', String((device.activeAlarms || []).length)),
    makeInfoTile('RGB 状态', rgb.spectrum ? '光谱模式' : `${currentColor.toUpperCase()} · ${rgb.brightness}%`),
    makeInfoTile('显示风格', `${bootAnimationName(device.bootAnimationType)}${device.canvasDisplayActive ? ' · 画板显示中' : ''}`)
  ].join('');

  return `
    <article class="device-card" data-serial="${escapeHtml(device.serial)}">
      <button class="device-card-head" type="button">
        <div>
          <div class="device-title-row">
            <h3 class="device-title">${escapeHtml(device.alias || device.serial)}</h3>
            <span class="status-badge ${device.online ? 'online' : 'offline'}">${device.online ? '在线' : '离线'}</span>
          </div>
          <p class="device-serial">${escapeHtml(device.serial)}</p>
        </div>
        <div class="device-meta">
          <span class="device-last-seen">${device.online ? '设备正在在线' : `最后在线: ${escapeHtml(formatAgo(device.lastSeenAt))}`}</span>
          <span class="device-toggle">${isOpen ? '收起' : '展开'}</span>
        </div>
      </button>
      <div class="device-card-body ${isOpen ? '' : 'hidden'}">
        <div class="device-info-grid">${infoTiles}</div>
        <div class="device-sections">
          <section class="device-section span-2">
            <div class="section-head"><div><h4>基础操作</h4><p>重命名、时间同步、重启与联网后热点广播都在这里。</p></div></div>
            <form class="rename-form inline-form"><label><span>重命名</span><input class="rename-input" type="text" value="${escapeHtml(device.alias || '')}" placeholder="修改这个设备的备注名称"></label><button class="secondary-btn" type="submit">保存备注</button></form>
            <div class="action-grid">
              <button class="secondary-btn command-btn" data-type="ping" type="button">在线探测</button>
              <button class="secondary-btn command-btn" data-type="restart" type="button">远程重启</button>
              <button class="secondary-btn command-btn" data-type="sync_time" type="button">同步浏览器时间</button>
              <button class="secondary-btn toggle-ap-btn" type="button">${device.apBroadcastEnabled ? '关闭联网后热点广播' : '开启联网后热点广播'}</button>
            </div>
          </section>
          <section class="device-section">
            <div class="section-head compact"><div><h4>设备风格</h4><p>这里控制开机动画。网页主题在页头切换。</p></div></div>
            <form class="boot-form stack-form compact-stack"><label><span>开机动画</span><select class="boot-type-select"><option value="1" ${Number(device.bootAnimationType) === 1 ? 'selected' : ''}>经典版</option><option value="2" ${Number(device.bootAnimationType) === 2 ? 'selected' : ''}>V6.0 酱炫版</option></select></label><button class="secondary-btn boot-apply-btn" type="submit">保存并重启设备</button></form>
          </section>
          <section class="device-section span-2">
            <div class="section-head"><div><h4>远程闹钟</h4><p>支持蜂鸣器闹钟和定时引脚任务。</p></div><button class="ghost-btn clear-alarms-btn" type="button">清空全部闹钟</button></div>
            <div class="subsection-grid"><div class="sub-card"><h5>计划中的闹钟</h5><div class="alarm-stack">${renderScheduledAlarms(device)}</div></div><div class="sub-card"><h5>当前活跃</h5><div class="alarm-stack">${renderActiveAlarms(device)}</div></div></div>
            <form class="alarm-form field-grid">
              <label><span>时间</span><input name="time" type="time" step="1" required></label>
              <label><span>类型</span><select name="alarmType"><option value="buzzer">蜂鸣器</option><option value="pin">引脚</option></select></label>
              <label><span>引脚</span><input name="pin" type="number" min="0" max="39" placeholder="仅引脚闹钟使用"></label>
              <label><span>持续秒数</span><input name="duration" type="number" min="0" max="86400" value="5"></label>
              <button class="primary-btn add-alarm-btn" type="submit">添加闹钟</button>
            </form>
          </section>
          <section class="device-section span-2">
            <div class="section-head"><div><h4>远程画板</h4><p>在公网后台直接画 128x64 点阵图，设备下次心跳就会显示。</p></div></div>
            <div class="canvas-tools">
              <button class="tool-chip active" type="button" data-tool="draw">画笔</button>
              <button class="tool-chip" type="button" data-tool="erase">橡皮</button>
              <label class="mini-field"><span>笔刷</span><select class="brush-size-select"><option value="1">1px</option><option value="2">2px</option><option value="3">3px</option><option value="4">4px</option></select></label>
              <label class="mini-field"><span>显示秒数</span><input class="canvas-duration-input" type="number" min="0" max="86400" value="60"></label>
              <button class="ghost-btn clear-canvas-btn" type="button">清空</button>
              <button class="secondary-btn upload-canvas-btn" type="button">上传到设备</button>
              <button class="ghost-btn end-canvas-btn" type="button">结束显示</button>
            </div>
            <div class="remote-canvas-shell"><canvas class="remote-canvas" width="384" height="192"></canvas></div>
          </section>
          <section class="device-section span-2">
            <div class="section-head"><div><h4>RGB 与亮度</h4><p>支持颜色、亮度、预设色和光谱模式。</p></div></div>
            <div class="rgb-grid">
              <label><span>颜色</span><input class="rgb-color-input" type="color" value="${escapeHtml(currentColor)}"></label>
              <label><span>亮度 ${escapeHtml(String(rgb.brightness || 0))}%</span><input class="rgb-brightness-input" type="range" min="0" max="100" value="${escapeHtml(String(rgb.brightness || 0))}"></label>
              <button class="secondary-btn apply-rgb-btn" type="button">应用颜色</button>
              <button class="secondary-btn spectrum-rgb-btn" type="button">光谱模式</button>
            </div>
            <div class="preset-row"><button class="chip-btn rgb-preset-btn" type="button" data-color="red">红</button><button class="chip-btn rgb-preset-btn" type="button" data-color="green">绿</button><button class="chip-btn rgb-preset-btn" type="button" data-color="blue">蓝</button><button class="chip-btn rgb-off-btn" type="button">关闭</button></div>
          </section>
          <section class="device-section span-2"><div class="section-head"><div><h4>GPIO 远控</h4><p>通过公网后台直接触发 /Start、/Open、/Close。</p></div></div>${renderPinCards()}</section>
          <section class="device-section span-2 history-box section-history"><div class="history-head"><h4>最近命令记录</h4><button class="ghost-btn delete-device-btn" type="button">删除绑定</button></div><div class="history-list">${renderHistory(device.commandHistory)}</div></section>
        </div>
      </div>
    </article>
  `;
}

function getCanvasState(serial) {
  if (!canvasEditors.has(serial)) {
    canvasEditors.set(serial, { pixels: new Uint8Array(128 * 64), tool: 'draw', brushSize: 1, duration: 60 });
  }
  return canvasEditors.get(serial);
}

function removeStaleCanvasStates() {
  const activeSerials = new Set(state.devices.map(device => device.serial));
  Array.from(canvasEditors.keys()).forEach(serial => {
    if (!activeSerials.has(serial)) canvasEditors.delete(serial);
  });
}

function drawCanvasEditor(editor) {
  if (!editor || !editor.canvas || !editor.ctx) return;
  const { ctx, canvas, pixels } = editor;
  const scale = editor.scale || 3;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#07101c';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#f4fbff';
  for (let y = 0; y < 64; y += 1) {
    for (let x = 0; x < 128; x += 1) {
      if (pixels[y * 128 + x]) ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= 128; x += 8) {
    ctx.beginPath();
    ctx.moveTo(x * scale + 0.5, 0);
    ctx.lineTo(x * scale + 0.5, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y <= 64; y += 8) {
    ctx.beginPath();
    ctx.moveTo(0, y * scale + 0.5);
    ctx.lineTo(canvas.width, y * scale + 0.5);
    ctx.stroke();
  }
}

function paintEditor(editor, clientX, clientY) {
  const rect = editor.canvas.getBoundingClientRect();
  const scaleX = editor.canvas.width / rect.width;
  const scaleY = editor.canvas.height / rect.height;
  const x = Math.floor(((clientX - rect.left) * scaleX) / editor.scale);
  const y = Math.floor(((clientY - rect.top) * scaleY) / editor.scale);
  const brush = clamp(editor.brushSize, 1, 4);
  for (let offsetY = 0; offsetY < brush; offsetY += 1) {
    for (let offsetX = 0; offsetX < brush; offsetX += 1) {
      const px = x + offsetX;
      const py = y + offsetY;
      if (px < 0 || px >= 128 || py < 0 || py >= 64) continue;
      editor.pixels[py * 128 + px] = editor.tool === 'erase' ? 0 : 1;
    }
  }
  drawCanvasEditor(editor);
}

function packCanvasHex(pixels) {
  let output = '';
  for (let byteIndex = 0; byteIndex < 1024; byteIndex += 1) {
    let byte = 0;
    for (let bit = 0; bit < 8; bit += 1) {
      if (pixels[byteIndex * 8 + bit]) byte |= (1 << bit);
    }
    output += byte.toString(16).padStart(2, '0');
  }
  return output;
}
function bindCanvasEditor(card, device) {
  const serial = device.serial;
  const canvas = card.querySelector('.remote-canvas');
  if (!canvas) return;

  const editor = getCanvasState(serial);
  editor.canvas = canvas;
  editor.ctx = canvas.getContext('2d');
  editor.scale = 3;

  const durationInput = card.querySelector('.canvas-duration-input');
  const brushSizeSelect = card.querySelector('.brush-size-select');
  const toolButtons = card.querySelectorAll('.tool-chip');

  durationInput.value = String(editor.duration || 60);
  brushSizeSelect.value = String(editor.brushSize || 1);
  toolButtons.forEach(button => button.classList.toggle('active', button.dataset.tool === editor.tool));

  durationInput.addEventListener('change', () => {
    editor.duration = clamp(durationInput.value, 0, 86400);
    durationInput.value = String(editor.duration);
  });

  brushSizeSelect.addEventListener('change', () => {
    editor.brushSize = clamp(brushSizeSelect.value, 1, 4);
  });

  toolButtons.forEach(button => {
    button.addEventListener('click', () => {
      editor.tool = button.dataset.tool === 'erase' ? 'erase' : 'draw';
      toolButtons.forEach(item => item.classList.toggle('active', item === button));
    });
  });

  const stopDrawing = () => {
    editor.drawing = false;
    if (editor.pointerId !== undefined) canvas.releasePointerCapture?.(editor.pointerId);
  };

  canvas.addEventListener('pointerdown', event => {
    editor.pointerId = event.pointerId;
    editor.drawing = true;
    canvas.setPointerCapture?.(event.pointerId);
    paintEditor(editor, event.clientX, event.clientY);
  });
  canvas.addEventListener('pointermove', event => {
    if (editor.drawing) paintEditor(editor, event.clientX, event.clientY);
  });
  canvas.addEventListener('pointerup', stopDrawing);
  canvas.addEventListener('pointerleave', stopDrawing);
  canvas.addEventListener('pointercancel', stopDrawing);

  card.querySelector('.clear-canvas-btn').addEventListener('click', () => {
    editor.pixels.fill(0);
    drawCanvasEditor(editor);
  });

  card.querySelector('.upload-canvas-btn').addEventListener('click', async () => {
    try {
      editor.duration = clamp(durationInput.value, 0, 86400);
      await sendCommand(serial, 'canvas_upload', {
        bitmapHex: packCanvasHex(editor.pixels),
        duration: editor.duration
      });
    } catch (error) {
      showToast(error.message);
    }
  });

  card.querySelector('.end-canvas-btn').addEventListener('click', async () => {
    try {
      await sendCommand(serial, 'canvas_end', {});
    } catch (error) {
      showToast(error.message);
    }
  });

  drawCanvasEditor(editor);
}

async function sendCommand(serial, type, params = {}) {
  const data = await request(`/api/admin/devices/${encodeURIComponent(serial)}/commands`, {
    method: 'POST',
    body: JSON.stringify({ type, params })
  });
  showToast(data.message || '命令已发送');
  await loadDevices();
}

function bindDeviceCardEvents(card, device) {
  const head = card.querySelector('.device-card-head');
  const body = card.querySelector('.device-card-body');
  const toggleText = card.querySelector('.device-toggle');

  head.addEventListener('click', () => {
    if (state.openCards.has(device.serial)) {
      state.openCards.delete(device.serial);
      body.classList.add('hidden');
      toggleText.textContent = '展开';
    } else {
      state.openCards.add(device.serial);
      body.classList.remove('hidden');
      toggleText.textContent = '收起';
      bindCanvasEditor(card, device);
    }
  });

  card.querySelector('.rename-form').addEventListener('submit', async event => {
    event.preventDefault();
    try {
      const alias = card.querySelector('.rename-input').value.trim();
      const data = await request(`/api/admin/devices/${encodeURIComponent(device.serial)}/alias`, {
        method: 'POST',
        body: JSON.stringify({ alias })
      });
      showToast(data.message || '备注已更新');
      await loadDevices();
    } catch (error) {
      showToast(error.message);
    }
  });

  card.querySelectorAll('.command-btn').forEach(button => {
    button.addEventListener('click', async () => {
      try {
        if (button.dataset.type === 'sync_time') {
          await sendCommand(device.serial, 'sync_time', {
            epochMs: Date.now(),
            timezoneOffsetMinutes: new Date().getTimezoneOffset()
          });
        } else {
          await sendCommand(device.serial, button.dataset.type, {});
        }
      } catch (error) {
        showToast(error.message);
      }
    });
  });

  card.querySelector('.toggle-ap-btn').addEventListener('click', async () => {
    try {
      await sendCommand(device.serial, 'set_ap_broadcast', { enabled: !device.apBroadcastEnabled });
    } catch (error) {
      showToast(error.message);
    }
  });

  card.querySelectorAll('.pin-form').forEach(form => {
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const formData = new FormData(form);
      const type = form.dataset.type;
      const params = { pin: Number(formData.get('pin')) };
      if (type === 'start_pin') params.seconds = Number(formData.get('seconds') || 3);
      try {
        await sendCommand(device.serial, type, params);
      } catch (error) {
        showToast(error.message);
      }
    });
  });

  card.querySelector('.alarm-form').addEventListener('submit', async event => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const time = normalizeAlarmTime(formData.get('time'));
    if (!time) {
      showToast('闹钟时间格式必须是 HH:MM:SS');
      return;
    }
    try {
      await sendCommand(device.serial, 'add_alarm', {
        time,
        alarmType: String(formData.get('alarmType') || 'buzzer'),
        pin: Number(formData.get('pin') || 0),
        duration: Number(formData.get('duration') || 0)
      });
    } catch (error) {
      showToast(error.message);
    }
  });

  const alarmTypeSelect = card.querySelector('.alarm-form select[name="alarmType"]');
  const alarmPinInput = card.querySelector('.alarm-form input[name="pin"]');
  const alarmDurationInput = card.querySelector('.alarm-form input[name="duration"]');
  const syncAlarmForm = () => {
    const isPinMode = alarmTypeSelect.value === 'pin';
    alarmPinInput.disabled = !isPinMode;
    alarmDurationInput.disabled = !isPinMode;
    alarmPinInput.placeholder = isPinMode ? '例如 13' : '蜂鸣器闹钟无需填写';
  };
  alarmTypeSelect.addEventListener('change', syncAlarmForm);
  syncAlarmForm();

  card.querySelector('.clear-alarms-btn').addEventListener('click', async () => {
    if (!window.confirm('确定要清空这个设备上的全部计划闹钟吗？')) return;
    try {
      await sendCommand(device.serial, 'clear_alarms', {});
    } catch (error) {
      showToast(error.message);
    }
  });

  card.querySelectorAll('.delete-alarm-btn').forEach(button => {
    button.addEventListener('click', async () => {
      try {
        await sendCommand(device.serial, 'delete_alarm', { alarm: button.dataset.alarm || '' });
      } catch (error) {
        showToast(error.message);
      }
    });
  });

  card.querySelectorAll('.stop-alarm-btn').forEach(button => {
    button.addEventListener('click', async () => {
      try {
        await sendCommand(device.serial, 'stop_alarm', { id: button.dataset.id || '' });
      } catch (error) {
        showToast(error.message);
      }
    });
  });
  card.querySelector('.boot-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (!window.confirm('切换开机动画后设备会自动重启，确定继续吗？')) return;
    try {
      await sendCommand(device.serial, 'set_boot_animation', {
        type: Number(card.querySelector('.boot-type-select').value || 1)
      });
    } catch (error) {
      showToast(error.message);
    }
  });

  const rgbColorInput = card.querySelector('.rgb-color-input');
  const rgbBrightnessInput = card.querySelector('.rgb-brightness-input');
  const rgbBrightnessLabel = rgbBrightnessInput.closest('label')?.querySelector('span');
  rgbBrightnessInput.addEventListener('input', () => {
    if (rgbBrightnessLabel) {
      rgbBrightnessLabel.textContent = `亮度 ${rgbBrightnessInput.value}%`;
    }
  });

  card.querySelector('.apply-rgb-btn').addEventListener('click', async () => {
    const color = rgbColorInput.value || '#000000';
    try {
      await sendCommand(device.serial, 'set_rgb_color', {
        r: parseInt(color.slice(1, 3), 16),
        g: parseInt(color.slice(3, 5), 16),
        b: parseInt(color.slice(5, 7), 16)
      });
    } catch (error) {
      showToast(error.message);
    }
  });

  rgbBrightnessInput.addEventListener('change', async () => {
    try {
      await sendCommand(device.serial, 'set_rgb_brightness', {
        brightness: Number(rgbBrightnessInput.value || 0)
      });
    } catch (error) {
      showToast(error.message);
    }
  });

  card.querySelector('.spectrum-rgb-btn').addEventListener('click', async () => {
    try {
      await sendCommand(device.serial, 'set_rgb_mode', { mode: 'spectrum' });
    } catch (error) {
      showToast(error.message);
    }
  });

  card.querySelectorAll('.rgb-preset-btn').forEach(button => {
    button.addEventListener('click', async () => {
      try {
        await sendCommand(device.serial, 'set_rgb_mode', {
          mode: 'preset',
          color: button.dataset.color
        });
      } catch (error) {
        showToast(error.message);
      }
    });
  });

  card.querySelector('.rgb-off-btn').addEventListener('click', async () => {
    try {
      await sendCommand(device.serial, 'set_rgb_mode', { mode: 'off' });
    } catch (error) {
      showToast(error.message);
    }
  });

  card.querySelector('.delete-device-btn').addEventListener('click', async () => {
    if (!window.confirm(`确定要删除设备 ${device.serial} 的绑定吗？`)) return;
    try {
      const data = await request(`/api/admin/devices/${encodeURIComponent(device.serial)}`, { method: 'DELETE' });
      state.openCards.delete(device.serial);
      canvasEditors.delete(device.serial);
      showToast(data.message || '设备已删除');
      await loadDevices();
    } catch (error) {
      showToast(error.message);
    }
  });

  if (state.openCards.has(device.serial)) bindCanvasEditor(card, device);
}

function renderDevices() {
  els.deviceGrid.innerHTML = '';
  els.deviceCount.textContent = String(state.devices.length);
  els.onlineCount.textContent = String(state.devices.filter(device => device.online).length);
  removeStaleCanvasStates();

  if (state.devices.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'hint-box';
    empty.textContent = '还没有任何设备。先添加一个设备串号，再去物理设备的本地网页里填写公网地址。';
    els.deviceGrid.appendChild(empty);
    return;
  }

  state.devices.forEach(device => {
    const wrapper = els.template.content.firstElementChild.cloneNode(true);
    wrapper.innerHTML = createDeviceCardMarkup(device);
    const article = wrapper.firstElementChild || wrapper;
    bindDeviceCardEvents(article, device);
    els.deviceGrid.appendChild(article);
  });
}

async function loadDevices() {
  if (!state.loggedIn) return;
  const data = await request('/api/admin/devices');
  state.devices = data.devices || [];
  renderDevices();
}

async function bootstrap() {
  const data = await request('/api/bootstrap');
  state.setupRequired = !!data.setupRequired;
  setView();

  if (!state.setupRequired) {
    try {
      await request('/api/admin/session');
      state.loggedIn = true;
      setView();
      await loadDevices();
      startPolling();
    } catch (error) {
      state.loggedIn = false;
      setView();
    }
  }
}

function startPolling() {
  clearInterval(state.pollTimer);
  state.pollTimer = setInterval(() => {
    loadDevices().catch(error => {
      if (error.message.includes('登录')) {
        state.loggedIn = false;
        clearInterval(state.pollTimer);
        setView();
      }
    });
  }, 5000);
}

els.setupForm.addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const data = await request('/api/admin/setup', {
      method: 'POST',
      body: JSON.stringify({ password: els.setupPassword.value })
    });
    showToast(data.message || '密码设置成功');
    els.setupPassword.value = '';
    state.setupRequired = false;
    setView();
  } catch (error) {
    showToast(error.message);
  }
});
els.loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const data = await request('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ password: els.loginPassword.value })
    });
    showToast(data.message || '登录成功');
    els.loginPassword.value = '';
    state.loggedIn = true;
    setView();
    await loadDevices();
    startPolling();
  } catch (error) {
    showToast(error.message);
  }
});

els.logoutBtn.addEventListener('click', async () => {
  try {
    await request('/api/admin/logout', { method: 'POST' });
  } catch (error) {
    console.warn(error);
  }
  clearInterval(state.pollTimer);
  state.loggedIn = false;
  state.devices = [];
  renderDevices();
  setView();
});

els.deviceForm.addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const data = await request('/api/admin/devices', {
      method: 'POST',
      body: JSON.stringify({
        serial: els.deviceSerial.value,
        alias: els.deviceAlias.value
      })
    });
    showToast(data.message || '设备已添加');
    els.deviceSerial.value = '';
    els.deviceAlias.value = '';
    await loadDevices();
  } catch (error) {
    showToast(error.message);
  }
});

initTheme();
bootstrap().catch(error => {
  showToast(error.message || '平台初始化失败');
  els.serverState.textContent = '初始化失败';
});
