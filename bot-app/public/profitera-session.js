(() => {
  const mountBotNav = () => { const style=document.createElement('style'); style.textContent='@media(max-width:800px){.app-footer,footer{display:none!important}body{padding-bottom:76px!important}.profitera-mobile-nav{position:fixed;z-index:2147483647;bottom:0;left:0;right:0;height:72px;background:#fff;display:flex;justify-content:space-around;align-items:center;box-shadow:0 -4px 16px #0002}.profitera-mobile-nav a{display:flex;flex-direction:column;align-items:center;gap:4px;color:#374151;text-decoration:none;font:700 11px Arial}.profitera-mobile-nav span{font-size:23px}.profitera-mobile-nav a:first-child{color:#f72d5d}}'; document.head.appendChild(style); const nav=document.createElement('nav'); nav.className='profitera-mobile-nav'; nav.innerHTML='<a href="https://profiteraa.com/"><span>⌂</span>Home</a><a href="https://profiteraa.com/trade/"><span>⌁</span>Trade</a><a href="https://bot.profiteraa.com/"><span>♙</span>Bots</a><a href="https://profiteraa.com/dashboard/"><span>▧</span>Dashboard</a><a href="https://profiteraa.com/account/"><span>•••</span>More</a>'; document.body.appendChild(nav); }; if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountBotNav, {once:true}); else mountBotNav();
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
