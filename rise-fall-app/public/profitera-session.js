(() => {
  const startBalanceFeed = (authInfo, accountId) => {
    const token = authInfo?.access_token;
    if (!token || window.__profiteraBalanceFeed) return;
    window.__profiteraBalanceFeed = true;
    const socket = new WebSocket('wss://ws.derivws.com/websockets/v3?app_id=1089');
    socket.onopen = () => socket.send(JSON.stringify({ authorize: token }));
    socket.onmessage = ({ data }) => { try { const message = JSON.parse(data); if (message.authorize) socket.send(JSON.stringify({ balance: 1, subscribe: 1 })); if (!message.balance) return; const balance = message.balance.balance, currency = message.balance.currency || 'USD', live = { balance, currency, account_id: accountId, at: Date.now() }; localStorage.setItem('profitera:live-balance', JSON.stringify(live)); fetch('/api/dashboard/live-balance/', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(live) }).catch(() => {}); } catch (_) {} };
    socket.onclose = () => { window.__profiteraBalanceFeed = false; setTimeout(() => startBalanceFeed(authInfo, accountId), 4000); };
  };
  const home = document.createElement('a');
  home.href = '/'; home.textContent = 'Profitera Home';
  home.style.cssText = 'position:fixed;z-index:9999;top:12px;left:12px;padding:9px 12px;border-radius:8px;background:#17233a;color:#fff;font:700 13px Arial;text-decoration:none;border:1px solid #425777';
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(home), { once: true });
  const sessionUrl = `/api/deriv/app-session/?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
  fetch(sessionUrl, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
    .then(async response => ({ ok: response.ok, body: await response.json() }))
    .then(({ ok, body }) => {
      if (!ok) { if (body.login_url) window.location.replace(body.login_url); return; }
      const current = localStorage.getItem('auth_info');
      const next = JSON.stringify(body.auth_info);
      const active = (body.accounts || []).find(account => account.account_id === body.active_account_id) || body.accounts?.[0];
      startBalanceFeed(body.auth_info, active?.account_id || body.active_account_id);
      if (current === next) return;
      localStorage.setItem('auth_info', next);
      localStorage.setItem('deriv_accounts', JSON.stringify(body.accounts || []));
      if (body.active_account_id) localStorage.setItem('active_loginid', body.active_account_id);
      if (active?.account_type) localStorage.setItem('account_type', active.account_type);
      window.location.reload();
    }).catch(() => {});
})();
