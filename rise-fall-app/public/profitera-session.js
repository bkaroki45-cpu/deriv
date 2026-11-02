(() => {
  const home = document.createElement('a'); home.href = '/'; home.textContent = 'Profitera Home'; home.style.cssText = 'position:fixed;z-index:9999;top:12px;left:12px;padding:9px 12px;border-radius:8px;background:#17233a;color:#fff;font:700 13px Arial;text-decoration:none;border:1px solid #425777';
  const addHome = () => document.body.appendChild(home); if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addHome, { once: true }); else addHome();
  const localHost = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const djangoOrigin = localHost ? `${window.location.protocol}//${window.location.hostname}:8000` : window.location.origin;
  const nextPath = window.location.pathname + window.location.search;
  const next = localHost ? `${window.location.origin}${nextPath}` : nextPath;
  const sessionUrl = new URL('/api/deriv/app-session/', djangoOrigin);
  sessionUrl.searchParams.set('next', next);
  fetch(sessionUrl, { credentials: 'include', headers: { Accept: 'application/json' } })
    .then(async response => ({ ok: response.ok, body: await response.json() }))
    .then(({ ok, body }) => {
      if (!ok) {
        if (body.login_url) window.location.replace(new URL(body.login_url, djangoOrigin));
        return;
      }
      const authInfo = body.auth_info;
      if (!authInfo?.access_token) return;
      let previousAuth = null;
      try { previousAuth = JSON.parse(localStorage.getItem('auth_info') || 'null'); } catch {}
      const accounts = Array.isArray(body.accounts) ? body.accounts : [];
      const accountKey = items => JSON.stringify((Array.isArray(items) ? items : []).map(account => [account?.account_id, account?.account_type]).sort());
      const previousAccounts = (() => { try { const items = JSON.parse(localStorage.getItem('deriv_accounts') || '[]'); return Array.isArray(items) ? items : []; } catch { return []; } })();
      const previousAccountId = localStorage.getItem('active_loginid');
      const changed = !previousAuth?.access_token || previousAuth.access_token !== authInfo.access_token ||
        accountKey(previousAccounts) !== accountKey(accounts) ||
        (body.active_account_id && previousAccountId !== body.active_account_id);
      localStorage.setItem('auth_info', JSON.stringify(authInfo));
      localStorage.setItem('deriv_accounts', JSON.stringify(accounts));
      if (body.active_account_id) localStorage.setItem('active_loginid', body.active_account_id);
      const active = accounts.find(account => account.account_id === body.active_account_id) || accounts[0];
      if (active?.account_type) localStorage.setItem('account_type', active.account_type);
      if (changed) window.location.reload();
    }).catch(() => {});
})();
