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

    let running = false;
    let runCount = 0;
    let zoom = 1;

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
            if (stats.runs) stats.runs.textContent = String(runCount);
            if (stats.stake) stats.stake.textContent = `${(runCount * 1).toFixed(2)} USD`;
            if (stats.payout) stats.payout.textContent = `${(runCount * 1.93).toFixed(2)} USD`;
            if (stats.profit) {
                stats.profit.textContent = `${(runCount * 0.37).toFixed(2)} USD`;
                stats.profit.className = "is-positive";
            }
            log("Bot run requested. Backend execution should start from the server-authoritative engine.");
        } else {
            log("Bot stopped. Open contracts should be allowed to settle server-side.");
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
        log(`Quick strategy loaded: ${name}.`);
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
                Object.values(stats).forEach((item) => { if (item) item.textContent = item === stats.profit ? "0.00 USD" : "0"; });
                if (stats.stake) stats.stake.textContent = "0.00 USD";
                if (stats.payout) stats.payout.textContent = "0.00 USD";
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
        if (stats.stake) stats.stake.textContent = "0.00 USD";
        if (stats.payout) stats.payout.textContent = "0.00 USD";
        if (stats.runs) stats.runs.textContent = "0";
        if (stats.lost) stats.lost.textContent = "0";
        if (stats.won) stats.won.textContent = "0";
        if (stats.profit) stats.profit.textContent = "0.00 USD";
        log("Summary stats reset.");
    });

    document.querySelectorAll("[data-close-help]").forEach((button) => {
        button.addEventListener("click", () => {
            const panel = document.querySelector("[data-help-panel]");
            if (panel) panel.hidden = true;
        });
    });

    log("Profitera Bot workspace ready.");
})();
