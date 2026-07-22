(() => {
  const bridge = 'https://profiteraa.com/api/deriv/app-session/?next=%2Fautomatic-trade%2F';
  fetch(bridge, { credentials: 'include', headers: { Accept: 'application/json' } })
    .then(async response => ({ ok: response.ok, body: await response.json() }))
    .then(({ ok, body }) => {
      if (!ok || !body.auth_info) return;
      const next = JSON.stringify(body.auth_info);
      if (localStorage.getItem('auth_info') === next) return;
      localStorage.setItem('auth_info', next);
      localStorage.setItem('accountsList', JSON.stringify(body.accounts || []));
      localStorage.setItem('clientAccounts', JSON.stringify(body.accounts || []));
      if (body.active_account_id) localStorage.setItem('active_loginid', body.active_account_id);
      window.location.reload();
    })
    .catch(() => {});
})();
