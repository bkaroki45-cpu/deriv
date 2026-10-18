(() => {
    const symbols = [
        ['1HZ10V', 'Volatility 10 (1s)'],
        ['1HZ25V', 'Volatility 25 (1s)'],
        ['1HZ50V', 'Volatility 50 (1s)'],
        ['1HZ75V', 'Volatility 75 (1s)'],
        ['1HZ100V', 'Volatility 100 (1s)'],
        ['R_10', 'Volatility 10'],
        ['R_25', 'Volatility 25'],
        ['R_50', 'Volatility 50'],
        ['R_75', 'Volatility 75'],
        ['R_100', 'Volatility 100'],
    ];
    let bots = [];
    let selectedBot = null;

    function addCapitalControls() {
        const stake = document.querySelector('#stake');
        if (!stake || document.querySelector('#martingale_multiplier')) return false;

        stake.closest('label')?.insertAdjacentHTML(
            'afterend',
            '<label>Total capital limit<input id="capital_limit" type="number" min="0.35" step="0.01" value="20"><small>Maximum combined stake for this run. Separate from stake per trade.</small></label><label>Recovery retries<input id="max_martingale_steps" type="number" min="0" max="10" step="1" value="3"><small>Retries after the first loss. The bot stops when this limit, capital, or the first win is reached.</small></label><label>Martingale multiplier<input id="martingale_multiplier" value="2" type="number" min="1" max="15" step="0.1" aria-describedby="martingale_help"><small id="martingale_help">After a loss, the next stake is multiplied by this amount.</small></label>'
        );
        document.querySelector('.actions')?.insertAdjacentHTML(
            'beforeend',
            '<button id="reset-activity" type="button" class="stop">Reset activity</button>'
        );
        return true;
    }

    function ensureBotPicker() {
        const form = document.querySelector('.form');
        if (!form || document.querySelector('#automation-bot')) return;
        form.insertAdjacentHTML('afterbegin', '<label class="wide bot-library-picker">Bot library<select id="automation-bot"></select></label>');
        document.querySelector('.card')?.classList.add('automation-card');
        const style = document.createElement('style');
        style.textContent = '.bot-library-picker{grid-column:1/-1}.automation-card h2{font-size:19px}.even-odd-hud{margin-top:16px;padding:16px;border:1px solid #26516b;border-radius:12px;background:linear-gradient(135deg,#0b1b2a,#101a2c)}.eo-hud-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:14px}.eo-hud-head strong{font-size:12px;letter-spacing:.08em;text-transform:uppercase}.eo-live{display:flex;align-items:center;gap:7px;color:#7ee9c0;font-size:11px}.eo-live i{width:7px;height:7px;border-radius:50%;background:#53e3ad;box-shadow:0 0 12px #53e3ad;animation:eo-pulse 1.5s infinite}.eo-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.eo-stat{padding:10px;border:1px solid #24364d;border-radius:8px;background:#08121f}.eo-stat span{display:block;color:#8ea1b5;font-size:10px}.eo-stat b{display:block;margin-top:5px;font-size:14px;color:#e9f5f6;overflow-wrap:anywhere}.eo-bars{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}.eo-bar{height:6px;margin-top:7px;border-radius:5px;background:#1d2b3c;overflow:hidden}.eo-bar i{display:block;height:100%;background:linear-gradient(90deg,#41d8ae,#61bbf1);transition:width .25s}.eo-bar.odd i{background:linear-gradient(90deg,#b794ff,#69b9ff)}.eo-hud-note{margin:12px 0 0;color:#8ea1b5;font-size:11px}.eo-sequence-done{color:#61d7a8!important}@keyframes eo-pulse{50%{opacity:.45}}@media(max-width:720px){.eo-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}';
        document.head.appendChild(style);
        const liveCard = document.querySelector('#live')?.closest('.card');
        liveCard?.insertAdjacentHTML('beforeend', '<section class="even-odd-hud" id="even-odd-hud" hidden><div class="eo-hud-head"><strong>Parity signal monitor</strong><span class="eo-live"><i></i><span data-eo-live>Scanning</span></span></div><div class="eo-grid"><div class="eo-stat"><span>Strongest volatility</span><b data-eo-symbol>-</b></div><div class="eo-stat"><span>Leading parity and gap</span><b data-eo-pair>Waiting for 1,000 ticks</b></div><div class="eo-stat"><span>Trade direction</span><b data-eo-contract>Waiting for 51%</b></div><div class="eo-stat"><span>Recovery step</span><b data-eo-step>0 retries</b></div><div class="eo-stat"><span>Capital used</span><b data-eo-capital>0.00 / 20.00</b></div><div class="eo-stat"><span>Realized P/L</span><b data-eo-pnl>0.00</b></div><div class="eo-stat"><span>Active contract</span><b data-eo-active>None</b></div><div class="eo-stat"><span>Run state</span><b data-eo-status>Stopped</b></div></div><div class="eo-bars"><div class="eo-stat"><span>Even digits <b data-eo-even>0%</b></span><div class="eo-bar"><i data-eo-even-bar style="width:0%"></i></div></div><div class="eo-stat"><span>Odd digits <b data-eo-odd>0%</b></span><div class="eo-bar odd"><i data-eo-odd-bar style="width:0%"></i></div></div></div><p class="eo-hud-note" data-eo-note>Scanning all open Volatility markets. A parity must reach 51% before a trade.</p></section>');
    }

    function setSymbolControl(isEvenOdd) {
        const current = document.querySelector('#symbols');
        if (!current) return;
        if (isEvenOdd && !(current.tagName === 'INPUT' && current.readOnly)) {
            const input = document.createElement('input');
            input.id = 'symbols';
            input.value = 'All active Volatility markets';
            input.readOnly = true;
            input.setAttribute('aria-label', 'All active Volatility markets');
            current.replaceWith(input);
            const label = input.closest('label');
            if (label) label.firstChild.textContent = 'Markets scanned automatically';
        } else if (!isEvenOdd && (current.tagName === 'SELECT' || current.readOnly)) {
            const input = document.createElement('input');
            input.id = 'symbols';
            input.value = '1HZ10V,1HZ25V,1HZ50V';
            input.setAttribute('aria-label', 'Markets');
            current.replaceWith(input);
            const label = input.closest('label');
            if (label) label.firstChild.textContent = 'Volatility indices ';
        }
    }

    function setSelectedBot(bot) {
        selectedBot = bot;
        botId = bot.id;
        const brand = document.querySelector('.top .brand');
        if (brand) brand.textContent = bot.name;
        const title = document.querySelector('.layout .card h2');
        const description = document.querySelector('.layout .card p.muted');
        if (title) title.textContent = bot.name;
        if (description) description.textContent = bot.strategy === 'even_odd'
            ? 'Scans every active Volatility market and trades the leading parity only when it reaches 51%.'
            : bot.description;

        const isEvenOdd = bot.strategy === 'even_odd';
        const isHighPair = bot.strategy === 'high_pair';
        const isManagedBot = isEvenOdd || isHighPair;
        const strategy = document.querySelector('#strategy');
        if (strategy) {
            strategy.disabled = isManagedBot;
            strategy.innerHTML = isEvenOdd
                ? '<option value="even_odd">Two same parity digits → opposite parity</option>'
                : isHighPair
                    ? '<option value="high_pair">Rare 0/1/2, then two 7/8/9 → Over 2</option>'
                : '<option value="auto">Automatic digit scanner</option><option value="over_2">Over 2</option><option value="under_7">Under 7</option>';
            strategy.value = isManagedBot ? bot.strategy : 'auto';
            if (isEvenOdd && strategy.options[0]) strategy.options[0].textContent = 'Largest even/odd gap (minimum 51%)';
        }
        document.querySelector('#thresholds')?.classList.toggle('hidden', isManagedBot);
        setSymbolControl(isEvenOdd);
        document.querySelector('#symbols')?.closest('label')?.classList.toggle('hidden', isHighPair);
        document.querySelector('#capital_limit')?.closest('label')?.classList.toggle('hidden', !isEvenOdd);
        document.querySelector('#max_martingale_steps')?.closest('label')?.classList.toggle('hidden', !isManagedBot);
        document.querySelector('#martingale_multiplier')?.closest('label')?.classList.toggle('hidden', !isManagedBot);
        document.querySelector('#even-odd-hud')?.toggleAttribute('hidden', !isEvenOdd);
        updateAccountOptions();
        status();
    }

    function updateAccountOptions() {
        const picker = document.querySelector('#account');
        if (!picker) return;
        const isManagedBot = ['even_odd', 'high_pair'].includes(selectedBot?.strategy);
        for (const option of picker.options) {
            const isReal = option.dataset.live === '1';
            option.disabled = isManagedBot && isReal;
            option.hidden = isManagedBot && isReal;
        }
        if (isManagedBot && picker.selectedOptions[0]?.dataset.live === '1') {
            const demo = [...picker.options].find(option => option.dataset.live === '0');
            if (demo) picker.value = demo.value;
        }
        const liveConfirmation = document.querySelector('#liveconfirm');
        liveConfirmation?.classList.toggle('hidden', isManagedBot || picker.selectedOptions[0]?.dataset.live !== '1');
    }

    async function loadBotLibrary() {
        try {
            const data = await json(`${api}bots/`);
            bots = data.bots || [];
            const picker = document.querySelector('#automation-bot');
            if (!picker || !bots.length) return;
            picker.replaceChildren(...bots.map(bot => {
                const option = document.createElement('option');
                option.value = String(bot.id);
                option.textContent = `${bot.name}${bot.strategy === 'even_odd' ? ' · EVEN/ODD' : bot.strategy === 'high_pair' ? ' · HIGH PAIR' : ''}`;
                return option;
            }));
            const requested = new URLSearchParams(window.location.search).get('bot');
            const initial = bots.find(bot => String(bot.id) === requested)
                || bots.find(bot => bot.strategy === 'even_odd')
                || bots[0];
            picker.value = String(initial.id);
            setSelectedBot(initial);
            picker.addEventListener('change', () => {
                const bot = bots.find(item => String(item.id) === picker.value);
                if (bot) setSelectedBot(bot);
            });
        } catch (error) {
            console.error('Unable to load the bot library:', error);
        }
    }

    function recoveryStep(trades) {
        let losses = 0;
        for (const trade of trades || []) {
            if (trade.status === 'open') continue;
            if (trade.status === 'lost') losses += 1;
            else break;
        }
        return losses;
    }

    async function updateParityHud() {
        if (!selectedBot || selectedBot.strategy !== 'even_odd') return;
        try {
            const run = await json(`${api}bots/${botId}/run/`);
            const market = run.stats?.markets?.[run.selected_symbol] || {};
            const pair = market.last_pair || [];
            const step = Math.min(recoveryStep(run.trades), Number(run.max_martingale_steps || 0));
            const used = Number(run.capital_used || 0);
            const limit = Number(run.capital_limit || 0);
            const even = Number(market.even_percent || 0);
            const odd = Number(market.odd_percent || 0);
            const set = (selector, value) => {
                const node = document.querySelector(selector);
                if (node) node.textContent = value;
            };
            set('[data-eo-symbol]', market.name || run.selected_symbol || 'Scanning all markets');
            set('[data-eo-pair]', pair.length === 2 ? `${pair[0]}  →  ${pair[1]}` : 'Collecting first pair');
            set('[data-eo-contract]', market.signal_contract || 'Waiting for pair');
            set('[data-eo-pair]', market.dominant_parity
                ? `${market.dominant_parity} leads by ${Number(market.parity_difference || 0).toFixed(2)}%`
                : 'Collecting 1,000 ticks');
            set('[data-eo-contract]', market.eligible ? market.signal_contract : 'Waiting for 51%');
            set('[data-eo-step]', `${step} / ${run.max_martingale_steps || 0} retries`);
            set('[data-eo-capital]', `${used.toFixed(2)} / ${limit.toFixed(2)} ${run.currency || ''}`);
            set('[data-eo-pnl]', `${Number(run.profit_loss || 0).toFixed(2)} ${run.currency || ''}`);
            set('[data-eo-active]', run.active_contract_id || 'None');
            set('[data-eo-status]', run.stats?.sequence_status || run.status);
            set('[data-eo-live]', run.status === 'running' ? 'LIVE SCAN' : 'MONITOR');
            set('[data-eo-even]', `${even.toFixed(1)}%`);
            set('[data-eo-odd]', `${odd.toFixed(1)}%`);
            set('[data-eo-note]', market.status || run.error || 'Scanning all active Volatility markets for the largest parity gap.');
            const evenBar = document.querySelector('[data-eo-even-bar]');
            const oddBar = document.querySelector('[data-eo-odd-bar]');
            if (evenBar) evenBar.style.width = `${Math.min(100, even)}%`;
            if (oddBar) oddBar.style.width = `${Math.min(100, odd)}%`;
            document.querySelector('[data-eo-pnl]')?.classList.toggle('eo-sequence-done', run.status === 'stopped' && Number(run.profit_loss) > 0);
        } catch (error) {
            const note = document.querySelector('[data-eo-note]');
            if (note) note.textContent = error.message;
        }
    }

    async function initialize() {
        ensureBotPicker();
        // The template already has a markets input; keep it and replace it with a selector for this strategy.
        addCapitalControls();
        ensureBotPicker();
        const accountPicker = document.querySelector('#account');
        accountPicker?.addEventListener('change', () => {
            if (['even_odd', 'high_pair'].includes(selectedBot?.strategy) && accountPicker.selectedOptions[0]?.dataset.live === '1') {
                const demo = [...accountPicker.options].find(option => option.dataset.live === '0');
                if (demo) accountPicker.value = demo.value;
                alert('This bot is limited to Demo accounts.');
            }
            updateAccountOptions();
        });
        if (accountPicker) {
            new MutationObserver(updateAccountOptions).observe(accountPicker, { childList: true });
        }
        await loadBotLibrary();
        if (!sessionStorage.getItem('profitera_automation_session_opened')) {
            sessionStorage.setItem('profitera_automation_session_opened', '1');
            if (selectedBot) json(`${api}bots/${botId}/run/`, { method: 'DELETE' }).then(status).catch(() => {});
        }
        window.startRun = async () => {
            try {
                const isEvenOdd = selectedBot?.strategy === 'even_odd';
                const isHighPair = selectedBot?.strategy === 'high_pair';
                const isManagedBot = isEvenOdd || isHighPair;
                const selectedStrategy = isManagedBot ? selectedBot.strategy : document.querySelector('#strategy').value;
                const digits = selectedStrategy === 'under_7' ? [7, 8, 9] : [0, 1, 2];
                const thresholds = {};
                digits.forEach(digit => {
                    const field = document.querySelector(`#d${digit}`);
                    if (field) thresholds[digit] = field.value;
                });
                const symbolControl = document.querySelector('#symbols');
                const chosenSymbols = isEvenOdd
                    ? []
                    : symbolControl.value.split(',').map(item => item.trim()).filter(Boolean);
                await json(`${api}bots/${botId}/run/`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        account_id: document.querySelector('#account').value,
                        symbols: chosenSymbols,
                        scan_all_volatility: true,
                        strategy: selectedStrategy,
                        stake: document.querySelector('#stake').value,
                        capital_limit: isEvenOdd ? document.querySelector('#capital_limit').value : '',
                        max_martingale_steps: isManagedBot ? document.querySelector('#max_martingale_steps').value : 0,
                        martingale_multiplier: document.querySelector('#martingale_multiplier').value,
                        tick_window: document.querySelector('#window').value,
                        digit_thresholds: thresholds,
                        max_daily_loss: document.querySelector('#daily').value,
                        max_trades_per_day: document.querySelector('#tradecap').value,
                        confirm_live_trading: !!document.querySelector('#liveok')?.checked,
                    }),
                });
                status();
                updateParityHud();
            } catch (error) {
                alert(error.message);
            }
        };
        document.querySelector('#reset-activity')?.addEventListener('click', async () => {
            try {
                await json(`${api}bots/${botId}/run/reset/`, { method: 'POST' });
                status();
            } catch (error) {
                alert(error.message);
            }
        });
        document.addEventListener('click', event => {
            if (event.target?.id === 'start') {
                event.preventDefault();
                event.stopImmediatePropagation();
                window.startRun();
            }
        }, true);
        window.setInterval(updateParityHud, 1000);
    }

    const timer = window.setInterval(() => {
        if (!document.querySelector('#stake')) return;
        window.clearInterval(timer);
        initialize();
    }, 50);
})();
