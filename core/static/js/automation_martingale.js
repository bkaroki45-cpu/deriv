(() => {
    const addMartingaleControls = () => {
        const stake = document.querySelector('#stake');
        if (!stake || document.querySelector('#martingale_multiplier')) return;

        stake.closest('label')?.insertAdjacentHTML(
            'afterend',
            '<label>Martingale recovery multiplier<input id="martingale_multiplier" value="1" type="number" min="1" max="10" step="0.1" aria-describedby="martingale_help"><small id="martingale_help">1 disables Martingale. After a loss, the next stake is multiplied by this number; after a win, it returns to your starting stake.</small></label>'
        );
        document.querySelector('.actions')?.insertAdjacentHTML(
            'beforeend',
            '<button id="reset-activity" type="button" class="stop">Reset activity</button>'
        );

        window.startRun = async () => {
            try {
                const selectedStrategy = document.querySelector('#strategy').value;
                const digits = selectedStrategy === 'under_7' ? [7, 8, 9] : [0, 1, 2];
                const thresholds = {};
                digits.forEach(digit => {
                    thresholds[digit] = document.querySelector(`#d${digit}`).value;
                });
                const multiplier = document.querySelector('#martingale_multiplier').value;
                await json(`${api}bots/${botId}/run/`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        account_id: document.querySelector('#account').value,
                        symbols: document.querySelector('#symbols').value.split(',').map(item => item.trim()).filter(Boolean),
                        scan_all_volatility: true,
                        strategy: selectedStrategy,
                        stake: document.querySelector('#stake').value,
                        martingale_multiplier: multiplier,
                        tick_window: document.querySelector('#window').value,
                        digit_thresholds: thresholds,
                        max_daily_loss: document.querySelector('#daily').value,
                        max_trades_per_day: document.querySelector('#tradecap').value,
                        confirm_live_trading: !!document.querySelector('#liveok')?.checked,
                    }),
                });
                status();
            } catch (error) {
                alert(error.message);
            }
        };

        document.querySelector('#reset-activity')?.addEventListener('click', async () => {
            if (!window.confirm('Clear the recent trades, scanner summary, and journal for this bot?')) return;
            try {
                await json(`${api}bots/${botId}/run/reset/`, { method: 'POST' });
                status();
            } catch (error) {
                alert(error.message);
            }
        });

        // A new browser tab never resumes a stored run by itself. The user must
        // press Start scanner after opening the automation page.
        if (!sessionStorage.getItem('profitera_automation_session_opened')) {
            sessionStorage.setItem('profitera_automation_session_opened', '1');
            json(`${api}bots/${botId}/run/`, { method: 'DELETE' }).then(status).catch(() => {});
        }
    };

    const timer = window.setInterval(() => {
        addMartingaleControls();
        if (document.querySelector('#martingale_multiplier')) window.clearInterval(timer);
    }, 50);
})();
