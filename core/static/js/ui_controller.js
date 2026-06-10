(function () {
    const TRADE_TYPES = {
        rise_fall: {
            title: "Rise/Fall",
            contract: "CALL",
            choices: ["Rise", "Fall"],
            fields: ["duration", "stake"],
            payout: "19.25 USD",
            terms: [],
        },
        accumulator: {
            title: "Accumulators",
            contract: "ACCU",
            choices: ["Buy"],
            fields: ["growth", "stake", "takeProfit"],
            payout: "",
            terms: [
                ["Max. payout", "6,000.00 USD"],
                ["Barrier", "+/- 0.03797%"],
                ["Max. duration", "85 ticks"],
            ],
        },
        multiplier: {
            title: "Multipliers",
            contract: "MULTUP",
            choices: ["Up", "Down"],
            fields: ["stake", "risk"],
            payout: "",
            terms: [["Stop out", "10.00 USD"], ["Commission", "0.15 USD"]],
        },
        turbos: {
            title: "Turbos",
            contract: "TURBOSLONG",
            choices: ["Up", "Down"],
            fields: ["duration", "stake", "barrier", "takeProfit"],
            payout: "",
            terms: [["Payout per point", "2.4 USD"], ["Barrier", "-4.02"]],
        },
        vanillas: {
            title: "Vanillas",
            contract: "VANILLALONGCALL",
            choices: ["Call", "Put"],
            fields: ["duration", "barrier", "stake"],
            payout: "",
            terms: [["Payout per point", "9.659166 USD"]],
        },
        high_low: {
            title: "Higher/Lower",
            contract: "CALL",
            choices: ["Higher", "Lower"],
            fields: ["duration", "barrier", "stake"],
            payout: "22.91 USD",
            terms: [],
        },
        touch: {
            title: "Touch/No Touch",
            contract: "ONETOUCH",
            choices: ["Touch", "No Touch"],
            fields: ["duration", "barrier", "stake"],
            payout: "17.21 USD",
            terms: [],
        },
        match_diff: {
            title: "Matches/Differs",
            contract: "DIGITMATCH",
            choices: ["Matches", "Differs"],
            fields: ["digits", "duration", "stake"],
            payout: "89.29 USD",
            duration: "5",
            unit: "t",
            terms: [],
        },
        over_under: {
            title: "Over/Under",
            contract: "DIGITOVER",
            choices: ["Over", "Under"],
            fields: ["digits", "duration", "stake"],
            payout: "16.88 USD",
            duration: "5",
            unit: "t",
            terms: [],
        },
        even_odd: {
            title: "Even/Odd",
            contract: "DIGITEVEN",
            choices: ["Even", "Odd"],
            fields: ["duration", "stake"],
            payout: "19.53 USD",
            duration: "5",
            unit: "t",
            terms: [],
        },
    };

    let activeTradeType = "rise_fall";
    let activeDirection = "rise";
    let activeDigit = 5;

    function csrfToken() {
        const match = document.cookie.match(/csrftoken=([^;]+)/);
        return match ? decodeURIComponent(match[1]) : "";
    }

    function byId(id) {
        return document.getElementById(id);
    }

    function show(el, visible) {
        if (el) el.hidden = !visible;
    }

    function updateClock() {
        const el = byId("terminal-time");
        if (!el) return;
        const now = new Date();
        el.textContent = `${now.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })} ${now.toLocaleTimeString("en-GB", { timeZone: "UTC" })} GMT`;
    }

    function renderDigits() {
        const picker = byId("digit-picker");
        if (!picker) return;
        const percentages = ["9.3%", "8.2%", "10.9%", "9.6%", "11.6%", "10.9%", "10.6%", "9.6%", "9.9%", "9.4%"];
        picker.innerHTML = Array.from({ length: 10 }, (_, digit) => `
            <button type="button" data-digit="${digit}" class="${digit === activeDigit ? "is-active" : ""}">${digit}</button>
            <small>${percentages[digit]}</small>
        `).join("");
        picker.querySelectorAll("[data-digit]").forEach((button) => {
            button.addEventListener("click", () => {
                activeDigit = Number(button.dataset.digit);
                const barrier = byId("trade-barrier");
                if (barrier) barrier.value = String(activeDigit);
                renderDigits();
            });
        });
    }

    function renderTicket() {
        const config = TRADE_TYPES[activeTradeType];
        if (!config) return;
        const contract = byId("trade-contract");
        const title = byId("how-to-title");
        const payout = byId("proposal-payout");
        const duration = byId("trade-duration");
        const unit = byId("trade-duration-unit");
        const terms = byId("terms-list");

        if (contract) contract.value = config.contract;
        if (title) title.textContent = `How to trade ${config.title}?`;
        if (payout) payout.textContent = config.payout ? `Payout ${config.payout}` : "";
        if (duration) duration.value = config.duration || "5";
        if (unit) unit.value = config.unit || "m";
        if (terms) terms.innerHTML = config.terms.map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join("");

        const directionChoice = byId("direction-choice");
        if (directionChoice) {
            directionChoice.style.gridTemplateColumns = `repeat(${Math.max(1, config.choices.length)}, 1fr)`;
            directionChoice.innerHTML = config.choices.map((choice, index) => {
                const value = choice.toLowerCase().replace(/\s+/g, "_");
                return `<button type="button" class="${index === 0 ? "is-active" : ""}" data-direction-choice="${value}">${choice}</button>`;
            }).join("");
            activeDirection = config.choices[0].toLowerCase().replace(/\s+/g, "_");
            directionChoice.querySelectorAll("[data-direction-choice]").forEach((button) => {
                button.addEventListener("click", () => {
                    activeDirection = button.dataset.directionChoice;
                    directionChoice.querySelectorAll("button").forEach((item) => item.classList.toggle("is-active", item === button));
                    const primary = byId("primary-action");
                    if (primary) primary.dataset.direction = activeDirection;
                });
            });
        }

        const has = (field) => config.fields.includes(field);
        show(byId("digit-picker"), has("digits"));
        show(byId("barrier-field"), has("barrier"));
        show(byId("growth-field"), has("growth"));
        show(byId("take-profit-field"), has("takeProfit"));
        show(byId("risk-field"), has("risk"));
        document.querySelectorAll(".ticket-field[data-field]").forEach((field) => {
            show(field, has(field.dataset.field));
        });
        renderDigits();
    }

    document.querySelectorAll("[data-trade-type]").forEach((button) => {
        button.addEventListener("click", () => {
            activeTradeType = button.dataset.tradeType;
            document.querySelectorAll("[data-trade-type]").forEach((item) => item.classList.toggle("is-active", item === button));
            renderTicket();
        });
    });

    document.querySelectorAll("[data-chart-action]").forEach((button) => {
        button.addEventListener("click", () => {
            if (!window.profiteraChart) return;
            const action = button.dataset.chartAction;
            if (action === "zoom-in") window.profiteraChart.setZoom(window.profiteraChart.zoom + 0.18);
            if (action === "zoom-out") window.profiteraChart.setZoom(window.profiteraChart.zoom - 0.18);
            if (action === "reset") window.profiteraChart.reset();
        });
    });

    document.querySelectorAll("[data-chart-mode]").forEach((button) => {
        button.addEventListener("click", () => {
            document.querySelectorAll("[data-chart-mode]").forEach((item) => item.classList.toggle("is-active", item === button));
            if (window.profiteraChart) window.profiteraChart.setMode(button.dataset.chartMode === "line" ? "line" : "candles");
        });
    });

    document.querySelectorAll("[data-chart-interval]").forEach((button) => {
        button.addEventListener("click", () => {
            document.querySelectorAll("[data-chart-interval]").forEach((item) => item.classList.toggle("is-active", item === button));
            if (window.profiteraChart) window.profiteraChart.setInterval(button.dataset.chartInterval);
            if (window.profiteraMarkets) window.profiteraMarkets.subscribeActive();
        });
    });

    const modalLayer = byId("modal-layer");
    document.querySelectorAll("[data-modal]").forEach((button) => {
        button.addEventListener("click", () => {
            if (!modalLayer) return;
            modalLayer.hidden = false;
            document.querySelectorAll("[data-modal-panel]").forEach((panel) => {
                panel.hidden = panel.dataset.modalPanel !== button.dataset.modal;
            });
        });
    });
    document.querySelectorAll("[data-close-modal]").forEach((button) => {
        button.addEventListener("click", () => {
            if (modalLayer) modalLayer.hidden = true;
        });
    });
    if (modalLayer) {
        modalLayer.addEventListener("click", (event) => {
            if (event.target === modalLayer) modalLayer.hidden = true;
        });
    }

    const popover = byId("markets-popover");
    const symbolCard = byId("symbol-card");
    if (symbolCard && popover) {
        symbolCard.addEventListener("click", () => {
            popover.hidden = !popover.hidden;
        });
    }
    document.addEventListener("click", (event) => {
        if (!popover || popover.hidden) return;
        if (popover.contains(event.target) || (symbolCard && symbolCard.contains(event.target))) return;
        popover.hidden = true;
    });

    document.querySelectorAll("[data-toggle-positions]").forEach((button) => {
        button.addEventListener("click", () => {
            const drawer = byId("positions-drawer");
            if (drawer) drawer.classList.toggle("is-open");
        });
    });
    document.querySelectorAll("[data-close-positions]").forEach((button) => {
        button.addEventListener("click", () => {
            const drawer = byId("positions-drawer");
            if (drawer) drawer.classList.remove("is-open");
        });
    });

    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
        button.addEventListener("click", () => {
            const root = document.querySelector(".deriv-terminal");
            if (!root) return;
            root.classList.toggle("theme-light");
            localStorage.setItem("profitera:theme", root.classList.contains("theme-light") ? "light" : "dark");
            if (window.profiteraChart) window.profiteraChart.draw();
        });
    });
    if (localStorage.getItem("profitera:theme") === "light") {
        const root = document.querySelector(".deriv-terminal");
        if (root) root.classList.add("theme-light");
    }

    document.querySelectorAll("[data-toggle-ticket]").forEach((button) => {
        button.addEventListener("click", () => {
            const panel = byId("ticket-panel");
            if (panel) panel.classList.toggle("is-open");
        });
    });

    const accountCurrent = byId("account-current");
    const accountLabel = byId("account-label");
    const accountBalance = byId("account-balance");
    if (accountCurrent) {
        accountCurrent.addEventListener("click", () => {
            const wrapper = accountCurrent.closest(".account-strip");
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
                accountBalance.textContent = button.dataset.accountType === "demo"
                    ? `${Number(balance).toLocaleString(undefined, { minimumFractionDigits: 2 })} USD`
                    : button.dataset.balance;
            }
            const wrapper = button.closest(".account-strip");
            if (wrapper) wrapper.classList.remove("is-open");
        });
    });
    const resetDemo = byId("reset-demo-balance");
    if (resetDemo) {
        resetDemo.addEventListener("click", () => {
            localStorage.setItem("profitera:demo-balance", "10000");
            if (accountBalance && window.profiteraAccountType !== "real") accountBalance.textContent = "10,000.00 USD";
        });
    }

    const form = byId("trade-form");
    if (form) {
        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const payload = {
                symbol: byId("trade-symbol").value,
                direction: activeDirection,
                stake: byId("trade-stake").value,
                duration: byId("trade-duration").value,
                duration_unit: byId("trade-duration-unit").value,
                contract_type: byId("trade-contract").value,
                barrier: (byId("trade-barrier") || {}).value || undefined,
                growth_rate: (byId("growth-rate") || {}).value || undefined,
                take_profit: (byId("take-profit") || {}).value || undefined,
            };
            const warning = byId("risk-warning");
            const status = byId("contract-status");
            if (status) status.textContent = "Submitting";
            try {
                const response = await fetch("/api/trading/", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "X-CSRFToken": csrfToken() },
                    body: JSON.stringify(payload),
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error || "Trade rejected");
                if (warning) warning.textContent = `Trade submitted. Contract ${data.contract_id || "pending"}.`;
                if (status) status.textContent = "Open";
            } catch (error) {
                if (warning) warning.textContent = error.message;
                if (status) status.textContent = "Rejected";
            }
        });
    }

    window.addEventListener("profitera:tick", (event) => {
        const price = Number(event.detail.price);
        if (!Number.isFinite(price)) return;
        const badge = byId("chart-price-badge");
        if (badge) badge.textContent = price.toFixed(2);
    });

    renderTicket();
    updateClock();
    setInterval(updateClock, 1000);
})();
