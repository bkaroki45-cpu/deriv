(() => {
  const api = 'https://profiteraa.com/api/bots/';
  const escapeHtml = value => String(value || '').replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));

  const injectStyle = () => {
    const style = document.createElement('style');
    style.textContent = `
      .profitera-library{position:fixed;z-index:2147483000;inset:0;overflow:auto;background:linear-gradient(135deg,#f7f8ff,#fff 45%,#fff2f6);padding:34px;color:#1e2030;font-family:Inter,Arial,sans-serif}.profitera-library__head{max-width:1180px;margin:auto;display:flex;justify-content:space-between;gap:24px;align-items:end}.profitera-library h1{font-size:34px;margin:0 0 8px}.profitera-library p{margin:0;color:#676b7d;font-size:15px}.profitera-library__close{border:0;border-radius:999px;padding:12px 18px;background:#20233a;color:#fff;font-weight:700;cursor:pointer}.profitera-library__grid{max-width:1180px;margin:28px auto;display:grid;grid-template-columns:repeat(auto-fit,minmax(255px,1fr));gap:18px}.profitera-bot-card{position:relative;overflow:hidden;border:1px solid #e6e7f0;border-radius:20px;background:#fff;padding:22px;box-shadow:0 10px 28px #1d204212;transition:transform .2s ease,box-shadow .2s ease;cursor:pointer}.profitera-bot-card:hover{transform:translateY(-7px);box-shadow:0 20px 38px #1d204225}.profitera-bot-card:before{content:'';position:absolute;inset:0 0 auto;height:5px;background:linear-gradient(90deg,#ff496f,#8e59ff)}.profitera-bot-card__kind{display:inline-flex;padding:5px 9px;border-radius:999px;background:#fff0f4;color:#df2853;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em}.profitera-bot-card h2{font-size:20px;margin:15px 0 9px}.profitera-bot-card__meta{display:flex;flex-wrap:wrap;gap:7px;margin:16px 0}.profitera-bot-card__meta span{background:#f3f4fb;border-radius:7px;padding:6px 8px;font-size:12px;color:#565b71}.profitera-bot-card button{width:100%;border:0;border-radius:10px;padding:12px;background:#ff3e67;color:#fff;font-weight:800;cursor:pointer}.profitera-library__empty{max-width:640px;margin:70px auto;text-align:center;background:#fff;border-radius:18px;padding:36px;box-shadow:0 12px 30px #1d204214}.profitera-library__notice{max-width:1180px;margin:0 auto 16px;color:#b22045;font-weight:600}.profitera-library__image{width:48px;height:48px;object-fit:cover;border-radius:13px;float:right}@media(max-width:640px){.profitera-library{padding:20px}.profitera-library__head{align-items:start;flex-direction:column}.profitera-library h1{font-size:27px}}`;
    document.head.appendChild(style);
  };

  const loadStrategy = async (slug, title) => {
    const response = await fetch(`${api}${encodeURIComponent(slug)}/strategy/`, { credentials: 'include' });
    if (!response.ok) throw new Error('This bot has no runnable XML strategy yet.');
    const xml = await response.text();
    const deadline = Date.now() + 15000;
    const load = () => {
      const workspace = window.Blockly && window.Blockly.derivWorkspace;
      if (!workspace) {
        if (Date.now() < deadline) return setTimeout(load, 250);
        throw new Error('Bot Builder is still loading. Please select the bot again in a moment.');
      }
      const dom = window.Blockly.utils.xml.textToDom(xml);
      window.Blockly.Xml.clearWorkspaceAndLoadFromXml(dom, workspace);
      workspace.strategy_to_load = xml;
      workspace.clearUndo();
      window.dispatchEvent(new Event('resize'));
      document.querySelector('.profitera-library')?.remove();
      sessionStorage.setItem('profitera_selected_bot', title);
    };
    load();
  };

  const mount = async () => {
    injectStyle();
    const panel = document.createElement('section');
    panel.className = 'profitera-library';
    panel.innerHTML = '<div class="profitera-library__head"><div><h1>Bot Library</h1><p>Choose a verified strategy, review its risk, then load it into Bot Builder.</p></div><button class="profitera-library__close">Open blank builder</button></div><div class="profitera-library__grid"><div class="profitera-library__empty">Loading available bots…</div></div>';
    document.body.appendChild(panel);
    panel.querySelector('.profitera-library__close').onclick = () => panel.remove();
    const grid = panel.querySelector('.profitera-library__grid');
    try {
      const response = await fetch(api, { credentials: 'include', headers: { Accept: 'application/json' } });
      const payload = await response.json();
      if (!response.ok) throw new Error('Log in on Profiteraa first to access the Bot Library.');
      const bots = payload.bots || [];
      if (!bots.length) { grid.innerHTML = '<div class="profitera-library__empty"><h2>No bots published yet</h2><p>Your administrator can add Deriv or AI-assisted bots from the Profiteraa admin page.</p></div>'; return; }
      grid.innerHTML = bots.map(bot => `<article class="profitera-bot-card" data-slug="${escapeHtml(bot.slug)}" data-launch-url="${escapeHtml(bot.launch_url)}"><span class="profitera-bot-card__kind">${bot.kind === 'ai' ? 'AI-assisted' : 'Deriv bot'}</span>${bot.cover_image ? `<img class="profitera-library__image" src="${escapeHtml(bot.cover_image)}" alt="">` : ''}<h2>${escapeHtml(bot.title)}</h2><p>${escapeHtml(bot.description)}</p>${bot.ai_summary ? `<p style="margin-top:10px"><b>AI:</b> ${escapeHtml(bot.ai_summary)}</p>` : ''}<div class="profitera-bot-card__meta">${bot.market ? `<span>${escapeHtml(bot.market)}</span>` : ''}${bot.risk_level ? `<span>${escapeHtml(bot.risk_level)} risk</span>` : ''}${bot.minimum_stake ? `<span>Min $${escapeHtml(bot.minimum_stake)}</span>` : ''}${(bot.tags || []).map(tag => `<span>${escapeHtml(tag)}</span>`).join('')}</div><button ${bot.has_strategy || bot.launch_url ? '' : 'disabled'}>${bot.launch_url ? 'Open AI scanner' : bot.has_strategy ? 'Load in Bot Builder' : 'Analysis bot — setup required'}</button></article>`).join('');
      grid.querySelectorAll('[data-slug]').forEach(card => card.addEventListener('click', async event => {
        if (event.target.tagName === 'BUTTON' && event.target.disabled) return;
        if (card.dataset.launchUrl) { window.location.assign(card.dataset.launchUrl); return; }
        try { await loadStrategy(card.dataset.slug, card.querySelector('h2').textContent); } catch (error) { alert(error.message || 'Unable to load this strategy.'); }
      }));
    } catch (error) {
      grid.innerHTML = `<div class="profitera-library__empty"><h2>Bot Library unavailable</h2><p>${escapeHtml(error.message || 'Please try again.')}</p></div>`;
    }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true }); else mount();
})();
