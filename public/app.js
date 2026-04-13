const state = {
  setupRequired: false,
  loggedIn: false,
  devices: [],
  openCards: new Set(),
  pollTimer: null,
  theme: localStorage.getItem('xmao_remote_theme') || 'light',
  currentModal: null
};

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
  commandModal: document.getElementById('command-modal'),
  commandModalTitle: document.getElementById('command-modal-title'),
  commandModalTag: document.getElementById('command-modal-tag'),
  commandModalSubtitle: document.getElementById('command-modal-subtitle'),
  commandModalBody: document.getElementById('command-modal-body'),
  commandModalClose: document.getElementById('command-modal-close'),
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

function showToast(message, duration = 2400) {
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
  els.serverState.textContent = state.setupRequired ? '等待首次设置' : state.loggedIn ? '已登录，可管理设备' : '等待登录';
}

function formatAgo(value) {
  if (!value) return '还没有首次连接';
  const diff = Date.now() - Date.parse(value);
  if (!Number.isFinite(diff) || diff < 0) return value;
  if (diff < 60000) return `${Math.max(1, Math.floor(diff / 1000))} 秒前`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
  return `${Math.floor(diff / 86400000)} 天前`;
}

function makeInfoTile(label, value, emphasis = false, mono = true) {
  return `<div class="info-tile${emphasis ? ' emphasis' : ''}"><span>${escapeHtml(label)}</span><strong class="${mono ? 'mono' : ''}">${escapeHtml(value || '--')}</strong></div>`;
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

function commandTypeLabel(type) {
  const labels = {
    add_alarm: '添加闹钟',
    delete_alarm: '删除闹钟',
    clear_alarms: '清空闹钟',
    stop_alarm: '停止闹钟',
    piano_play_note: '钢琴单音',
    piano_play_melody: '播放旋律',
    storage_write_text: '写入文件',
    storage_delete_file: '删除文件',
    start_pin: '引脚定时激活',
    open_pin: '引脚保持开启',
    close_pin: '引脚立即关闭'
  };
  return labels[type] || type || '未知任务';
}

function commandStatusLabel(status) {
  if (status === 'queued') return '已进入队列';
  if (status === 'sent') return '已投递，等待设备开始执行';
  if (status === 'processing') return '设备已接收，正在处理';
  if (status === 'success') return '已执行成功';
  if (status === 'error') return '执行失败';
  if (status === 'cancelled') return '已取消';
  return status || '未知状态';
}

function renderHistory(history) {
  if (!history || history.length === 0) return '<div class="history-empty">这里还没有任务记录，等你第一次下发任务后就会显示。</div>';
  return history.map(item => `
    <div class="history-item ${escapeHtml(item.status || '')}">
      <strong>${escapeHtml(commandTypeLabel(item.type || 'unknown'))} · ${escapeHtml(commandStatusLabel(item.status || 'queued'))}</strong>
      <div>${escapeHtml(item.resultMessage || '任务已进入流程，等待设备后续反馈。')}</div>
      <small>任务ID: ${escapeHtml(item.id || '--')} · 创建时间: ${escapeHtml(item.createdAt || '--')}${item.dispatchedAt ? ` · 最近投递: ${escapeHtml(item.dispatchedAt)}` : ''}${item.processingAt ? ` · 开始处理: ${escapeHtml(item.processingAt)}` : ''}${item.executedAt ? ` · 完成时间: ${escapeHtml(item.executedAt)}` : ''}</small>
    </div>
  `).join('');
}

function renderPendingTasks(device) {
  const tasks = Array.isArray(device.pendingTasks) ? device.pendingTasks : [];
  if (tasks.length === 0) return '<div class="history-empty">当前没有待执行任务。</div>';
  return tasks.map(task => `
    <div class="history-item ${escapeHtml(task.status || '')}">
      <strong>${escapeHtml(commandTypeLabel(task.type))} · ${escapeHtml(commandStatusLabel(task.status || 'queued'))}</strong>
      <div>${escapeHtml(task.resultMessage || '等待设备通过任务 API 拉取。')}</div>
      <small>任务ID: ${escapeHtml(task.id || '--')} · 创建时间: ${escapeHtml(task.createdAt || '--')}${task.dispatchedAt ? ` · 最近投递: ${escapeHtml(task.dispatchedAt)}` : ''}${task.processingAt ? ` · 开始处理: ${escapeHtml(task.processingAt)}` : ''}</small>
      <div class="task-action-row"><button class="chip-btn danger-chip-btn" type="button" data-cancel-task="${escapeHtml(task.id || '')}">取消这条任务</button></div>
    </div>
  `).join('');
}

function renderScheduledAlarms(device) {
  if (!device.scheduledAlarms || device.scheduledAlarms.length === 0) return '<div class="empty-line">还没有设置计划闹钟</div>';
  return device.scheduledAlarms.map(alarm => `
    <div class="alarm-chip">
      <span>${escapeHtml(describeAlarm(alarm))}</span>
      <button class="chip-btn delete-alarm-btn" type="button" data-alarm="${escapeHtml(alarm)}">删除</button>
    </div>
  `).join('');
}

function renderActiveAlarms(device) {
  if (!device.activeAlarms || device.activeAlarms.length === 0) return '<div class="empty-line">当前没有正在执行或响铃的闹钟</div>';
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
      <form class="pin-form" data-type="start_pin"><div class="section-tag">定时触发</div><h4>让引脚保持一段时间的高电平</h4><label><span>引脚</span><input name="pin" type="number" min="0" max="39" placeholder="13"></label><label><span>持续秒数</span><input name="seconds" type="number" min="1" max="600" value="3"></label><button class="primary-btn" type="submit">加入定时激活任务</button></form>
      <form class="pin-form" data-type="open_pin"><div class="section-tag">保持开启</div><h4>把引脚直接切换到高电平</h4><label><span>引脚</span><input name="pin" type="number" min="0" max="39" placeholder="13"></label><button class="secondary-btn" type="submit">加入打开任务</button></form>
      <form class="pin-form" data-type="close_pin"><div class="section-tag">立即关闭</div><h4>把引脚切换回低电平</h4><label><span>引脚</span><input name="pin" type="number" min="0" max="39" placeholder="13"></label><button class="danger-ghost-btn" type="submit">加入关闭任务</button></form>
    </div>
  `;
}

function getStateDevice(serial) {
  return state.devices.find(device => device.serial === serial) || null;
}

function commandSectionMeta(section) {
  if (section === 'alarm') {
    return {
      tag: '闹钟任务',
      title: '闹钟管理',
      subtitle: '支持添加、删除、清空和停止当前活跃闹钟。'
    };
  }
  if (section === 'piano') {
    return {
      tag: '钢琴任务',
      title: '钢琴与旋律',
      subtitle: '支持播放单个音符，或者触发设备里已保存的旋律。'
    };
  }
  if (section === 'storage') {
    return {
      tag: '存储任务',
      title: 'LittleFS 存储',
      subtitle: '可以远程写入文本文件，或删除指定文件。'
    };
  }
  return {
    tag: '引脚任务',
    title: '引脚激活',
    subtitle: '支持定时拉高、保持高电平、以及立即关闭三种模式。'
  };
}

function renderSectionLauncherGrid(device) {
  const items = [
    { key: 'alarm', title: '闹钟管理', desc: `${(device.scheduledAlarms || []).length} 条计划 / ${(device.activeAlarms || []).length} 条活跃` },
    { key: 'piano', title: '钢琴与旋律', desc: '播放单音或触发已保存旋律' },
    { key: 'storage', title: 'LittleFS 存储', desc: '远程写入文本文件或删除文件' },
    { key: 'pin', title: '引脚激活', desc: '定时拉高、保持开启、立即关闭' }
  ];

  return `
    <div class="section-launcher-grid">
      ${items.map(item => `
        <button class="section-launcher-btn" type="button" data-open-section="${escapeHtml(item.key)}">
          <span class="section-launcher-title">${escapeHtml(item.title)}</span>
          <span class="section-launcher-desc">${escapeHtml(item.desc)}</span>
        </button>
      `).join('')}
    </div>
  `;
}

function renderAlarmModal(device) {
  return `
    <div class="modal-stack">
      <div class="subsection-grid">
        <div class="sub-card">
          <h5>计划中的闹钟</h5>
          <div class="alarm-stack">${renderScheduledAlarms(device)}</div>
        </div>
        <div class="sub-card">
          <h5>当前活跃</h5>
          <div class="alarm-stack">${renderActiveAlarms(device)}</div>
        </div>
      </div>
      <form class="modal-alarm-form field-grid">
        <label><span>时间</span><input name="time" type="time" step="1" required></label>
        <label><span>类型</span><select name="alarmType"><option value="buzzer">蜂鸣器</option><option value="pin">引脚</option></select></label>
        <label><span>引脚</span><input name="pin" type="number" min="0" max="39" placeholder="仅引脚闹钟使用"></label>
        <label><span>持续秒数</span><input name="duration" type="number" min="0" max="86400" value="5"></label>
        <button class="primary-btn" type="submit">加入闹钟任务</button>
      </form>
      <button class="ghost-btn modal-clear-alarms-btn" type="button">清空全部闹钟</button>
    </div>
  `;
}

function renderPianoModal() {
  const notes = ['C3', 'D3', 'E3', 'F3', 'G3', 'A3', 'B3', 'C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5'];
  return `
    <div class="modal-stack">
      <form class="piano-note-form field-grid">
        <label><span>音符</span><select name="note">${notes.map(note => `<option value="${note}">${note}</option>`).join('')}</select></label>
        <label><span>持续毫秒</span><input name="durationMs" type="number" min="50" max="20000" value="500"></label>
        <button class="primary-btn" type="submit">加入单音任务</button>
      </form>
      <form class="piano-melody-form stack-form compact-stack">
        <label><span>旋律名称</span><input name="name" type="text" placeholder="例如 经典闹钟"></label>
        <button class="secondary-btn" type="submit">加入旋律播放任务</button>
        <div class="empty-line">设备内置预设通常包括：欢快三连音、简单音阶上行、经典闹钟</div>
      </form>
    </div>
  `;
}

function renderStorageModal() {
  return `
    <div class="modal-stack">
      <form class="storage-write-form stack-form">
        <label><span>文件名</span><input name="fileName" type="text" placeholder="memo.txt"></label>
        <label><span>文本内容</span><textarea name="content" rows="8" placeholder="输入要写入 LittleFS 的内容"></textarea></label>
        <button class="primary-btn" type="submit">写入或覆盖文件</button>
      </form>
      <form class="storage-delete-form stack-form compact-stack">
        <label><span>要删除的文件名</span><input name="fileName" type="text" placeholder="memo.txt"></label>
        <button class="danger-ghost-btn" type="submit">删除文件</button>
      </form>
    </div>
  `;
}

function renderPinModal() {
  return renderPinCards();
}

function renderCommandModalContent(device, section) {
  if (section === 'alarm') return renderAlarmModal(device);
  if (section === 'piano') return renderPianoModal();
  if (section === 'storage') return renderStorageModal();
  return renderPinModal();
}

function closeCommandModal() {
  state.currentModal = null;
  els.commandModal.classList.add('hidden');
  els.commandModal.setAttribute('aria-hidden', 'true');
  els.commandModalBody.innerHTML = '';
}

async function cancelTask(serial, taskId) {
  const data = await request(`/api/admin/devices/${encodeURIComponent(serial)}/tasks/${encodeURIComponent(taskId)}`, {
    method: 'DELETE'
  });
  showToast(data.message || '任务已取消');
  await loadDevices({ refreshModal: true });
}

async function cancelAllTasks(serial) {
  const data = await request(`/api/admin/devices/${encodeURIComponent(serial)}/tasks`, {
    method: 'DELETE'
  });
  showToast(data.message || '任务已全部取消');
  await loadDevices({ refreshModal: true });
}

function bindModalSectionEvents(device, section) {
  const root = els.commandModalBody;
  if (!root) return;

  if (section === 'alarm') {
    const form = root.querySelector('.modal-alarm-form');
    form?.addEventListener('submit', async event => {
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

    const alarmTypeSelect = root.querySelector('.modal-alarm-form select[name="alarmType"]');
    const alarmPinInput = root.querySelector('.modal-alarm-form input[name="pin"]');
    const alarmDurationInput = root.querySelector('.modal-alarm-form input[name="duration"]');
    const syncAlarmForm = () => {
      const isPinMode = alarmTypeSelect && alarmTypeSelect.value === 'pin';
      if (alarmPinInput) {
        alarmPinInput.disabled = !isPinMode;
        alarmPinInput.placeholder = isPinMode ? '例如 13' : '蜂鸣器闹钟无需填写';
      }
      if (alarmDurationInput) {
        alarmDurationInput.disabled = !isPinMode;
      }
    };
    alarmTypeSelect?.addEventListener('change', syncAlarmForm);
    syncAlarmForm();

    root.querySelector('.modal-clear-alarms-btn')?.addEventListener('click', async () => {
      if (!window.confirm('确定要清空这个设备上的全部计划闹钟吗？')) return;
      try {
        await sendCommand(device.serial, 'clear_alarms', {});
      } catch (error) {
        showToast(error.message);
      }
    });

    root.querySelectorAll('.delete-alarm-btn').forEach(button => {
      button.addEventListener('click', async () => {
        try {
          await sendCommand(device.serial, 'delete_alarm', { alarm: button.dataset.alarm || '' });
        } catch (error) {
          showToast(error.message);
        }
      });
    });

    root.querySelectorAll('.stop-alarm-btn').forEach(button => {
      button.addEventListener('click', async () => {
        try {
          await sendCommand(device.serial, 'stop_alarm', { id: button.dataset.id || '' });
        } catch (error) {
          showToast(error.message);
        }
      });
    });
    return;
  }

  if (section === 'piano') {
    root.querySelector('.piano-note-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      try {
        await sendCommand(device.serial, 'piano_play_note', {
          note: String(formData.get('note') || 'C4'),
          durationMs: Number(formData.get('durationMs') || 500)
        });
      } catch (error) {
        showToast(error.message);
      }
    });

    root.querySelector('.piano-melody-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      try {
        await sendCommand(device.serial, 'piano_play_melody', {
          name: String(formData.get('name') || '').trim()
        });
      } catch (error) {
        showToast(error.message);
      }
    });
    return;
  }

  if (section === 'storage') {
    root.querySelector('.storage-write-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      try {
        await sendCommand(device.serial, 'storage_write_text', {
          fileName: String(formData.get('fileName') || '').trim(),
          content: String(formData.get('content') || '')
        });
      } catch (error) {
        showToast(error.message);
      }
    });

    root.querySelector('.storage-delete-form')?.addEventListener('submit', async event => {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      if (!window.confirm('确定要删除这个文件吗？')) return;
      try {
        await sendCommand(device.serial, 'storage_delete_file', {
          fileName: String(formData.get('fileName') || '').trim()
        });
      } catch (error) {
        showToast(error.message);
      }
    });
    return;
  }

  root.querySelectorAll('.pin-form').forEach(form => {
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
}

function openCommandModal(device, section) {
  const meta = commandSectionMeta(section);
  state.currentModal = { serial: device.serial, section };
  els.commandModalTag.textContent = meta.tag;
  els.commandModalTitle.textContent = `${device.alias || device.serial} · ${meta.title}`;
  els.commandModalSubtitle.textContent = meta.subtitle;
  els.commandModalBody.innerHTML = renderCommandModalContent(device, section);
  els.commandModal.classList.remove('hidden');
  els.commandModal.setAttribute('aria-hidden', 'false');
  bindModalSectionEvents(device, section);
}

function createDeviceCardMarkup(device) {
  const isOpen = state.openCards.has(device.serial);
  const queueCount = Number(device.pendingQueueCount || 0);
  const onlineText = device.online ? '设备在线' : '设备离线';
  const queueText = queueCount > 0 ? `${queueCount} 条待执行任务` : '当前没有待执行任务';
  const wifiName = device.wifiSsid || '未连接 WiFi';
  const tempText = device.sensor && device.sensor.available ? `${device.sensor.temperature} °C` : '未上报';
  const humidityText = device.sensor && device.sensor.available ? `${device.sensor.humidity} %` : '未上报';
  const infoTiles = [
    makeInfoTile('局域网 IP', device.wifiIp || '--'),
    makeInfoTile('当前 WiFi', device.wifiSsid || '--', false, false),
    makeInfoTile('设备时间', device.deviceTime || '--', true),
    makeInfoTile('运行分钟', String(device.uptimeMinutes || 0)),
    makeInfoTile('温度', tempText),
    makeInfoTile('湿度', humidityText),
    makeInfoTile('设备 MAC', device.mac || '--'),
    makeInfoTile('固件版本', device.firmwareVersion || '--', false, false),
    makeInfoTile('计划闹钟', String((device.scheduledAlarms || []).length)),
    makeInfoTile('活跃闹钟', String((device.activeAlarms || []).length)),
    makeInfoTile('待执行任务', String(queueCount), queueCount > 0)
  ].join('');

  return `
    <article class="device-card" data-serial="${escapeHtml(device.serial)}">
      <button class="device-card-head" type="button">
        <div class="device-head-main">
          <div class="device-head-top">
            <span class="status-pill ${device.online ? 'online' : 'offline'}">${onlineText}</span>
            <span class="queue-badge ${queueCount > 0 ? 'active' : ''}">${queueText}</span>
          </div>
          <h3 class="device-title">${escapeHtml(device.alias || '未命名设备')}</h3>
          <div class="device-subline">
            <span class="device-serial mono">${escapeHtml(device.serial)}</span>
            <span class="device-divider"></span>
            <span class="device-last-seen">${device.online ? '最近一次心跳正常，设备可以同步任务' : `最后在线 ${escapeHtml(formatAgo(device.lastSeenAt))}`}</span>
          </div>
          <div class="device-quick-list">
            <div class="device-quick-chip"><span>当前网络</span><strong>${escapeHtml(wifiName)}</strong></div>
            <div class="device-quick-chip"><span>设备时间</span><strong class="mono">${escapeHtml(device.deviceTime || '--')}</strong></div>
            <div class="device-quick-chip"><span>环境数据</span><strong>${escapeHtml(`${tempText} / ${humidityText}`)}</strong></div>
          </div>
        </div>
        <div class="device-head-side">
          <div class="signal-stack">
            <span>局域网地址</span>
            <strong class="mono">${escapeHtml(device.wifiIp || '--')}</strong>
            <small>${device.online ? '设备会定时上报状态，并通过 GET 任务 API 拉取待执行任务' : '设备离线时，任务会继续保留在 tasks.json 队列中'}</small>
          </div>
          <span class="device-toggle">${isOpen ? '收起详情' : '展开详情'}</span>
        </div>
      </button>
      <div class="device-card-body ${isOpen ? '' : 'hidden'}">
        <div class="device-info-grid">${infoTiles}</div>
        <div class="device-sections">
          <section class="device-section span-2">
            <div class="section-head">
              <div>
                <div class="section-tag">远程任务</div>
                <h4>只保留四类任务入口</h4>
                <p>当前网页端只支持闹钟、钢琴、存储、引脚激活四种模式，其余入口已经收掉。</p>
              </div>
            </div>
            ${renderSectionLauncherGrid(device)}
          </section>
          <section class="device-section history-box">
            <div class="history-head">
              <div><div class="section-tag">待执行任务</div><h4>当前任务队列</h4></div>
              <button class="ghost-btn task-clear-btn" type="button" data-clear-all-tasks="1" ${queueCount > 0 ? '' : 'disabled'}>全部取消</button>
            </div>
            <div class="history-list">${renderPendingTasks(device)}</div>
          </section>
          <section class="device-section history-box">
            <div class="history-head"><div><div class="section-tag">执行记录</div><h4>最近任务记录</h4></div><span class="history-tip">任务完成后会从队列删除，并保留在这里。</span></div>
            <div class="history-list">${renderHistory(device.commandHistory)}</div>
          </section>
        </div>
      </div>
    </article>
  `;
}

async function sendCommand(serial, type, params = {}) {
  const data = await request(`/api/admin/devices/${encodeURIComponent(serial)}/commands`, {
    method: 'POST',
    body: JSON.stringify({ type, params })
  });
  showToast(data.message || '任务已发送');
  await loadDevices({ refreshModal: true });
  return data;
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
    }
  });

  card.querySelectorAll('[data-open-section]').forEach(button => {
    button.addEventListener('click', () => {
      openCommandModal(device, button.dataset.openSection);
    });
  });

  card.querySelectorAll('[data-cancel-task]').forEach(button => {
    button.addEventListener('click', async event => {
      event.stopPropagation();
      const taskId = button.dataset.cancelTask;
      if (!taskId) return;
      if (!window.confirm(`确定要取消任务 ${taskId} 吗？`)) return;
      try {
        await cancelTask(device.serial, taskId);
      } catch (error) {
        showToast(error.message);
      }
    });
  });

  card.querySelector('[data-clear-all-tasks]')?.addEventListener('click', async event => {
    event.stopPropagation();
    if (!window.confirm('确定要取消这个设备当前全部待执行任务吗？')) return;
    try {
      await cancelAllTasks(device.serial);
    } catch (error) {
      showToast(error.message);
    }
  });
}

function renderDevices() {
  els.deviceGrid.innerHTML = '';
  els.deviceCount.textContent = String(state.devices.length);
  els.onlineCount.textContent = String(state.devices.filter(device => device.online).length);

  if (state.devices.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'hint-box';
    empty.textContent = '当前还没有设备出现在这里。先添加设备串号，再去实体设备的本地页面填写公网地址，等它完成首次握手后就会自动显示。';
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

async function loadDevices(options = {}) {
  const refreshModal = !!(options && options.refreshModal);
  if (!state.loggedIn) return;
  const data = await request('/api/admin/devices');
  state.devices = data.devices || [];
  renderDevices();
  if (state.currentModal) {
    const latestDevice = getStateDevice(state.currentModal.serial);
    if (latestDevice) {
      if (refreshModal) {
        openCommandModal(latestDevice, state.currentModal.section);
      }
    } else {
      closeCommandModal();
    }
  }
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
  closeCommandModal();
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

els.commandModalClose?.addEventListener('click', closeCommandModal);
els.commandModal?.addEventListener('click', event => {
  const target = event.target;
  if (target && target.dataset && target.dataset.closeModal === '1') {
    closeCommandModal();
  }
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && state.currentModal) {
    closeCommandModal();
  }
});

initTheme();
bootstrap().catch(error => {
  showToast(error.message || '平台初始化失败');
  els.serverState.textContent = '初始化失败';
});
