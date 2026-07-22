(() => {
  const money = (value, currency) => `${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency || 'USD'}`;
  const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
  const chart = (id, points, color, fill) => {
    const svg = document.getElementById(id); if (!svg || !points.length) return;
    const vals = points.map(p => Number(p.value)); const min = Math.min(...vals), max = Math.max(...vals); const span = max - min || 1;
    const xy = vals.map((v, i) => [i / Math.max(vals.length - 1, 1) * 510 + 5, 174 - ((v - min) / span * 142)]);
    const line = xy.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    const area = `${line} L515,184 L5,184 Z`; const grad = `${id}-gradient`;
    svg.innerHTML = `<defs><linearGradient id="${grad}" x1="0" x2="0" y1="0" y2="1"><stop stop-color="${color}" stop-opacity=".20"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs><path d="${area}" fill="url(#${grad})"/><path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${xy.at(-1)[0]}" cy="${xy.at(-1)[1]}" r="3.2" fill="#fff" stroke="${color}" stroke-width="2"/>`;
  };
  const fill = (data) => {
    const currency = data.currency || 'USD', connected = data.connected;
    set('connection-text', connected ? 'Connected to Deriv' : 'Deriv connection required'); set('server-time', `Server time: ${data.server_time}`);
    set('active-balance', money(data.balance, currency)); set('history-balance', money(data.balance, currency));
    set('account-id', data.account_id || 'Not connected'); set('details-id', data.account_id || 'Not connected');
    set('account-kind', `${data.account_type === 'demo' ? 'Demo' : 'Real'} account`); set('details-type', data.account_type === 'demo' ? 'Demo' : 'Real'); set('details-currency', currency);
    const pnl = Number(data.pnl || 0), positive = pnl >= 0; const pnlNode = document.getElementById('pnl');
    if (pnlNode) { pnlNode.textContent = `${positive ? '+' : ''}${money(pnl, currency)}`; pnlNode.style.color = positive ? '#08a966' : '#e63758'; }
    const change = document.getElementById('pnl-change'); if (change) { change.textContent = `${positive ? '↗' : '↘'} ${Math.abs(Number(data.pnl_percent || 0)).toFixed(2)}% vs last month`; change.style.color = positive ? '#08a966' : '#e63758'; }
    chart('performance-chart', data.history, positive ? '#f72d5d' : '#e63758'); chart('balance-chart', data.history, '#f72d5d');
    const list = document.getElementById('activity-list'); if (list) list.innerHTML = data.activities?.length ? data.activities.map(a => `<div class="activity-row"><i>✓</i><span>${a.action}</span><time>${a.time}</time></div>`).join('') : '<p class="empty">No recent activity yet.</p>';
  };
  const load = async () => { try { const response = await fetch('/api/dashboard/', { credentials: 'same-origin' }); if (response.ok) fill(await response.json()); } catch (_) {} };
  // A subscribed balance feed lets the displayed balance change as soon as a
  // Deriv contract settles; the regular feed also persists/refreshes it server-side.
  const connectLiveBalance = async () => {
    try {
      const session = await fetch('/api/deriv/app-session/', { credentials: 'same-origin' });
      const payload = await session.json(); const token = payload?.auth_info?.access_token;
      if (!token) return;
      const appId = document.body.dataset.derivAppId || '1089';
      const socket = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${encodeURIComponent(appId)}`);
      socket.onopen = () => socket.send(JSON.stringify({ authorize: token }));
      socket.onmessage = ({ data }) => {
        const message = JSON.parse(data);
        if (message.authorize) socket.send(JSON.stringify({ balance: 1, subscribe: 1 }));
        if (message.balance) {
          const balance = message.balance.balance, currency = message.balance.currency || 'USD';
          set('active-balance', money(balance, currency)); set('history-balance', money(balance, currency));
          set('server-time', 'Live balance update from Deriv');
        }
      };
      socket.onclose = () => window.setTimeout(connectLiveBalance, 5000);
    } catch (_) { window.setTimeout(connectLiveBalance, 10000); }
  };
  document.getElementById('theme-toggle')?.addEventListener('click', () => document.body.classList.toggle('dark'));
  document.querySelector('.menu')?.addEventListener('click', () => document.querySelector('.mobile-nav')?.classList.toggle('open'));
  load(); connectLiveBalance(); window.setInterval(load, 10000);
})();
