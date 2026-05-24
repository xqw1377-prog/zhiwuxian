/**
 * WUXIAN · 统一 SPA 客户端
 * deconstruct + reroute 无缝缝合 · 允许失败的产品灵魂
 */
(function (global) {
  'use strict';

  const API_BASE = (() => {
    if (window.location.protocol === 'file:') return 'http://localhost:3401';
    return '';
  })();

  const STORAGE_KEY = 'wuxian_session_v3';
  const ENABLE_LOCAL_FALLBACK = window.location.hostname === 'localhost'
    || window.location.hostname === '127.0.0.1'
    || window.location.protocol === 'file:';
  const STAGE_LABELS = {
    SILENT_REDISTRIBUTE: '静默重排',
    CELL_SPLIT: '机甲降级',
    PERSONA_INTERVENTION: '路径校准',
    SOFT_DOWNGRADE: '复活甲展开',
    ON_TRACK: '配速稳定',
    SMOOTH_SHARING: '静默平摊',
    TASK_DEGRADATION: '虫洞降级保护',
    CRITICAL_INTERVENTION: '降落伞模式',
    MAINTAIN: '路径正常',
  };

  const state = {
    sessionId: null,
    goal: null,
    totalDays: 0,
    currentDay: 1,
    consecutiveFailDays: 0,
    energyTotal: 1200,
    remainingEnergy: 1200,
    slopeHistory: [],
    completedTasks: new Set(),
    personaId: 'growth-companion',
  };

  const fallback = {
    deconstruct(goal, days, drive) {
      return {
        code: 200,
        data: {
          sessionId: 'local-mock',
          goalVector: goal,
          category: '通用目标',
          timeSlope: (1200 / days).toFixed(4),
          energyTotal: 1200,
          remainingEnergy: 1200,
          deviationRisk: 16.8,
          persisted: false,
          todayTasks: [
            { id: 'T1', desc: '用 15 分钟完成今日最小可验证动作', time: 15, scheduledAt: '今日' },
            { id: 'T2', desc: '写下当前最关键的三个卡点', time: 20, scheduledAt: '今日' },
            { id: 'T3', desc: '复盘今天的阻力来源', time: 10, scheduledAt: '今日' },
          ],
          persona: { id: 'growth-companion', name: '随行外挂', greeting: drive ? `机甲已记住你的理由：${drive}` : '不用证明你很强。掉队了，路径我来重算。' },
        },
      };
    },
    reroute(done) {
      if (done) {
        state.consecutiveFailDays = 0;
        return { code: 200, data: { action: 'MAINTAIN', stage: 'ON_TRACK', newTimeSlope: document.getElementById('slope-value')?.textContent, message: '今日路径已踩实。', activePersonaName: '随行外挂', emotionalHook: null, tomorrowTasks: [], silent: true } };
      }
      state.consecutiveFailDays += 1;
      const slope = Number(document.getElementById('slope-value')?.textContent || 12);
      const action = state.consecutiveFailDays <= 1 ? 'SMOOTH_SHARING' : state.consecutiveFailDays <= 3 ? 'TASK_DEGRADATION' : 'CRITICAL_INTERVENTION';
      return {
        code: 200,
        data: {
          action, stage: action,
          newTimeSlope: (slope * (action === 'TASK_DEGRADATION' ? 0.6 : 1.04)).toFixed(4),
          message: action === 'TASK_DEGRADATION' ? '复活甲已启动：本周认知负荷降低 40%，今天只看 3 页书即可。' : '路径已悄悄重排，无指责。',
          activePersonaName: state.consecutiveFailDays > 3 ? '进化向导' : '随行外挂',
          emotionalHook: null,
          tomorrowTasks: [{ id: `R${Date.now()}`, desc: action === 'TASK_DEGRADATION' ? '今天只做 5 分钟重启动作' : '完成一个降级后的小任务', time: action === 'TASK_DEGRADATION' ? 5 : 10, scheduledAt: '明日' }],
          silent: state.consecutiveFailDays < 4,
          showBubble: state.consecutiveFailDays >= 2,
        },
      };
    },
  };

  function unwrap(res) {
    return res?.data?.data ?? res?.data ?? res;
  }

  function showLoading(text) {
    const el = document.getElementById('loading');
    const txt = document.getElementById('loading-text');
    if (txt) txt.textContent = text;
    el?.classList.remove('hidden');
    el?.classList.add('flex');
  }

  function hideLoading() {
    const el = document.getElementById('loading');
    el?.classList.add('hidden');
    el?.classList.remove('flex');
  }

  function setMode(text, live) {
    const b = document.getElementById('mode-badge');
    if (!b) return;
    b.textContent = text;
    b.className = live
      ? 'badge badge-live'
      : 'badge badge-mock';
  }

  function saveSession() {
    if (state.sessionId && state.sessionId !== 'local-mock') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        sessionId: state.sessionId,
        goal: state.goal,
        totalDays: state.totalDays,
        currentDay: state.currentDay,
        consecutiveFailDays: state.consecutiveFailDays,
      }));
    }
  }

  function restoreSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const s = JSON.parse(raw);
      Object.assign(state, s);
      return !!s.sessionId;
    } catch { return false; }
  }

  async function restoreDashboardFromDb() {
    if (!state.sessionId || state.sessionId === 'local-mock') return false;
    try {
      showLoading('正在从数据库恢复驾驶舱…');
      const res = await fetch(`${API_BASE}/api/v1/goal/${state.sessionId}/dashboard`);
      if (!res.ok) throw new Error('restore failed');
      const data = unwrap(await res.json());
      state.goal = data.goalVector || state.goal;
      state.totalDays = data.totalDays || data.durationDays || state.totalDays;
      state.consecutiveFailDays = data.continuousFailDays ?? state.consecutiveFailDays;
      state.energyTotal = data.energyTotal;
      state.remainingEnergy = data.remainingEnergy ?? data.energyTotal;
      renderDashboard(data);
      setMode('在线 · 已恢复', true);
      addLog(`已从数据库恢复会话 ${state.sessionId?.slice(-8)}`);
      saveSession();
      return true;
    } catch (_) {
      setMode('本地缓存', false);
      return false;
    } finally {
      hideLoading();
    }
  }

  function addLog(text) {
    const log = document.getElementById('route-log');
    if (!log) return;
    const item = document.createElement('div');
    item.className = 'log-item view-enter';
    item.textContent = text;
    log.prepend(item);
  }

  function playRipple(x, y, color) {
    const ripple = document.createElement('div');
    ripple.className = 'glow-ripple';
    ripple.style.cssText = `left:${x}px;top:${y}px;width:48px;height:48px;background:radial-gradient(circle,${color}55,transparent 70%)`;
    document.body.appendChild(ripple);
    setTimeout(() => ripple.remove(), 2600);
  }

  function updateSlopeCurve(slope) {
    const path = document.getElementById('slope-curve-path');
    if (!path) return;
    const norm = Math.min(1, slope / 30);
    const y2 = 40 - norm * 28;
    path.setAttribute('d', `M 0 40 Q 60 ${y2} 120 ${y2 - 4} T 240 8`);
    path.classList.add('pulse-track');
  }

  function updateRisk(value) {
    const el = document.getElementById('risk-value');
    if (!el) return;
    const n = Number(value);
    el.textContent = `${n.toFixed(1)}%`;
    el.className = n >= 35 ? 'metric-num risk-hot' : 'metric-num risk-calm';
    document.getElementById('risk-ring')?.setAttribute('stroke', n >= 35 ? '#ff5e00' : '#39ff14');
  }

  function updatePersona(name, speech, morph) {
    const orb = document.getElementById('persona-orb');
    const bubble = document.getElementById('persona-bubble');
    document.getElementById('persona-name').textContent = name;
    document.getElementById('persona-speech').textContent = speech;
    if (morph) {
      orb?.classList.add('cell-split');
      bubble?.classList.add('bubble-morph');
      setTimeout(() => { orb?.classList.remove('cell-split'); bubble?.classList.remove('bubble-morph'); }, 1500);
    }
  }

  function updateDashboardMetrics({ slope, risk, remaining, total }) {
    if (slope != null) {
      document.getElementById('slope-value').textContent = Number(slope).toFixed(4);
      state.slopeHistory.push(Number(slope));
      updateSlopeCurve(Number(slope));
      const gauge = document.getElementById('slope-gauge');
      if (gauge) gauge.style.setProperty('--slope-pct', `${Math.min(100, Number(slope) / 25 * 100)}%`);
    }
    if (risk != null) updateRisk(risk);
    if (remaining != null && total != null) {
      state.remainingEnergy = remaining;
      state.energyTotal = total;
      document.getElementById('energy-value').textContent = `${Math.round(remaining)} / ${Math.round(total)}`;
      document.getElementById('energy-bar').style.width = `${Math.max(8, Math.min(100, remaining / total * 100))}%`;
    }
    document.getElementById('countdown').textContent = `还剩 ${Math.max(state.totalDays - state.currentDay + 1, 0)} 天`;
  }

  function renderTaskList(tasks) {
    const list = document.getElementById('task-list');
    const count = document.getElementById('task-count');
    if (!list) return;
    if (count) count.textContent = `${tasks.length} 项`;
    if (!tasks.length) {
      list.innerHTML = '<div class="task-empty">今天建议先休息。明天用一个 5 分钟小动作重新启动。</div>';
      return;
    }
    list.innerHTML = tasks.map(t => `
      <article id="task-${t.id}" class="task-card view-enter">
        <div class="task-body">
          <div class="task-meta">
            <span class="task-time-label">${t.scheduledAt || '今日'}</span>
            <span class="task-min">${t.time} 分钟</span>
          </div>
          <p class="task-desc">${t.desc}</p>
        </div>
        <div class="task-actions">
          <button class="btn-done" onclick="WuxianClient.handleTaskFeedback('${t.id}', 'DONE')">√ 已完成</button>
          <button class="btn-fail" onclick="WuxianClient.handleTaskFeedback('${t.id}', 'FAIL', 'TASK_TOO_HARD')">✕ 太难了</button>
          <button class="btn-fail subtle" onclick="WuxianClient.handleTaskFeedback('${t.id}', 'FAIL', 'NO_TIME')">没时间</button>
        </div>
      </article>
    `).join('');
  }

  function renderDashboard(data) {
    document.getElementById('setup-view')?.classList.add('hidden');
    document.getElementById('dashboard-view')?.classList.remove('hidden');
    document.getElementById('reset-btn')?.classList.remove('hidden');
    document.getElementById('panorama-btn')?.classList.remove('hidden');
    document.getElementById('share-btn')?.classList.remove('hidden');

    document.getElementById('goal-title').textContent = data.goalVector;
    document.getElementById('decompose-note').textContent = data.decomposeNote || '';
    document.getElementById('category').textContent = data.category || '通用目标';

    state.energyTotal = data.energyTotal;
    state.remainingEnergy = data.remainingEnergy ?? data.energyTotal;
    updateDashboardMetrics({
      slope: data.timeSlope,
      risk: data.deviationRisk,
      remaining: state.remainingEnergy,
      total: state.energyTotal,
    });

    updatePersona(data.persona?.name || '养成系伙伴', data.persona?.greeting || '路径已经生成。今天只需要推进一步。', false);
    renderTaskList(data.todayTasks || []);

    const roadmap = document.getElementById('roadmap-list');
    if (roadmap) {
      roadmap.innerHTML = (data.roadmap || []).map(r =>
        `<div class="roadmap-item"><span class="roadmap-phase">阶段 ${r.phase}</span> · ${r.name} <span class="muted">(${r.weight})</span></div>`
      ).join('');
    }
    if (data.persisted) document.getElementById('persist-badge')?.classList.remove('hidden');
  }

  async function initWuxianGoal(title, days, driveForce) {
    showLoading('正在连接知识图谱，计算目标能量…');
    state.goal = title;
    state.totalDays = days;
    state.currentDay = 1;
    state.consecutiveFailDays = 0;
    state.completedTasks = new Set();
    state.slopeHistory = [];

    let result;
    try {
      const res = await fetch(`${API_BASE}/api/v1/goal/deconstruct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: title,
          totalDays: days,
          isDeadlineFixed: true,
          driveSource: driveForce ? { why: driveForce, intensity: 8 } : undefined,
          dailyMinutesAvailable: 45,
          templateId: /toefl|托福/i.test(title) ? 'TOEFL_90_PRO' : undefined,
        }),
      });
      if (!res.ok) throw new Error('deconstruct failed');
      result = await res.json();
      setMode('在线 · SQLite', true);
    } catch (_) {
      if (!ENABLE_LOCAL_FALLBACK) {
        setMode('服务未连接', false);
        addLog('服务未连接：请启动后端后重试。');
        hideLoading();
        return null;
      }
      result = fallback.deconstruct(title, days, driveForce);
      setMode('本地演示', false);
    } finally {
      hideLoading();
    }

    const data = unwrap(result);
    state.sessionId = data.sessionId;
    state.totalDays = data.totalDays || data.durationDays || state.totalDays;
    saveSession();
    renderDashboard(data);
    addLog('目标已锁定。今天只需要完成下方任务。');
    return data;
  }

  async function handleTaskFeedback(taskId, status, reason) {
    const card = document.getElementById(`task-${taskId}`);

    if (status === 'DONE') {
      state.completedTasks.add(taskId);
      card?.classList.add('done', 'success-flash');
      const rect = card?.getBoundingClientRect();
      if (rect) playRipple(rect.left + rect.width / 2, rect.top + rect.height / 2, '#39ff14');

      showLoading('记录完成…');
      try {
        if (state.sessionId && state.sessionId !== 'local-mock') {
          const res = await fetch(`${API_BASE}/api/v1/task/update`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ goalId: state.sessionId, taskId, status: 'DONE' }),
          });
          if (res.ok) {
            const data = unwrap(await res.json());
            updateDashboardMetrics({
              slope: data.newTimeSlope,
              risk: data.deviationRisk,
              remaining: data.remainingEnergy,
              total: data.energyTotal ?? data.totalEnergy,
            });
            updatePersona(data.activePersonaName, data.message, false);
          } else if (!ENABLE_LOCAL_FALLBACK) {
            setMode('服务异常', false);
            addLog('服务异常：记录完成失败。');
            card?.classList.remove('done');
          }
        }
      } catch (_) {
        if (!ENABLE_LOCAL_FALLBACK) {
          setMode('服务异常', false);
          addLog('服务异常：记录完成失败。');
          card?.classList.remove('done');
        }
      }
      finally { hideLoading(); }

      state.consecutiveFailDays = 0;
      addLog('任务完成。斜率保持平稳。');
      saveSession();
      return;
    }

    card?.classList.add('collapsing');
    showLoading('正在动态重算未来路径，请稍候…');

    const signalMap = { TASK_TOO_HARD: 'TASK_TOO_HARD', NO_TIME: 'NO_TIME', GAVE_UP: 'GAVE_UP' };
    const userSignal = signalMap[reason] || 'TASK_TOO_HARD';

    let result;
    try {
      if (!state.sessionId || state.sessionId === 'local-mock') throw new Error('mock');
      const res = await fetch(`${API_BASE}/api/v1/task/update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goalId: state.sessionId,
          taskId,
          status: 'FAILED',
          reason: userSignal,
        }),
      });
      if (!res.ok) throw new Error('reroute failed');
      result = await res.json();
      setMode('在线 · SQLite', true);
    } catch (_) {
      if (!ENABLE_LOCAL_FALLBACK) {
        setMode('服务异常', false);
        addLog('服务异常：重算链路中断。');
        hideLoading();
        card?.classList.remove('collapsing');
        return;
      }
      result = fallback.reroute(false);
      setMode('本地演示', false);
    } finally {
      hideLoading();
    }

    const data = unwrap(result);
    state.consecutiveFailDays = data.continuousFailDays ?? state.consecutiveFailDays + 1;

    updateDashboardMetrics({
      slope: data.newTimeSlope,
      risk: data.deviationRisk,
      remaining: data.remainingEnergy,
      total: data.energyTotal ?? data.totalEnergy,
    });

    const stage = STAGE_LABELS[data.stage] || STAGE_LABELS[data.action] || data.action;
    document.getElementById('stage-badge').textContent = stage;
    document.getElementById('stage-badge')?.classList.remove('hidden');

    renderTaskList(data.tomorrowTasks || []);
    updatePersona(
      data.activePersonaName || '养成系伙伴',
      data.emotionalHook || data.message,
      !data.silent || data.showBubble,
    );

    addLog(`${stage}：${data.message}`);
    saveSession();
  }

  async function loadRerouteHistory() {
    if (!state.sessionId || state.sessionId === 'local-mock') return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/goal/${state.sessionId}/reroute-history`);
      if (!res.ok) return;
      const data = unwrap(await res.json());
      const logs = data.logs || [];
      const el = document.getElementById('reroute-history');
      if (!el) return;
      el.innerHTML = logs.length
        ? logs.map(l => `<div class="history-item"><span class="hist-action">${l.actionTaken || l.triggerType}</span> · 斜率 ${l.oldSlope?.toFixed(2)}→${l.newSlope?.toFixed(2)}</div>`).join('')
        : '<p class="muted">暂无重算记录</p>';
    } catch (_) {}
  }

  function togglePanorama(open) {
    document.getElementById('panorama-drawer')?.classList.toggle('open', open);
    document.getElementById('drawer-overlay')?.classList.toggle('hidden', !open);
    if (open) loadRerouteHistory();
  }

  function resetDashboard() {
    Object.assign(state, { sessionId: null, goal: null, totalDays: 0, currentDay: 1, consecutiveFailDays: 0, completedTasks: new Set() });
    localStorage.removeItem(STORAGE_KEY);
    document.getElementById('dashboard-view')?.classList.add('hidden');
    document.getElementById('setup-view')?.classList.remove('hidden');
    ['reset-btn', 'panorama-btn', 'share-btn', 'persist-badge'].forEach(id => document.getElementById(id)?.classList.add('hidden'));
    document.getElementById('route-log').innerHTML = '';
    document.getElementById('stage-badge')?.classList.add('hidden');
    setMode('就绪', true);
  }

  function launchFromForm() {
    const goal = document.getElementById('goal-input')?.value?.trim();
    const days = Number(document.getElementById('days-input')?.value);
    const drive = document.getElementById('drive-input')?.value?.trim();
    if (!goal || !days || days < 1) return;
    return initWuxianGoal(goal, days, drive);
  }

  global.WuxianClient = {
    initWuxianGoal,
    handleTaskFeedback,
    launchFromForm,
    togglePanorama,
    resetDashboard,
    restoreSession,
    restoreDashboardFromDb,
    getState: () => ({ ...state }),
  };

  document.addEventListener('DOMContentLoaded', async () => {
    if (restoreSession()) {
      const gi = document.getElementById('goal-input');
      const di = document.getElementById('days-input');
      if (gi) gi.value = state.goal || '';
      if (di) di.value = state.totalDays || 90;
      const restored = await restoreDashboardFromDb();
      if (!restored) addLog(`已恢复本地会话 ${state.sessionId?.slice(-8)}`);
    }
    fetch(`${API_BASE}/api/health`).then(r => r.ok && setMode('API 就绪', true)).catch(() => {});
  });
})(window);
