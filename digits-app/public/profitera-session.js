(() => {
  const sessionUrl = `/api/deriv/app-session/?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
  fetch(sessionUrl, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
    .then(async response => ({ ok: response.ok, body: await response.json() }))
    .then(({ ok, body }) => {
      if (!ok) {
        if (body.login_url) window.location.replace(body.login_url);
        return;
      }
      const current = localStorage.getItem('auth_info');
      const next = JSON.stringify(body.auth_info);
      if (current === next) return;
      localStorage.setItem('auth_info', next);
      localStorage.setItem('deriv_accounts', JSON.stringify(body.accounts || []));
      if (body.active_account_id) localStorage.setItem('active_loginid', body.active_account_id);
      const active = (body.accounts || []).find(account => account.account_id === body.active_account_id) || body.accounts?.[0];
      if (active?.account_type) localStorage.setItem('account_type', active.account_type);
      window.location.reload();
    })
    .catch(() => {});
})();
