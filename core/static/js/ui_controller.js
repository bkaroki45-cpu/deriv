(function () {
    function csrfToken() {
        const match = document.cookie.match(/csrftoken=([^;]+)/);
        return match ? decodeURIComponent(match[1]) : "";
    }

    document.querySelectorAll("[data-chart-mode]").forEach((button) => {
        button.addEventListener("click", () => {
            document.querySelectorAll("[data-chart-mode]").forEach((item) => item.classList.remove("is-active"));
            button.classList.add("is-active");
            if (window.profiteraChart) window.profiteraChart.setMode(button.dataset.chartMode);
        });
    });

    document.querySelectorAll("[data-chart-interval]").forEach((button) => {
        button.addEventListener("click", () => {
            document.querySelectorAll("[data-chart-interval]").forEach((item) => item.classList.remove("is-active"));
            button.classList.add("is-active");
            if (window.profiteraChart) window.profiteraChart.setInterval(button.dataset.chartInterval);
        });
    });

    document.querySelectorAll("[data-chart-action]").forEach((button) => {
        button.addEventListener("click", () => {
            if (!window.profiteraChart) return;
            const action = button.dataset.chartAction;
            if (action === "zoom-in") window.profiteraChart.setZoom(window.profiteraChart.zoom + 0.18);
            if (action === "zoom-out") window.profiteraChart.setZoom(window.profiteraChart.zoom - 0.18);
            if (action === "reset") window.profiteraChart.reset();
            if (action === "fullscreen") document.querySelector(".chart-panel").requestFullscreen();
        });
    });

    const toolsMenu = document.getElementById("tools-trigger");
    if (toolsMenu) {
        toolsMenu.addEventListener("click", () => {
            const wrapper = toolsMenu.closest(".tools-menu");
            wrapper.classList.toggle("is-open");
            toolsMenu.setAttribute("aria-expanded", wrapper.classList.contains("is-open") ? "true" : "false");
        });
    }

    document.querySelectorAll("[data-chart-tool]").forEach((button) => {
        button.addEventListener("click", () => {
            if (!window.profiteraChart) return;
            const selected = window.profiteraChart.setTool(button.dataset.chartTool);
            document.querySelectorAll("[data-chart-tool]").forEach((item) => {
                item.classList.toggle("is-selected-tool", item.dataset.chartTool === selected);
            });
            const wrapper = button.closest(".tools-menu");
            if (wrapper) wrapper.classList.remove("is-open");
        });
    });

    const demoBalance = document.getElementById("demo-balance");
    const realBalance = document.getElementById("real-balance");
    const accountCurrent = document.getElementById("account-current");
    const accountLabel = document.getElementById("account-label");
    const accountBalance = document.getElementById("account-balance");
    const savedDemo = localStorage.getItem("profitera:demo-balance");
    if (demoBalance && savedDemo) demoBalance.textContent = `$${Number(savedDemo).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    if (accountCurrent) {
        accountCurrent.addEventListener("click", () => {
            const wrapper = accountCurrent.closest(".account-switcher");
            wrapper.classList.toggle("is-open");
            accountCurrent.setAttribute("aria-expanded", wrapper.classList.contains("is-open") ? "true" : "false");
        });
    }
    document.querySelectorAll("[data-account-type]").forEach((button) => {
        button.addEventListener("click", () => {
            window.profiteraAccountType = button.dataset.accountType;
            if (accountLabel) accountLabel.textContent = button.dataset.label;
            if (accountBalance) {
                const balance = button.dataset.accountType === "demo" ? (localStorage.getItem("profitera:demo-balance") || button.dataset.balance) : button.dataset.balance;
                accountBalance.textContent = button.dataset.accountType === "demo" ? `$${Number(balance).toLocaleString(undefined, { minimumFractionDigits: 2 })}` : `$${button.dataset.balance}`;
            }
            const wrapper = button.closest(".account-switcher");
            if (wrapper) wrapper.classList.remove("is-open");
            const status = document.getElementById("contract-status");
            if (status) status.textContent = `${button.dataset.label} selected`;
        });
    });
    const resetDemo = document.getElementById("reset-demo-balance");
    if (resetDemo) {
        resetDemo.addEventListener("click", () => {
            localStorage.setItem("profitera:demo-balance", "10000");
            if (demoBalance) demoBalance.textContent = "$10,000.00";
            if (window.profiteraAccountType !== "real" && accountBalance) accountBalance.textContent = "$10,000.00";
        });
    }

    function selectedContractGroup() {
        const contract = document.getElementById("trade-contract");
        return contract ? contract.value : "CALL";
    }

    function updateContractControls() {
        const group = selectedContractGroup();
        const primary = document.getElementById("primary-action");
        const secondary = document.getElementById("secondary-action");
        const barrier = document.getElementById("barrier-field");
        const accumulator = document.getElementById("accumulator-controls");
        const forex = document.body.classList.contains("market-forex");
        const actions = {
            ACCU: ["BUY", ""],
            CALL: forex ? ["BUY", "SELL"] : ["RISE", "FALL"],
            DIGITOVER: ["OVER", "UNDER"],
            DIGITMATCH: ["MATCH", "DIFFER"],
            DIGITEVEN: ["EVEN", "ODD"],
        }[group] || ["BUY", "SELL"];
        if (primary) {
            primary.textContent = actions[0];
            primary.dataset.direction = actions[0].toLowerCase();
        }
        if (secondary) {
            secondary.textContent = actions[1] || actions[0];
            secondary.dataset.direction = (actions[1] || actions[0]).toLowerCase();
            secondary.hidden = !actions[1];
        }
        if (barrier) barrier.hidden = forex || group === "ACCU" || group === "DIGITEVEN";
        if (accumulator) accumulator.hidden = group !== "ACCU";
    }

    window.addEventListener("profitera:market", updateContractControls);
    const contractSelect = document.getElementById("trade-contract");
    if (contractSelect) contractSelect.addEventListener("change", updateContractControls);
    updateContractControls();

    const form = document.getElementById("trade-form");
    if (form) {
        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const clicked = event.submitter;
            const direction = clicked ? clicked.dataset.direction : "rise";
            const payload = {
                symbol: document.getElementById("trade-symbol").value,
                direction,
                stake: document.getElementById("trade-stake").value,
                duration: document.getElementById("trade-duration").value,
                duration_unit: document.getElementById("trade-duration-unit").value,
                contract_type: document.getElementById("trade-contract").value,
                barrier: (document.getElementById("trade-barrier") || {}).value || undefined,
                growth_rate: (document.getElementById("growth-rate") || {}).value || undefined,
                take_profit: (document.getElementById("take-profit") || {}).value || undefined,
            };
            const warning = document.getElementById("risk-warning");
            const status = document.getElementById("contract-status");
            if (status) status.textContent = "Submitting";
            if (window.profiteraChart) {
                const activePrice = Number((document.getElementById("active-price") || {}).textContent);
                if (Number.isFinite(activePrice)) window.profiteraChart.addTradeFlag("entry", activePrice);
            }
            try {
                const response = await fetch("/api/trading/", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "X-CSRFToken": csrfToken(),
                    },
                    body: JSON.stringify(payload),
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error || "Trade rejected");
                if (warning) warning.textContent = `Trade submitted. Contract ${data.contract_id || "pending"}.`;
                if (status) status.textContent = "Open";
                if (window.profiteraAccountType !== "real") {
                    const current = Number(localStorage.getItem("profitera:demo-balance") || "10000");
                    const next = Math.max(0, current - Number(payload.stake || 0));
                    localStorage.setItem("profitera:demo-balance", String(next));
                    if (demoBalance) demoBalance.textContent = `$${next.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
                    if (accountBalance) accountBalance.textContent = `$${next.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
                }
                if (window.profiteraPortfolio) {
                    window.profiteraPortfolio.addLocal({
                        id: data.trade_id,
                        symbol: payload.symbol,
                        direction,
                        stake: payload.stake,
                        profit: 0,
                        status: "open",
                    });
                }
            } catch (error) {
                if (warning) warning.textContent = error.message;
                if (status) status.textContent = "Rejected";
            }
        });
    }

    ["trade-stake", "trade-duration", "trade-duration-unit", "trade-contract", "trade-symbol"].forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.addEventListener("input", () => {
            const payout = document.getElementById("proposal-payout");
            if (payout) payout.textContent = "Authenticate for live proposal";
        });
    });
})();
