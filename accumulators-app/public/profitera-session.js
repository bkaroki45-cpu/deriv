(() => {
  const injectMobileChrome = () => { if (document.getElementById('profitera-mobile-nav')) return; const style = document.createElement('style'); style.textContent = '@media(max-width:800px){footer{display:none!important}body{padding-bottom:82px!important}.profitera-mobile-nav{position:fixed!important;z-index:2147483647!important;left:0;right:0;bottom:0;height:72px;background:#fff;border-top:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-around;box-shadow:0 -5px 20px rgba(15,23,42,.12);font-family:Arial,sans-serif}.profitera-mobile-nav a{display:flex;min-width:52px;flex-direction:column;gap:4px;align-items:center;color:#4b5563;text-decoration:none;font-size:22px;line-height:1}.profitera-mobile-nav a:first-child{color:#f72d5d}.profitera-mobile-nav small{font-size:11px;font-weight:700}.profitera-result{position:fixed;z-index:2147483647;top:18px;right:16px;left:16px;padding:15px 18px;border-radius:12px;color:#fff;font:700 15px Arial;box-shadow:0 12px 30px rgba(0,0,0,.22)}.profitera-result.win{background:#099b5b}.profitera-result.loss{background:#dc304e}}'; document.head.appendChild(style); const nav = document.createElement('nav'); nav.id = 'profitera-mobile-nav'; nav.className = 'profitera-mobile-nav'; nav.innerHTML = '<a href="/"><span>⌂</span><small>Home</small></a><a href="/trade/"><span>⌁</span><small>Trade</small></a><a href="/automatic-trade/"><span>♙</span><small>Bots</small></a><a href="/dashboard/"><span>▧</span><small>Dashboard</small></a><a href="/account/"><span>•••</span><small>More</small></a>'; document.body.appendChild(nav); };
  const showResult = (profit, currency) => { const win = Number(profit) > 0, item = document.createElement('div'); item.className = `profitera-result ${win ? 'win' : 'loss'}`; item.textContent = win ? `Win! +${Number(profit).toFixed(2)} ${currency || 'USD'}` : `Loss: ${Number(profit).toFixed(2)} ${currency || 'USD'}`; document.body.appendChild(item); setTimeout(() => item.remove(), 6000); };
  const startBalanceFeed = (authInfo, accountId) => {
    const token = authInfo?.access_token;
    if (!token || window.__profiteraBalanceFeed) return;
    window.__profiteraBalanceFeed = true;
    const socket = new WebSocket('wss://ws.derivws.com/websockets/v3?app_id=1089');
    socket.onopen = () => socket.send(JSON.stringify({ authorize: token }));
    socket.onmessage = ({ data }) => { try { const message = JSON.parse(data); if (message.authorize) { socket.send(JSON.stringify({ balance: 1, subscribe: 1 })); socket.send(JSON.stringify({ proposal_open_contract: 1, subscribe: 1 })); } const contract = message.proposal_open_contract; if (contract && (contract.is_sold || contract.is_expired || contract.status !== 'open') && Number.isFinite(Number(contract.profit))) { const key = `profitera:result:${contract.contract_id}`; if (!sessionStorage.getItem(key)) { sessionStorage.setItem(key, '1'); showResult(contract.profit, contract.currency); } } if (!message.balance) return; const balance = message.balance.balance, currency = message.balance.currency || 'USD', live = { balance, currency, account_id: accountId, at: Date.now() }; localStorage.setItem('profitera:live-balance', JSON.stringify(live)); fetch('/api/dashboard/live-balance/', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(live) }).catch(() => {}); } catch (_) {} };
    socket.onclose = () => { window.__profiteraBalanceFeed = false; setTimeout(() => startBalanceFeed(authInfo, accountId), 4000); };
  };
  const home = document.createElement('a');
  home.href = '/'; home.textContent = 'Profitera Home';
  home.style.cssText = 'position:fixed;z-index:9999;top:12px;left:12px;padding:9px 12px;border-radius:8px;background:#17233a;color:#fff;font:700 13px Arial;text-decoration:none;border:1px solid #425777';
  document.addEventListener('DOMContentLoaded', () => { document.body.appendChild(home); injectMobileChrome(); }, { once: true });
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
