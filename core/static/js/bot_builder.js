(function () {
    const shell = document.querySelector(".dbot-shell");
    const modalLayer = document.getElementById("bot-modal-layer");
    const stage = document.getElementById("builder-stage");
    const journal = document.querySelector("[data-journal]");
    const stats = {
        stake: document.querySelector('[data-stat="stake"]'),
        payout: document.querySelector('[data-stat="payout"]'),
        runs: document.querySelector('[data-stat="runs"]'),
        lost: document.querySelector('[data-stat="lost"]'),
        won: document.querySelector('[data-stat="won"]'),
        profit: document.querySelector('[data-stat="profit"]'),
    };
    const controls = {
        stake: document.querySelector("[data-bot-stake]"),
        duration: document.querySelector("[data-bot-duration]"),
        maxBuys: document.querySelector("[data-bot-max-buys]"),
        cooldown: document.querySelector("[data-bot-cooldown]"),
    };

    let running = false;
    let runCount = 0;
    let zoom = 1;
    let botStrategy = "rise_fall";
    const autoBuy = {
        inFlight: false,
        buys: 0,
        cooldownUntil: 0,
        lastSignalKey: "",
    };
    const botMarket = {
        symbol: "1HZ10V",
        name: "Volatility 10 (1s) Index",
        socket: null,
        reconnectTimer: null,
        ticks: [],
        digits: Array.from({ length: 10 }, () => 0),
        lastDigit: null,
        lastPrice: null,
        lastQuote: "",
        pipSize: 2,
    };

    const flyoutCopy = {
        "Trade parameters": ["Configure market, contract type, duration, stake, and startup behavior.", "Market > Contract > Stake"],
        "Purchase conditions": ["Define the rule that decides when the bot buys a contract.", "Purchase Rise/Fall"],
        "Sell conditions (optional)": ["Add optional logic for selling when the API allows early exit.", "if Sell is available"],
        "Restart trading conditions": ["Control whether the strategy loops after a contract settles.", "Trade again"],
        Analysis: ["Use historical ticks, last digit stats, and indicators for decisions.", "Last digit / Moving average"],
        Utility: ["Helpers for notifications, comparisons, and strategy control.", "Notify / Stop / Variables"],
    };

    function log(message) {
        if (!journal) return;
        const stamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        journal.textContent = `[${stamp}] ${message}\n${journal.textContent}`.slice(0, 4000);
    }

    function csrfToken() {
        const match = document.cookie.match(/(?:^|; )csrftoken=([^;]+)/);
        return match ? decodeURIComponent(match[1]) : "";
    }

    function numericControl(node, fallback, min, max) {
        const value = Number(node?.value);
        if (!Number.isFinite(value)) return fallback;
        return Math.min(max, Math.max(min, value));
    }

    function autoSettings() {
        return {
            stake: numericControl(controls.stake, 1, 0.35, 1000),
            duration: Math.round(numericControl(controls.duration, 1, 1, 10)),
            maxBuys: Math.round(numericControl(controls.maxBuys, 3, 1, 20)),
            cooldownMs: Math.round(numericControl(controls.cooldown, 8, 3, 120)) * 1000,
        };
    }

    function sessionConnected() {
        return Boolean(window.PROFITERA_DERIV_SESSION && window.PROFITERA_DERIV_SESSION.connected);
    }

    function formatPrice(price) {
        const value = Number(price);
        if (!Number.isFinite(value)) return "Waiting";
        const pipSize = Number.isInteger(botMarket.pipSize) ? botMarket.pipSize : 2;
        return value.toLocaleString(undefined, { minimumFractionDigits: pipSize, maximumFractionDigits: pipSize });
    }

    function digitFromTick(price, quote, pipSize) {
        const text = quote
            ? String(quote)
            : Number.isFinite(Number(price)) && Number.isInteger(Number(pipSize))
                ? Number(price).toFixed(Number(pipSize))
                : String(price);
        const digits = text.replace(/[^0-9]/g, "");
        return digits ? Number(digits.charAt(digits.length - 1)) : null;
    }

    function setConnection(online) {
        document.querySelectorAll("[data-bot-connection]").forEach((node) => {
            node.classList.toggle("is-live", online);
            node.title = online ? "Connected to Deriv live ticks" : "Deriv live ticks reconnecting";
        });
    }

    function renderLiveHeader() {
        document.querySelectorAll("[data-bot-market-name], [data-bot-live-name]").forEach((node) => {
            node.textContent = botMarket.name;
        });
        document.querySelectorAll("[data-bot-live-symbol]").forEach((node) => {
            node.textContent = botMarket.symbol;
        });
        document.querySelectorAll("[data-bot-live-price]").forEach((node) => {
            node.textContent = botMarket.lastQuote || formatPrice(botMarket.lastPrice);
        });
        document.querySelectorAll("[data-bot-live-digit]").forEach((node) => {
            node.textContent = botMarket.lastDigit === null ? "Digit -" : `Digit ${botMarket.lastDigit}`;
        });
    }

    function renderBotChart() {
        const line = document.querySelector("[data-bot-live-line]");
        const area = document.querySelector("[data-bot-live-area]");
        if (!line || !area || botMarket.ticks.length < 2) return;
        const points = botMarket.ticks.slice(-120);
        const prices = points.map((tick) => tick.price);
        const min = Math.min(...prices);
        const max = Math.max(...prices);
        const span = max - min || Math.max(Math.abs(max) * 0.0001, 1);
        const width = 900;
        const height = 460;
        const padX = 24;
        const padY = 34;
        const plotW = width - padX * 2;
        const plotH = height - padY * 2;
        const coords = points.map((tick, index) => {
            const x = padX + (points.length === 1 ? plotW : (index / (points.length - 1)) * plotW);
            const y = padY + ((max - tick.price) / span) * plotH;
            return [x, y];
        });
        const path = coords.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
        const areaPath = `${path} L${coords[coords.length - 1][0].toFixed(1)} ${height - padY} L${coords[0][0].toFixed(1)} ${height - padY} Z`;
        line.setAttribute("d", path);
        area.setAttribute("d", areaPath);
    }

    function renderDigitStats() {
        const total = botMarket.digits.reduce((sum, count) => sum + count, 0);
        if (stats.runs) stats.runs.textContent = String(total);
        if (stats.lost) stats.lost.textContent = botMarket.lastDigit === null ? "0" : String(botMarket.lastDigit);
        if (stats.won) {
            const max = Math.max(...botMarket.digits);
            const hotDigit = max > 0 ? botMarket.digits.findIndex((count) => count === max) : "-";
            stats.won.textContent = String(hotDigit);
        }
        if (stats.stake) stats.stake.textContent = botMarket.lastQuote || formatPrice(botMarket.lastPrice);
        if (stats.payout) {
            const count = botMarket.lastDigit === null ? 0 : botMarket.digits[botMarket.lastDigit];
            const pct = total ? (count / total) * 100 : 0;
            stats.payout.textContent = `${pct.toFixed(1)}%`;
        }
        if (stats.profit) {
            stats.profit.textContent = running ? `Auto ${autoBuy.buys}` : "Ready";
            stats.profit.className = "is-neutral";
        }
    }

    function addTransaction(signal, status, message) {
        const table = document.querySelector(".dbot-table");
        if (!table) return;
        table.querySelector(".empty-row")?.remove();
        const cells = [
            new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
            botMarket.symbol,
            botMarket.lastQuote || formatPrice(botMarket.lastPrice),
            botMarket.lastDigit === null ? "-" : String(botMarket.lastDigit),
            signal?.label || signal?.contract_type || "-",
            message || status,
        ];
        cells.forEach((text, index) => {
            const cell = document.createElement("small");
            cell.textContent = text;
            if (index === 5) cell.className = status === "executed" ? "is-success" : status === "pending" ? "is-pending" : "is-error";
            table.appendChild(cell);
        });
    }

    function signalFromLiveMarket() {
        const latest = botMarket.ticks[botMarket.ticks.length - 1];
        const previous = botMarket.ticks[botMarket.ticks.length - 2];
        if (!latest) return null;

        if (botStrategy === "digits") {
            const total = botMarket.digits.reduce((sum, count) => sum + count, 0);
            if (total < 10 || botMarket.lastDigit === null) return null;
            return {
                direction: "differs",
                contract_type: "DIGITDIFF",
                barrier: String(botMarket.lastDigit),
                duration: 1,
                label: `Digit differs ${botMarket.lastDigit}`,
                key: `${latest.epoch}:DIGITDIFF:${botMarket.lastDigit}`,
            };
        }

        if (botStrategy === "rise_fall") {
            if (!previous || latest.price === previous.price) return null;
            const rising = latest.price > previous.price;
            return {
                direction: rising ? "rise" : "fall",
                contract_type: rising ? "CALL" : "PUT",
                label: rising ? "Rise from tick" : "Fall from tick",
                key: `${latest.epoch}:${rising ? "CALL" : "PUT"}`,
            };
        }

        return null;
    }

    async function placeAutoBuy(signal) {
        const settings = autoSettings();
        if (autoBuy.buys >= settings.maxBuys) {
            updateRunningState(false);
            log(`Auto-buy stopped after reaching ${settings.maxBuys} buys.`);
            return;
        }
        autoBuy.inFlight = true;
        addTransaction(signal, "pending", "Sending");
        const payload = {
            symbol: botMarket.symbol,
            direction: signal.direction,
            contract_type: signal.contract_type,
            stake: String(settings.stake),
            duration: String(signal.duration || settings.duration),
            duration_unit: "t",
        };
        if (signal.barrier !== undefined) payload.barrier = signal.barrier;

        try {
            const response = await fetch("/api/trading/", {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRFToken": csrfToken(),
                },
                body: JSON.stringify(payload),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || data.error) {
                throw new Error(data.error || `Trade request failed with ${response.status}`);
            }
            autoBuy.buys += 1;
            const contractId = data.contract_id || data.deriv_response?.buy?.contract_id || "accepted";
            addTransaction(signal, "executed", String(contractId));
            log(`Auto-buy executed: ${signal.label}, stake ${settings.stake}, contract ${contractId}.`);
        } catch (error) {
            addTransaction(signal, "error", error.message || "Rejected");
            log(`Auto-buy rejected: ${error.message || "Unknown Deriv error"}.`);
        } finally {
            const lockMs = Math.max(settings.cooldownMs, (Number(signal.duration || settings.duration) + 1) * 1200);
            autoBuy.cooldownUntil = Date.now() + lockMs;
            autoBuy.inFlight = false;
            renderDigitStats();
        }
    }

    function maybeAutoBuy() {
        if (!running || autoBuy.inFlight) return;
        if (!sessionConnected()) {
            updateRunningState(false);
            log("Login with Deriv before running auto-buy.");
            return;
        }
        if (botStrategy === "martingale") {
            updateRunningState(false);
            log("Martingale auto-buy is disabled until exact loss limits and recovery rules are configured.");
            return;
        }
        if (Date.now() < autoBuy.cooldownUntil) return;
        const signal = signalFromLiveMarket();
        if (!signal || signal.key === autoBuy.lastSignalKey) return;
        autoBuy.lastSignalKey = signal.key;
        placeAutoBuy(signal);
    }

    function ingestLiveTick(tick) {
        const price = Number(tick.quote);
        if (!Number.isFinite(price)) return;
        botMarket.lastPrice = price;
        botMarket.lastQuote = String(tick.quote);
        botMarket.pipSize = Number.isInteger(Number(tick.pip_size)) ? Number(tick.pip_size) : botMarket.pipSize;
        const digit = digitFromTick(price, botMarket.lastQuote, botMarket.pipSize);
        if (Number.isInteger(digit) && digit >= 0 && digit <= 9) {
            botMarket.lastDigit = digit;
            botMarket.digits[digit] += 1;
        }
        botMarket.ticks.push({ price, epoch: Number(tick.epoch) || Date.now() / 1000 });
        if (botMarket.ticks.length > 500) botMarket.ticks.shift();
        renderLiveHeader();
        renderBotChart();
        renderDigitStats();
        if (running) {
            log(`${botMarket.symbol} ${botMarket.lastQuote} live tick${botMarket.lastDigit === null ? "" : `, last digit ${botMarket.lastDigit}`}.`);
            maybeAutoBuy();
        }
    }

    function connectDerivTicks() {
        clearTimeout(botMarket.reconnectTimer);
        if (botMarket.socket && [WebSocket.CONNECTING, WebSocket.OPEN].includes(botMarket.socket.readyState)) return;
        const appId = window.PROFITERA_DERIV_APP_ID || "1089";
        botMarket.socket = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${encodeURIComponent(appId)}`);
        botMarket.socket.addEventListener("open", () => {
            setConnection(true);
            botMarket.socket.send(JSON.stringify({ ticks: botMarket.symbol, subscribe: 1 }));
            log(`Connected to Deriv live market ${botMarket.symbol}.`);
        });
        botMarket.socket.addEventListener("message", (event) => {
            let payload;
            try {
                payload = JSON.parse(event.data);
            } catch (error) {
                return;
            }
            if (payload.error) {
                log(`Deriv market error: ${payload.error.message || "Unknown error"}.`);
                return;
            }
            if (payload.tick) ingestLiveTick(payload.tick);
        });
        botMarket.socket.addEventListener("close", () => {
            setConnection(false);
            botMarket.reconnectTimer = setTimeout(connectDerivTicks, 2500);
        });
        botMarket.socket.addEventListener("error", () => setConnection(false));
    }

    function setPage(name) {
        document.querySelectorAll("[data-bot-tab]").forEach((button) => {
            button.classList.toggle("is-active", button.dataset.botTab === name);
        });
        document.querySelectorAll("[data-bot-page]").forEach((page) => {
            page.classList.toggle("is-active", page.dataset.botPage === name);
        });
        log(`Opened ${name.replace("_", " ")} tab.`);
    }

    function setMonitorTab(name) {
        document.querySelectorAll("[data-monitor-tab]").forEach((button) => {
            button.classList.toggle("is-active", button.dataset.monitorTab === name);
        });
        document.querySelectorAll("[data-monitor-panel]").forEach((panel) => {
            panel.classList.toggle("is-active", panel.dataset.monitorPanel === name);
        });
    }

    function updateRunningState(next) {
        running = next;
        shell?.setAttribute("data-bot-running", running ? "true" : "false");
        document.querySelectorAll("[data-bot-status]").forEach((status) => {
            status.innerHTML = `<i></i>${running ? "Running" : "Bot is not running"}`;
        });
        document.querySelectorAll("[data-bot-run]").forEach((button) => { button.hidden = running; });
        document.querySelectorAll("[data-bot-stop]").forEach((button) => { button.hidden = !running; });
        document.querySelector("[data-summary-empty]")?.classList.toggle("is-hidden", running);
        if (running) {
            runCount += 1;
            autoBuy.inFlight = false;
            autoBuy.buys = 0;
            autoBuy.cooldownUntil = 0;
            autoBuy.lastSignalKey = "";
            renderDigitStats();
            log(`Auto-buy started on ${botMarket.symbol} using ${botStrategy.replace("_", "/")} strategy.`);
            maybeAutoBuy();
        } else {
            log("Bot monitor stopped.");
        }
    }

    function showFlyout(label) {
        const flyout = document.querySelector("[data-block-flyout]");
        if (!flyout) return;
        const [copy, preview] = flyoutCopy[label] || flyoutCopy.Utility;
        flyout.querySelector("[data-flyout-title]").textContent = label;
        flyout.querySelector("[data-flyout-copy]").textContent = copy;
        flyout.querySelector("[data-flyout-preview]").textContent = preview;
        flyout.hidden = false;
        document.querySelectorAll("[data-block-info]").forEach((button) => {
            button.classList.toggle("is-active", button.dataset.blockInfo === label);
        });
    }

    function openModal(name) {
        if (!modalLayer) return;
        modalLayer.hidden = false;
        document.querySelectorAll("[data-bot-panel]").forEach((panel) => {
            panel.hidden = panel.dataset.botPanel !== name;
        });
    }

    function closeModal() {
        if (modalLayer) modalLayer.hidden = true;
    }

    function setLoadTab(name) {
        document.querySelectorAll("[data-load-tab]").forEach((button) => {
            button.classList.toggle("is-active", button.dataset.loadTab === name);
        });
        document.querySelectorAll("[data-load-panel]").forEach((panel) => {
            panel.classList.toggle("is-active", panel.dataset.loadPanel === name);
        });
    }

    function serializeWorkspace() {
        const blocks = [...document.querySelectorAll("[data-block-label]")].map((block) => ({
            label: block.dataset.blockLabel,
            text: block.innerText.trim(),
        }));
        return `<xml xmlns="https://developers.google.com/blockly/xml">${blocks.map((block) => (
            `<block type="${block.label.toLowerCase().replaceAll(" ", "_").replaceAll("(", "").replaceAll(")", "")}"><field name="LABEL">${block.label}</field></block>`
        )).join("")}</xml>`;
    }

    function downloadXml() {
        const name = (document.querySelector("[data-save-name]")?.value || "profitera-strategy").trim().replace(/[^\w.-]+/g, "-");
        const blob = new Blob([serializeWorkspace()], { type: "application/xml" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${name || "profitera-strategy"}.xml`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        closeModal();
        log("Strategy XML downloaded locally.");
    }

    function loadXmlFile(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            if (!String(reader.result || "").includes("<xml")) {
                log("Selected file is not a valid Blockly XML file.");
                return;
            }
            log(`Loaded XML file: ${file.name}. Rendering placeholder strategy blocks.`);
            closeModal();
            setPage("builder");
        };
        reader.readAsText(file);
    }

    function applyQuickTemplate(name) {
        setPage("builder");
        closeModal();
        botStrategy = name;
        if (name === "digits") {
            log("Quick strategy loaded: Digit matcher. Run will buy DIGITDIFF from live Deriv last digits.");
        } else if (name === "rise_fall") {
            log("Quick strategy loaded: Rise/Fall starter. Run will buy CALL or PUT from the latest live tick direction.");
        } else {
            log("Quick strategy loaded: Martingale skeleton. Auto-buy stays disabled until explicit loss limits are configured.");
        }
        stage?.querySelectorAll(".dbot-block").forEach((block) => {
            block.animate([{ transform: "scale(0.98)" }, { transform: "scale(1)" }], { duration: 220 });
        });
    }

    document.querySelectorAll("[data-bot-tab]").forEach((button) => {
        button.addEventListener("click", () => setPage(button.dataset.botTab));
    });

    document.querySelectorAll("[data-bot-tab-jump]").forEach((button) => {
        button.addEventListener("click", () => setPage(button.dataset.botTabJump));
    });

    document.querySelectorAll("[data-monitor-tab]").forEach((button) => {
        button.addEventListener("click", () => setMonitorTab(button.dataset.monitorTab));
    });

    document.querySelectorAll("[data-bot-run]").forEach((button) => {
        button.addEventListener("click", () => updateRunningState(true));
    });

    document.querySelectorAll("[data-bot-stop]").forEach((button) => {
        button.addEventListener("click", () => updateRunningState(false));
    });

    document.querySelectorAll("[data-block-info]").forEach((button) => {
        button.addEventListener("click", () => showFlyout(button.dataset.blockInfo));
    });

    document.querySelector("[data-close-flyout]")?.addEventListener("click", () => {
        const flyout = document.querySelector("[data-block-flyout]");
        if (flyout) flyout.hidden = true;
    });

    document.querySelector("[data-collapse-blocks]")?.addEventListener("click", () => {
        document.querySelector(".dbot-blocks-menu")?.classList.toggle("is-collapsed");
    });

    document.querySelector("[data-block-search]")?.addEventListener("input", (event) => {
        const needle = event.target.value.trim().toLowerCase();
        document.querySelectorAll("[data-block-info]").forEach((button) => {
            button.hidden = needle && !button.textContent.toLowerCase().includes(needle);
        });
    });

    document.querySelectorAll("[data-bot-modal]").forEach((button) => {
        button.addEventListener("click", () => openModal(button.dataset.botModal));
    });

    document.querySelectorAll("[data-close-bot-modal]").forEach((button) => {
        button.addEventListener("click", closeModal);
    });

    modalLayer?.addEventListener("click", (event) => {
        if (event.target === modalLayer) closeModal();
    });

    document.querySelectorAll("[data-load-tab]").forEach((button) => {
        button.addEventListener("click", () => setLoadTab(button.dataset.loadTab));
    });

    document.querySelector("[data-open-local]")?.addEventListener("click", () => {
        openModal("load");
        setLoadTab("local");
    });

    document.querySelector("[data-xml-input]")?.addEventListener("change", (event) => {
        loadXmlFile(event.target.files && event.target.files[0]);
    });

    document.querySelector(".xml-drop-zone")?.addEventListener("click", () => {
        document.querySelector("[data-xml-input]")?.click();
    });

    document.querySelector("[data-save-xml]")?.addEventListener("click", downloadXml);

    document.querySelectorAll("[data-quick-template]").forEach((button) => {
        button.addEventListener("click", () => applyQuickTemplate(button.dataset.quickTemplate));
    });

    document.querySelectorAll("[data-bot-action]").forEach((button) => {
        button.addEventListener("click", () => {
            const action = button.dataset.botAction;
            if (action === "reset") {
                runCount = 0;
                botMarket.ticks = [];
                botMarket.digits = Array.from({ length: 10 }, () => 0);
                botMarket.lastDigit = null;
                botMarket.lastPrice = null;
                botMarket.lastQuote = "";
                renderLiveHeader();
                renderDigitStats();
                log("Workspace reset requested.");
            }
            if (action === "sort") {
                stage?.querySelectorAll(".dbot-block").forEach((block, index) => {
                    block.style.left = `${18 + (index % 2) * 560}px`;
                    block.style.top = `${24 + Math.floor(index / 2) * 190}px`;
                });
                log("Blocks aligned.");
            }
            if (action === "zoom-in" || action === "zoom-out") {
                zoom = action === "zoom-in" ? Math.min(1.3, zoom + 0.1) : Math.max(0.75, zoom - 0.1);
                if (stage) {
                    stage.style.transformOrigin = "top left";
                    stage.style.transform = `scale(${zoom})`;
                }
            }
        });
    });

    document.querySelector("[data-reset-stats]")?.addEventListener("click", () => {
        runCount = 0;
        botMarket.digits = Array.from({ length: 10 }, () => 0);
        botMarket.lastDigit = null;
        renderDigitStats();
        log("Summary stats reset.");
    });

    document.querySelectorAll("[data-close-help]").forEach((button) => {
        button.addEventListener("click", () => {
            const panel = document.querySelector("[data-help-panel]");
            if (panel) panel.hidden = true;
        });
    });

    log("Profitera Bot workspace ready.");
    renderLiveHeader();
    renderDigitStats();
    connectDerivTicks();
})();
