(() => {
  const API = 'https://profiteraa.com/api/bots/';
  const escapeHtml = value => String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
  const state = { bots: [], selected: null };

  const css = `
    .pbt { position:fixed; z-index:2147483640; inset:0; overflow-x:hidden; overflow-y:auto; overscroll-behavior:contain; color:#f7f5ff; background:radial-gradient(ellipse 70% 45% at 12% -15%,#532bc04f,transparent 70%),radial-gradient(ellipse 55% 45% at 105% 90%,#0dd6df24,transparent 72%),#050617; font:14px Inter,Arial,sans-serif; }
    .profitera-mobile-nav { display:none!important; } .pbt * { box-sizing:border-box; min-width:0; } .pbt button { font:inherit; } .pbt-shell { width:min(1180px,calc(100% - 48px)); margin:auto; }
    .pbt:before { content:''; position:fixed; inset:0; z-index:-1; opacity:.35; pointer-events:none; background-image:linear-gradient(#8658dd17 1px,transparent 1px),linear-gradient(90deg,#8658dd17 1px,transparent 1px); background-size:42px 42px; mask-image:linear-gradient(#000,transparent 82%); }
    .pbt-header { height:76px; display:flex; align-items:center; gap:18px; border-bottom:1px solid #9463ed38; } .pbt-brand { font-size:22px; font-weight:800; letter-spacing:-.5px; } .pbt-brand i { display:inline-grid; place-items:center; width:35px; height:35px; margin-right:8px; border-radius:11px; font-style:normal; background:linear-gradient(135deg,#f05bd9,#714dff,#20e5ed); box-shadow:0 0 22px #9855ff; }
    .pbt-status { margin-left:auto; color:#c8c2e4; font-size:12px; } .pbt-status:before,.pbt-live:before { content:''; display:inline-block; width:8px; height:8px; margin-right:8px; border-radius:50%; background:#1ee4bf; box-shadow:0 0 13px #1ee4bf; animation:pbt-pulse 1.8s infinite; }
    .pbt-close,.pbt-outline,.pbt-main-action { border:1px solid #a35cff; border-radius:11px; padding:11px 15px; color:#fff; background:#6933b52e; font-weight:700; cursor:pointer; transition:.2s; } .pbt-close:hover,.pbt-outline:hover { border-color:#e06dff; box-shadow:0 0 22px #9c4fff52; }
    .pbt-main { padding:26px 0 110px; } .pbt-crumb { border:0; padding:0; color:#d1c7ed; background:transparent; cursor:pointer; font-size:12px; } .pbt-title-row { display:flex; justify-content:space-between; align-items:end; gap:18px; } .pbt h1 { margin:12px 0 8px; font-size:38px; letter-spacing:-1.6px; } .pbt h1 span { color:#d575ff; } .pbt p { margin:0; color:#bfb9d6; line-height:1.55; }
    .pbt-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:15px; margin-top:25px; } .pbt-card { position:relative; display:grid; grid-template-columns:53px 1fr; gap:12px; padding:18px; overflow:hidden; border:1px solid #8959df78; border-radius:16px; background:linear-gradient(145deg,#171b4ee0,#090a28e8); cursor:pointer; transition:transform .22s,border-color .22s,box-shadow .22s; } .pbt-card:hover { transform:translateY(-4px); border-color:#c76aff; box-shadow:0 18px 40px #803cff2b; } .pbt-card:after { content:''; position:absolute; inset:auto -30% 0; height:1px; background:linear-gradient(90deg,transparent,#1de6ef,#e84ae5,transparent); opacity:.5; }
    .pbt-icon { display:grid; place-items:center; width:53px; height:53px; border-radius:15px; color:#fff; font-weight:800; background:linear-gradient(135deg,#7348ff,#e137e4); box-shadow:0 0 19px #9450ff7d; } .pbt-card:nth-child(3n) .pbt-icon { background:linear-gradient(135deg,#ffb51b,#d75a13); } .pbt-card h2 { margin:2px 0 5px; font-size:17px; } .pbt-verified { float:right; border-radius:99px; padding:4px 7px; color:#29edcf; background:#15e4c21c; font-size:9px; font-weight:800; } .pbt-tags { grid-column:1/-1; display:flex; flex-wrap:wrap; gap:7px; margin-top:3px; } .pbt-tags span { border:1px solid #8960db66; border-radius:99px; padding:5px 8px; color:#ddd5f2; background:#2a246858; font-size:10px; }
    .pbt-empty { grid-column:1/-1; padding:42px; text-align:center; border:1px dashed #8453c6; border-radius:16px; background:#11103880; }
    .pbt-detail { animation:pbt-enter .32s ease-out; } .pbt-hero { position:relative; display:grid; grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr); gap:22px; min-height:262px; margin-top:20px; padding:30px; overflow:hidden; border:1px solid #9f55ff9e; border-radius:22px; background:linear-gradient(115deg,#12175ce8,#1c0b4fdf 56%,#061d3ddf); box-shadow:0 0 42px #7e3eff26; } .pbt-hero:before { content:''; position:absolute; width:460px; height:460px; right:-160px; top:-230px; border:1px solid #915dff6e; border-radius:50%; box-shadow:0 0 0 44px #8954ff12,0 0 0 92px #29e0ea0b; animation:pbt-orbit 11s linear infinite; } .pbt-kicker { color:#26ebd4; font-size:11px; font-weight:800; letter-spacing:.12em; text-transform:uppercase; overflow-wrap:anywhere; } .pbt-hero h1 { position:relative; margin:9px 0 10px; font-size:35px; overflow-wrap:anywhere; } .pbt-hero-copy { max-width:570px; overflow-wrap:anywhere; } .pbt-hero-actions { display:flex; flex-wrap:wrap; gap:10px; margin-top:20px; } .pbt-main-action { border-color:#f170ff; background:linear-gradient(90deg,#624bff,#e33be0); box-shadow:0 0 24px #bd43ef6b; } .pbt-main-action:disabled { opacity:.45; cursor:not-allowed; box-shadow:none; }
    .pbt-scanner { position:relative; z-index:1; display:grid; place-items:center; min-height:196px; } .pbt-ring,.pbt-ring:before,.pbt-ring:after { position:absolute; border:1px solid #31e8ef8c; border-radius:50%; content:''; } .pbt-ring { width:174px; height:174px; box-shadow:0 0 32px #20dce34d,inset 0 0 28px #6d4cff38; animation:pbt-orbit 8s linear infinite; } .pbt-ring:before { inset:20px; border-color:#bd5cffaa; } .pbt-ring:after { inset:47px; border-color:#21e7d5; box-shadow:0 0 18px #22ead4; } .pbt-sweep { position:absolute; width:88px; height:88px; transform-origin:100% 100%; border-radius:88px 0 0; background:linear-gradient(45deg,transparent 48%,#20e9df50); animation:pbt-sweep 2.9s linear infinite; } .pbt-core { position:relative; display:grid; place-items:center; width:57px; height:57px; border:1px solid #dd69ff; border-radius:18px; color:#fff; background:linear-gradient(135deg,#6a4bff,#df3bd8); box-shadow:0 0 25px #bd4cf4; font-size:20px; font-weight:900; } .pbt-scan-label { position:absolute; bottom:0; color:#bdc4e5; font-size:10px; letter-spacing:.1em; } .pbt-scan-label b { color:#2be7d4; }
    .pbt-monitor { display:grid; grid-template-columns:1.1fr .9fr; gap:17px; margin-top:17px; } .pbt-panel { padding:20px; border:1px solid #8260cf75; border-radius:18px; background:linear-gradient(145deg,#111442e5,#090923e8); } .pbt-panel h3 { margin:0 0 15px; font-size:15px; } .pbt-telemetry { display:grid; gap:11px; } .pbt-telemetry div { display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border:1px solid #7457b24c; border-radius:10px; background:#17134e78; color:#d7d0e9; font-size:12px; } .pbt-telemetry b { color:#26e8cf; font-size:10px; letter-spacing:.08em; } .pbt-meter { display:grid; grid-template-columns:repeat(20,1fr); gap:3px; height:73px; align-items:end; } .pbt-meter i { display:block; border-radius:2px; background:linear-gradient(#e04cff,#3be6e5); box-shadow:0 0 7px #7956ff; animation:pbt-bars 1.8s ease-in-out infinite alternate; } .pbt-meter i:nth-child(3n){animation-delay:-.7s}.pbt-meter i:nth-child(4n){animation-delay:-1.2s}.pbt-note { margin-top:13px!important; font-size:11px; color:#9d98ba!important; } .pbt-info { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; } .pbt-info div { padding:13px; border:1px solid #7457b24c; border-radius:11px; background:#17134e78; } .pbt-info small { display:block; margin-bottom:5px; color:#a9a1ca; font-size:10px; } .pbt-info b { color:#fff; font-size:13px; }
    .pbt-nav { display:none; } @keyframes pbt-pulse { 50% { opacity:.35; transform:scale(.72); } } @keyframes pbt-orbit { to { transform:rotate(360deg); } } @keyframes pbt-sweep { to { transform:rotate(360deg); } } @keyframes pbt-enter { from { opacity:0; transform:translateY(10px); } } @keyframes pbt-bars { to { transform:scaleY(.35); opacity:.45; } }
    @media(max-width:800px){ .pbt-shell{width:calc(100% - 32px)}.pbt-header{height:66px}.pbt-status,.pbt-close{display:none}.pbt-main{padding:20px 0 calc(104px + env(safe-area-inset-bottom))}.pbt-title-row{display:block}.pbt h1{font-size:31px}.pbt-grid{grid-template-columns:1fr;margin-top:18px}.pbt-card{grid-template-columns:46px minmax(0,1fr);padding:15px}.pbt-icon{width:46px;height:46px}.pbt-hero{grid-template-columns:minmax(0,1fr);gap:10px;padding:18px;min-height:0}.pbt-hero h1{font-size:28px;line-height:1.08}.pbt-hero-actions{display:grid;grid-template-columns:1fr}.pbt-hero-actions button{width:100%}.pbt-tags span{max-width:100%;overflow-wrap:anywhere}.pbt-scanner{min-height:169px;width:100%}.pbt-ring{width:146px;height:146px}.pbt-sweep{width:74px;height:74px}.pbt-scan-label{bottom:1px}.pbt-monitor{grid-template-columns:minmax(0,1fr)}.pbt-panel{padding:16px}.pbt-telemetry div{gap:8px}.pbt-telemetry span{overflow-wrap:anywhere}.pbt-info{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.pbt-nav{position:fixed;z-index:3;right:0;bottom:0;left:0;display:flex;justify-content:space-around;padding:10px 6px calc(12px + env(safe-area-inset-bottom));border-top:1px solid #8e56dc66;border-radius:20px 20px 0 0;background:#07061bed;backdrop-filter:blur(18px)}.pbt-nav button{display:grid;justify-items:center;gap:4px;min-width:0;border:0;padding:0;background:transparent;color:#d0c8e5;font-size:9px;cursor:pointer}.pbt-nav b{display:grid;place-items:center;width:23px;height:23px;border:1px solid currentColor;border-radius:7px}.pbt-nav .on{color:#fff;text-shadow:0 0 12px #cc40ff}.pbt-nav .on b{background:#882dff66;box-shadow:0 0 14px #b33dff} }
  `;

  const tags = bot => [bot.category, bot.market, bot.minimum_stake && `Min $${bot.minimum_stake}`, ...(bot.tags || [])].filter(Boolean).map(tag => `<span>${escapeHtml(tag)}</span>`).join('');
  const available = bot => Boolean(bot.has_python_bot || bot.has_strategy || bot.launch_url);
  const card = bot => `<article class="pbt-card" data-bot="${escapeHtml(bot.slug)}"><div class="pbt-icon">${escapeHtml((bot.kind === 'ai' ? 'AI' : bot.category || 'BT').slice(0, 2))}</div><div><span class="pbt-verified">${available(bot) ? 'VERIFIED' : 'SETUP NEEDED'}</span><h2>${escapeHtml(bot.title)}</h2><p>${escapeHtml(bot.description)}</p></div><div class="pbt-tags">${tags(bot)}${available(bot) ? '' : '<span>Upload a bot file to activate</span>'}</div></article>`;
  const bars = Array.from({ length: 20 }, (_, index) => `<i style="height:${22 + ((index * 17) % 66)}%"></i>`).join('');

  const shell = () => `<section class="pbt"><header class="pbt-shell pbt-header"><div class="pbt-brand"><i>P</i>Profitera Bot</div><span class="pbt-status">Connected to Deriv</span><button class="pbt-close" data-close>Open builder</button></header><main class="pbt-shell pbt-main" data-page></main><nav class="pbt-nav"><button data-nav="home"><b>H</b>Home</button><button data-nav="trade"><b>T</b>Trade</button><button data-nav="scanner"><b>A</b>AI</button><button class="on" data-nav="bots"><b>B</b>Bots</button><button data-nav="dashboard"><b>D</b>Dashboard</button></nav></section>`;

  const renderLibrary = root => {
    state.selected = null;
    root.innerHTML = `<button class="pbt-crumb" data-close>&larr; Home</button><div class="pbt-title-row"><div><h1>Bot <span>Library</span></h1><p>Choose a verified strategy, review its safeguards, then open its live command center.</p></div><button class="pbt-outline" data-close>Open blank builder</button></div><section class="pbt-grid">${state.bots.length ? state.bots.map(card).join('') : '<div class="pbt-empty"><h2>No bots published yet</h2><p>Published uploads will appear here automatically as cards.</p></div>'}</section>`;
    root.querySelectorAll('[data-bot]').forEach(element => element.onclick = () => { state.selected = state.bots.find(bot => bot.slug === element.dataset.bot); renderDetail(root); });
    root.querySelectorAll('[data-close]').forEach(button => button.onclick = closeLibrary);
  };

  const renderDetail = root => {
    const bot = state.selected;
    if (!bot) return renderLibrary(root);
    const action = bot.launch_url ? 'Open AI workspace' : bot.has_python_bot ? 'Start protected bot' : bot.has_strategy ? 'Load in Bot Builder' : 'Setup required';
    root.innerHTML = `<section class="pbt-detail"><button class="pbt-crumb" data-back>&larr; Back to Bot Library</button><section class="pbt-hero"><div><div class="pbt-kicker">${bot.kind === 'ai' ? 'AI-assisted strategy' : 'Verified Deriv strategy'} <span class="pbt-live">System online</span></div><h1>${escapeHtml(bot.title)}</h1><p class="pbt-hero-copy">${escapeHtml(bot.description)}</p><div class="pbt-tags">${tags(bot)}</div><div class="pbt-hero-actions"><button class="pbt-main-action" data-run ${available(bot) ? '' : 'disabled'}>${action} &rarr;</button><button class="pbt-outline" data-back>Review library</button></div></div><div class="pbt-scanner"><div class="pbt-ring"></div><div class="pbt-sweep"></div><div class="pbt-core">AI</div><div class="pbt-scan-label"><b>LIVE</b> SIGNAL MONITOR</div></div></section>${available(bot) ? '' : '<section class="pbt-panel" style="margin-top:17px"><h3>Bot activation required</h3><p>This bot has no uploaded XML strategy, runnable bot file, or launch workspace yet. Add one of those in the Profiteraa admin page, then publish the bot. The library will activate it automatically.</p></section>'}<section class="pbt-monitor"><section class="pbt-panel"><h3>Signal environment</h3><div class="pbt-telemetry"><div><span>Market data channel</span><b>CONNECTED</b></div><div><span>Strategy risk guard</span><b>ARMED</b></div><div><span>Opportunity monitor</span><b>SCANNING</b></div></div><p class="pbt-note">This visual monitor shows system readiness. Trading signals and orders only appear after the configured bot is started with your connected account.</p></section><section class="pbt-panel"><h3>Live activity visualization</h3><div class="pbt-meter">${bars}</div><p class="pbt-note">Animated telemetry — not a price chart or a profit forecast.</p></section></section><section class="pbt-panel" style="margin-top:17px"><h3>Bot configuration</h3><div class="pbt-info"><div><small>Market</small><b>${escapeHtml(bot.market || 'Configured in bot')}</b></div><div><small>Risk profile</small><b>${escapeHtml(bot.risk_level || 'User configured')}</b></div><div><small>Minimum stake</small><b>${bot.minimum_stake ? '$' + escapeHtml(bot.minimum_stake) : 'Set in bot'}</b></div></div>${bot.ai_summary ? `<p class="pbt-note"><b>AI note:</b> ${escapeHtml(bot.ai_summary)}</p>` : ''}</section></section>`;
    root.querySelectorAll('[data-back]').forEach(button => button.onclick = () => renderLibrary(root));
    const runButton = root.querySelector('[data-run]');
    if (runButton && available(bot)) runButton.onclick = () => launch(bot, runButton);
  };

  const renderScanner = root => {
    state.selected = null;
    const scanners = state.bots.filter(bot => bot.kind === 'ai');
    root.innerHTML = `<section class="pbt-detail"><button class="pbt-crumb" data-back>&larr; Back to Bot Library</button><section class="pbt-hero"><div><div class="pbt-kicker"><span class="pbt-live">AI Scanner online</span></div><h1>AI <span>Scanner</span></h1><p class="pbt-hero-copy">Your AI scanner workspace is ready. Upload and publish an AI-assisted bot in Profiteraa and it will appear here automatically.</p><div class="pbt-hero-actions"><button class="pbt-outline" data-back>Open Bot Library</button></div></div><div class="pbt-scanner"><div class="pbt-ring"></div><div class="pbt-sweep"></div><div class="pbt-core">AI</div><div class="pbt-scan-label"><b>READY</b> WAITING FOR A SCANNER</div></div></section><section class="pbt-panel" style="margin-top:17px"><h3>Scanner registry</h3>${scanners.length ? `<section class="pbt-grid" style="margin-top:0">${scanners.map(card).join('')}</section>` : '<div class="pbt-empty"><h2>No AI scanners published</h2><p>This is an intentionally empty workspace. Once an AI-assisted bot is uploaded and published, it will become available here automatically.</p></div>'}</section></section>`;
    root.querySelectorAll('[data-back]').forEach(button => button.onclick = () => renderLibrary(root));
    root.querySelectorAll('[data-bot]').forEach(element => element.onclick = () => { state.selected = state.bots.find(bot => bot.slug === element.dataset.bot); renderDetail(root); });
  };

  const closeLibrary = () => document.querySelector('.pbt')?.remove();
  const loadStrategy = async bot => {
    const response = await fetch(`${API}${encodeURIComponent(bot.slug)}/strategy/`, { credentials: 'include' });
    if (!response.ok) throw new Error('This strategy file is not available.');
    const xml = await response.text();
    const deadline = Date.now() + 10000;
    const load = () => {
      const workspace = window.Blockly?.derivWorkspace || window.Blockly?.mainWorkspace;
      if (!workspace && Date.now() < deadline) return setTimeout(load, 250);
      if (!workspace) return alert('Bot Builder is still loading. Please select the bot again in a moment.');
      workspace.strategy_to_load = xml;
      sessionStorage.setItem('profitera_selected_bot', bot.title);
      closeLibrary();
    };
    load();
  };
  const launch = async (bot, button) => {
    if (bot.launch_url) return location.assign(bot.launch_url);
    button.disabled = true; button.textContent = 'Preparing secure session...';
    try {
      if (bot.has_python_bot) {
        const response = await fetch(`${API}${encodeURIComponent(bot.slug)}/start/`, { method: 'POST', credentials: 'include' });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.detail || 'Unable to start this bot.');
        button.textContent = `Bot running on ${payload.mode || 'connected'} account`;
      } else await loadStrategy(bot);
    } catch (error) { button.disabled = false; button.textContent = 'Try again'; alert(error.message || 'Unable to launch the bot.'); }
  };
  const mount = async () => {
    if (document.querySelector('.pbt')) return;
    const style = document.createElement('style'); style.textContent = css; document.head.append(style);
    const host = document.createElement('div'); host.innerHTML = shell(); document.body.append(host.firstElementChild);
    const app = document.querySelector('.pbt'); const page = app.querySelector('[data-page]');
    try { const response = await fetch(API, { credentials: 'include' }); const payload = await response.json(); if (!response.ok) throw new Error('Log in on Profiteraa first to access your uploaded bots.'); state.bots = payload.bots || []; } catch (error) { state.bots = []; page.innerHTML = `<div class="pbt-empty"><h2>Bot Library unavailable</h2><p>${escapeHtml(error.message)}</p></div>`; return; }
    app.querySelector('[data-close]').onclick = closeLibrary;
    app.querySelectorAll('[data-nav]').forEach(button => button.onclick = () => {
      const destination = button.dataset.nav;
      if (destination === 'home' || destination === 'dashboard') location.assign('https://profiteraa.com/dashboard/');
      else if (destination === 'trade') location.assign('https://profiteraa.com/trade/');
      else if (destination === 'scanner') renderScanner(page);
      else renderLibrary(page);
    });
    renderLibrary(page);
  };
  (window.profiteraSessionReady || Promise.resolve()).then(mount, mount);
})();
