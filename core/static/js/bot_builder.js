(function () {
    const stage = document.getElementById("builder-stage");
    const modalLayer = document.getElementById("bot-modal-layer");
    let draggedLabel = "";
    let zoom = 1;
    let isRunning = false;

    const blockPositions = {
        "Trade parameters": [18, 48],
        "Purchase conditions": [18, 466],
        "Sell conditions (optional)": [520, 48],
        "Restart trading conditions": [520, 210],
        Analysis: [520, 380],
        Utility: [18, 642],
    };

    const state = {
        market: "Volatility 100 (1s) Index",
        tradeType: "Matches/Differs",
        contractType: "Matches",
        duration: "5",
        durationUnit: "ticks",
        stake: "10",
        prediction: "5",
        condition: "Last digit is 5",
        restart: "Trade again",
    };

    function escapeHtml(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function blockHtml(label) {
        if (label === "Trade parameters") {
            return `
                <h3>1. Trade parameters</h3>
                <p>Market:
                    <select data-bot-param="market">
                        ${["Volatility 100 (1s) Index", "Volatility 75 Index", "Volatility 50 Index", "Boom 1000 Index"].map((item) => `<option ${item === state.market ? "selected" : ""}>${item}</option>`).join("")}
                    </select>
                </p>
                <p>Trade Type:
                    <select data-bot-param="tradeType">
                        ${["Rise/Fall", "Matches/Differs", "Over/Under", "Touch/No Touch"].map((item) => `<option ${item === state.tradeType ? "selected" : ""}>${item}</option>`).join("")}
                    </select>
                    <select data-bot-param="contractType">
                        ${["Matches", "Differs", "Over", "Under", "Rise", "Fall"].map((item) => `<option ${item === state.contractType ? "selected" : ""}>${item}</option>`).join("")}
                    </select>
                </p>
                <p>Duration:
                    <input data-bot-param="duration" value="${escapeHtml(state.duration)}" inputmode="numeric">
                    <select data-bot-param="durationUnit"><option ${state.durationUnit === "ticks" ? "selected" : ""}>ticks</option><option ${state.durationUnit === "minutes" ? "selected" : ""}>minutes</option></select>
                    Stake: USD <input data-bot-param="stake" value="${escapeHtml(state.stake)}" inputmode="decimal">
                </p>
                <label>Restart buy/sell on error <input data-bot-param="restartOnError" type="checkbox"></label>
                <label>Restart last trade on error <input data-bot-param="restartLast" type="checkbox" checked></label>
            `;
        }
        if (label === "Purchase conditions") {
            return `
                <h3>2. Purchase conditions</h3>
                <p>Purchase <select data-bot-param="contractType"><option ${state.contractType === "Matches" ? "selected" : ""}>Matches</option><option ${state.contractType === "Differs" ? "selected" : ""}>Differs</option><option ${state.contractType === "Rise" ? "selected" : ""}>Rise</option><option ${state.contractType === "Fall" ? "selected" : ""}>Fall</option></select></p>
                <p>If <span>${escapeHtml(state.condition)}</span></p>
            `;
        }
        if (label === "Sell conditions (optional)") {
            return `
                <h3>3. Sell conditions</h3>
                <p>if <select data-bot-param="sellCondition"><option>Sell is available</option><option>Profit is above stake</option><option>Loss reaches limit</option></select> then</p>
                <p><span>Sell contract</span></p>
            `;
        }
        if (label === "Restart trading conditions") {
            return `
                <h3>4. Restart trading conditions</h3>
                <p><select data-bot-param="restart"><option ${state.restart === "Trade again" ? "selected" : ""}>Trade again</option><option ${state.restart === "Stop bot" ? "selected" : ""}>Stop bot</option></select></p>
            `;
        }
        if (label === "Analysis") {
            return `
                <h3>Analysis</h3>
                <p>Last digit prediction <select data-bot-param="prediction">${Array.from({ length: 10 }, (_, digit) => `<option ${String(digit) === state.prediction ? "selected" : ""}>${digit}</option>`).join("")}</select></p>
                <p>Condition <span>${escapeHtml(state.condition)}</span></p>
            `;
        }
        return `
            <h3>${escapeHtml(label)}</h3>
            <p><span>Notify before run</span></p>
            <p><span>Keep strategy active</span></p>
        `;
    }

    function updateDependentState(name, value) {
        state[name] = value;
        if (name === "tradeType") {
            if (value === "Matches/Differs") state.contractType = "Matches";
            if (value === "Over/Under") state.contractType = "Over";
            if (value === "Rise/Fall") state.contractType = "Rise";
            if (value === "Touch/No Touch") state.contractType = "Touch";
        }
        if (name === "prediction") state.condition = `Last digit is ${value}`;
        if (name === "contractType" && ["Matches", "Differs"].includes(value)) state.tradeType = "Matches/Differs";
        if (name === "contractType" && ["Over", "Under"].includes(value)) state.tradeType = "Over/Under";
    }

    function updateSummary() {
        const summary = document.querySelector(".summary-empty");
        if (summary) {
            summary.innerHTML = `
                <strong>${isRunning ? "Bot is running" : "Ready to run"}</strong>
                <span>${escapeHtml(state.market)}</span>
                <span>${escapeHtml(state.tradeType)} / ${escapeHtml(state.contractType)}</span>
                <span>${escapeHtml(state.duration)} ${escapeHtml(state.durationUnit)} / ${escapeHtml(state.stake)} USD</span>
            `;
        }
        const status = document.querySelector(".run-strip strong");
        if (status) status.textContent = isRunning ? "Bot is running" : "Bot is not running";
        const runButton = document.querySelector(".run-strip button");
        if (runButton) runButton.textContent = isRunning ? "Stop" : "Run";
    }

    function refreshBlocks() {
        if (!stage) return;
        stage.querySelectorAll(".bot-block").forEach((block) => {
            const label = block.dataset.blockLabel;
            if (label) block.innerHTML = blockHtml(label);
        });
        updateSummary();
    }

    function addOrUpdateBlock(label, x = null, y = null) {
        if (!stage) return null;
        const existing = [...stage.querySelectorAll(".bot-block")].find((block) => block.dataset.blockLabel === label);
        const node = existing || document.createElement("article");
        node.className = `bot-block ${label === "Trade parameters" ? "block-large" : ""}`;
        node.dataset.blockLabel = label;
        const [defaultX, defaultY] = blockPositions[label] || [32, 64];
        node.style.left = `${Math.max(8, x ?? defaultX)}px`;
        node.style.top = `${Math.max(8, y ?? defaultY)}px`;
        node.innerHTML = blockHtml(label);
        if (!existing) stage.appendChild(node);
        node.animate([
            { transform: "scale(0.98)", boxShadow: "0 0 0 rgba(0,0,0,0)" },
            { transform: "scale(1)", boxShadow: "0 0 0 3px rgba(255, 68, 79, 0.22)" },
        ], { duration: 220, easing: "ease-out" });
        updateSummary();
        return node;
    }

    function loadStarterStrategy() {
        if (!stage) return;
        stage.innerHTML = "";
        ["Trade parameters", "Purchase conditions", "Sell conditions (optional)", "Restart trading conditions"].forEach((label) => addOrUpdateBlock(label));
        updateSummary();
    }

    document.querySelectorAll(".block-menu-item[draggable='true']").forEach((block) => {
        block.addEventListener("dragstart", (event) => {
            draggedLabel = block.textContent.trim();
            event.dataTransfer.setData("text/plain", draggedLabel);
        });
        block.addEventListener("click", () => {
            addOrUpdateBlock(block.textContent.trim());
        });
    });

    document.querySelector(".quick-strategy")?.addEventListener("click", () => {
        state.tradeType = "Matches/Differs";
        state.contractType = "Matches";
        state.prediction = "5";
        state.condition = "Last digit is 5";
        loadStarterStrategy();
    });

    if (stage) {
        stage.addEventListener("dragover", (event) => event.preventDefault());
        stage.addEventListener("drop", (event) => {
            event.preventDefault();
            const rect = stage.getBoundingClientRect();
            const label = event.dataTransfer.getData("text/plain") || draggedLabel || "Strategy block";
            addOrUpdateBlock(label, (event.clientX - rect.left) / zoom - 90, (event.clientY - rect.top) / zoom - 24);
        });
        stage.addEventListener("change", (event) => {
            const control = event.target.closest("[data-bot-param]");
            if (!control) return;
            updateDependentState(control.dataset.botParam, control.type === "checkbox" ? String(control.checked) : control.value);
            refreshBlocks();
        });
        stage.addEventListener("input", (event) => {
            const control = event.target.closest("[data-bot-param]");
            if (!control || control.tagName === "SELECT") return;
            updateDependentState(control.dataset.botParam, control.value);
            updateSummary();
        });
    }

    document.querySelector(".run-strip button")?.addEventListener("click", () => {
        isRunning = !isRunning;
        updateSummary();
        document.querySelector(".run-strip")?.classList.toggle("is-running", isRunning);
    });

    document.querySelectorAll("[data-bot-modal]").forEach((button) => {
        button.addEventListener("click", () => {
            if (!modalLayer) return;
            modalLayer.hidden = false;
            document.querySelectorAll("[data-bot-panel]").forEach((panel) => {
                panel.hidden = panel.dataset.botPanel !== button.dataset.botModal;
            });
        });
    });

    document.querySelectorAll("[data-close-bot-modal]").forEach((button) => {
        button.addEventListener("click", () => {
            if (modalLayer) modalLayer.hidden = true;
        });
    });

    if (modalLayer) {
        modalLayer.addEventListener("click", (event) => {
            if (event.target === modalLayer) modalLayer.hidden = true;
        });
    }

    document.querySelectorAll("[data-bot-action]").forEach((button) => {
        button.addEventListener("click", () => {
            const action = button.dataset.botAction;
            if (action === "zoom-in") zoom = Math.min(1.4, zoom + 0.1);
            if (action === "zoom-out") zoom = Math.max(0.7, zoom - 0.1);
            if (stage && (action === "zoom-in" || action === "zoom-out")) {
                stage.style.transformOrigin = "top left";
                stage.style.transform = `scale(${zoom})`;
            }
            if (action === "sort" && stage) {
                [...stage.querySelectorAll(".bot-block")].forEach((block, index) => {
                    block.style.left = `${18 + (index % 2) * 500}px`;
                    block.style.top = `${48 + Math.floor(index / 2) * 178}px`;
                });
            }
            if (action === "undo" || action === "redo") {
                button.animate([{ transform: "scale(1)" }, { transform: "scale(0.86)" }, { transform: "scale(1)" }], { duration: 180 });
            }
        });
    });

    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
        button.addEventListener("click", () => {
            document.body.classList.toggle("theme-light");
        });
    });

    stage?.querySelectorAll(".bot-block").forEach((block) => {
        const title = block.querySelector("h3")?.textContent.replace(/^\d+\.\s*/, "").trim();
        if (title) block.dataset.blockLabel = title === "Sell conditions" ? "Sell conditions (optional)" : title;
    });
    refreshBlocks();
})();
