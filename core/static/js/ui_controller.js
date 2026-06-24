(function () {
    const TRADE_TYPES = {
        rise_fall: {
            title: "Rise/Fall",
            contract: "CALL",
            choices: ["Rise", "Fall"],
            fields: ["duration", "stake"],
            payout: "19.25 USD",
            duration: "5",
            unit: "t",
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
                ["Barrier", '<span data-accumulator-barrier>+/- 0.03780%</span>'],
                ["Max. duration", "85 ticks"],
            ],
        },
        multiplier: {
            title: "Multipliers",
            contract: "MULTUP",
            choices: ["Up", "Down"],
            actionLabels: ["Buy Up", "Buy Down"],
            fields: ["stake", "multiplier", "risk"],
            payout: "",
            terms: [["Multiplier", "x100"], ["Stop out", "10.00 USD"], ["Commission", "0.15 USD"]],
        },
        turbos: {
            title: "Turbos",
            contract: "TURBOSLONG",
            choices: ["Up", "Down"],
            fields: ["duration", "stake", "barrier", "takeProfit"],
            payout: "",
            duration: "5",
            unit: "t",
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
            duration: "5",
            unit: "m",
            terms: [],
        },
        touch: {
            title: "Touch/No Touch",
            contract: "ONETOUCH",
            choices: ["Touch", "No Touch"],
            fields: ["duration", "barrier", "stake"],
            payout: "17.21 USD",
            duration: "5",
            unit: "m",
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
            fields: ["digits", "duration", "stake"],
            payout: "19.53 USD",
            duration: "5",
            unit: "t",
            terms: [],
        },
    };

    let activeTradeType = "rise_fall";
    let activeDirection = "rise";
    let activeDigit = 5;
    let lastDigit = null;
    let proposalTimer = null;
    let localTradeId = 1;
    const localTrades = new Map();

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

    function escapeHtml(value) {
        return String(value ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
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
        const label = ["match_diff", "over_under", "even_odd"].includes(activeTradeType) ? "Last digit prediction" : "Digit prediction";
        const counts = window.profiteraDigits?.counts || Array.from({ length: 10 }, () => 0);
        const total = counts.reduce((sum, count) => sum + count, 0) || 1;
        const positive = counts.filter((count) => count > 0);
        const highest = positive.length ? Math.max(...positive) : 0;
        const lowest = positive.length ? Math.min(...positive) : 0;
        picker.setAttribute("aria-label", label);
        picker.innerHTML = `<strong>${label}</strong>${Array.from({ length: 10 }, (_, digit) => `
            <button type="button" data-digit="${digit}" class="${digitClassName(digit, counts[digit], highest, lowest)}">
                <span>${digit}</span>
                <small>${((counts[digit] / total) * 100).toFixed(1)}%</small>
            </button>
        `).join("")}`;
        picker.querySelectorAll("[data-digit]").forEach((button) => {
            button.addEventListener("click", () => {
                activeDigit = Number(button.dataset.digit);
                const barrier = byId("trade-barrier");
                if (barrier) barrier.value = String(activeDigit);
                renderDigits();
                updateChartOverlay();
                scheduleProposal();
            });
        });
    }

    function digitClassName(digit, count, highest, lowest) {
        const classes = [];
        if (digit === activeDigit) classes.push("is-active");
        if (digit === lastDigit) classes.push("is-live");
        if (count > 0 && highest > 0 && count === highest) classes.push("is-hot");
        if (count > 0 && lowest > 0 && count === lowest && lowest !== highest) classes.push("is-cold");
        classes.push(`is-tone-${digit % 4}`);
        const outcome = digitOutcomeClass(digit);
        if (outcome) classes.push(outcome);
        return classes.join(" ");
    }

    function digitOutcomeClass(digit) {
        if (!["match_diff", "over_under", "even_odd"].includes(activeTradeType)) return "";
        const isEven = digit % 2 === 0;
        const favorable = (
            (activeDirection === "matches" && digit === activeDigit) ||
            (activeDirection === "differs" && digit !== activeDigit) ||
            (activeDirection === "over" && digit > activeDigit) ||
            (activeDirection === "under" && digit < activeDigit) ||
            (activeDirection === "even" && isEven) ||
            (activeDirection === "odd" && !isEven)
        );
        return favorable ? "is-favorable" : "is-unfavorable";
    }

    function renderTicket() {
        const config = TRADE_TYPES[activeTradeType];
        if (!config) return;
        const terminal = document.querySelector(".deriv-terminal");
        if (terminal) {
            terminal.classList.forEach((className) => {
                if (className.startsWith("ticket-contract-") && className !== "ticket-contract-digits") {
                    terminal.classList.remove(className);
                }
            });
            terminal.dataset.tradeType = activeTradeType;
            terminal.classList.toggle("ticket-contract-digits", ["match_diff", "over_under", "even_odd"].includes(activeTradeType));
            terminal.classList.add(`ticket-contract-${activeTradeType}`);
        }
        const contract = byId("trade-contract");
        const title = byId("how-to-title");
        const payout = byId("proposal-payout");
        const duration = byId("trade-duration");
        const unit = byId("trade-duration-unit");
        const terms = byId("terms-list");

        if (contract) contract.value = config.contract;
        if (title) title.textContent = `How to trade ${config.title}?`;
        const triggerLabel = byId("contract-trigger-label");
        if (triggerLabel) triggerLabel.textContent = config.title;
        document.querySelectorAll("[data-contract-card]").forEach((card) => {
            card.classList.toggle("is-active", card.dataset.contractCard === activeTradeType);
        });
        if (payout) payout.textContent = config.payout ? `Payout ${config.payout}` : "";
        if (duration) duration.value = config.duration || "5";
        if (unit) {
            unit.value = config.unit || "m";
            document.querySelectorAll("[data-duration-unit-choice]").forEach((button) => {
                button.classList.toggle("is-active", button.dataset.durationUnitChoice === unit.value);
            });
        }
        if (terms) terms.innerHTML = config.terms.map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join("");

        const directionChoice = byId("direction-choice");
        if (directionChoice) {
            directionChoice.style.gridTemplateColumns = `repeat(${Math.max(1, config.choices.length)}, 1fr)`;
            directionChoice.innerHTML = config.choices.map((choice, index) => {
                const label = (config.actionLabels && config.actionLabels[index]) || choice;
                const value = choice.toLowerCase().replace(/\s+/g, "_");
                const tone = directionTone(value);
                return `<button type="button" class="${index === 0 ? "is-active" : ""}" data-direction-choice="${value}" data-tone="${tone}">${label}</button>`;
            }).join("");
            activeDirection = config.choices[0].toLowerCase().replace(/\s+/g, "_");
            directionChoice.querySelectorAll("[data-direction-choice]").forEach((button) => {
                button.addEventListener("click", () => {
                    activeDirection = button.dataset.directionChoice;
                    directionChoice.querySelectorAll("button").forEach((item) => item.classList.toggle("is-active", item === button));
                    const primary = byId("primary-action");
                    if (primary) primary.dataset.direction = activeDirection;
                    const contractInput = byId("trade-contract");
                    if (contractInput) contractInput.value = proposalContractType();
                    updatePrimaryAction();
                    renderDigits();
                    updateChartOverlay();
                    scheduleProposal();
                });
            });
        }

        const has = (field) => config.fields.includes(field);
        show(byId("digit-picker"), has("digits"));
        show(byId("barrier-field"), has("barrier"));
        show(byId("multiplier-field"), has("multiplier"));
        show(byId("growth-field"), has("growth"));
        show(byId("take-profit-field"), has("takeProfit"));
        show(byId("risk-field"), has("risk"));
        document.querySelectorAll(".ticket-field[data-field]").forEach((field) => {
            show(field, has(field.dataset.field));
        });
        renderDigits();
        updatePrimaryAction();
        updateAccumulatorBarrierText();
        updateChartOverlay();
        scheduleProposal();
        const ticket = document.querySelector(".trade-ticket form");
        if (ticket) {
            ticket.animate([
                { opacity: 0, transform: "translateX(12px)" },
                { opacity: 1, transform: "translateX(0)" },
            ], { duration: 220, easing: "cubic-bezier(.2,.8,.2,1)" });
        }
    }

    function updatePrimaryAction() {
        const primary = byId("primary-action");
        const config = TRADE_TYPES[activeTradeType] || TRADE_TYPES.rise_fall;
        if (!primary) return;
        const directionIndex = config.choices.findIndex((choice) => choice.toLowerCase().replace(/\s+/g, "_") === activeDirection);
        const actionLabel = directionIndex >= 0 && config.actionLabels ? config.actionLabels[directionIndex] : "";
        const directionLabel = activeDirection.replace("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
        const label = ["match_diff", "over_under", "even_odd"].includes(activeTradeType)
            ? "Buy"
            : actionLabel || (config.choices.length === 1 ? "Buy" : `Buy ${directionLabel}`);
        const payout = byId("proposal-payout")?.textContent || "";
        primary.firstChild.nodeValue = `${label} `;
        primary.dataset.direction = activeDirection;
        primary.dataset.tone = directionTone(activeDirection);
        primary.classList.toggle("is-fall", directionTone(activeDirection) === "fall");
        const contractInput = byId("trade-contract");
        if (contractInput) contractInput.value = proposalContractType();
        if (!payout) byId("proposal-payout").textContent = "";
    }

    function directionTone(direction) {
        return ["fall", "lower", "down", "put", "no_touch", "under", "odd"].includes(direction) ? "fall" : "rise";
    }

    function updateChartOverlay() {
        if (!window.profiteraChart) return;
        if (["match_diff", "over_under", "even_odd"].includes(activeTradeType)) {
            window.profiteraChart.setContractOverlay({ type: "rise_fall" });
            if (window.profiteraChart.mode === "digits") window.profiteraChart.setMode("line");
            return;
        }
        const barrier = ["match_diff", "over_under"].includes(activeTradeType)
            ? String(activeDigit)
            : byId("trade-barrier")?.value;
        const labels = {
            accumulator: "Accumulator range",
            high_low: "Higher/Lower barrier",
            touch: "Touch barrier",
            turbos: "Turbo barrier",
            vanillas: "Vanilla strike",
            over_under: `Digit barrier ${activeDigit}`,
            match_diff: `Digit ${activeDigit}`,
            even_odd: "Last digit",
        };
        window.profiteraChart.setContractOverlay({
            type: activeTradeType,
            direction: activeDirection,
            barrier,
            growthRate: byId("growth-rate")?.value,
            label: labels[activeTradeType] || "",
            digit: activeDigit,
        });
        if (window.profiteraChart.mode === "digits") window.profiteraChart.setMode("line");
    }

    function accumulatorBarrierPercent() {
        const growth = Math.max(0.01, Math.min(0.08, Number(byId("growth-rate")?.value || 0.03) || 0.03));
        return Math.max(0.00022, growth * 0.0126) * 100;
    }

    function updateAccumulatorBarrierText() {
        const barrier = document.querySelector("[data-accumulator-barrier]");
        if (!barrier) return;
        barrier.textContent = `+/- ${accumulatorBarrierPercent().toFixed(5)}%`;
    }

    function syncUrlState() {
        const url = new URL(window.location.href);
        url.searchParams.set("contract", activeTradeType);
        url.searchParams.set("trade_type", activeTradeType);
        if (window.profiteraMarkets && window.profiteraMarkets.activeSymbol) {
            url.searchParams.set("symbol", window.profiteraMarkets.activeSymbol);
        }
        window.history.replaceState({ contract: activeTradeType }, "", url);
    }

    function closeFloatingPanels(except = null) {
        const popover = byId("markets-popover");
        const modalLayer = byId("modal-layer");
        const contractPopover = byId("contract-popover");
        const accountStrip = document.querySelector(".account-strip.is-open");
        if (except !== "markets" && popover) popover.hidden = true;
        if (except !== "modal" && modalLayer) modalLayer.hidden = true;
        if (except !== "contract" && contractPopover) contractPopover.hidden = true;
        if (except !== "account" && accountStrip) {
            accountStrip.classList.remove("is-open");
            const current = byId("account-current");
            if (current) current.setAttribute("aria-expanded", "false");
        }
    }

    function applyInitialState() {
        const params = new URLSearchParams(window.location.search);
        const contract = params.get("contract") || params.get("trade_type");
        if (contract && TRADE_TYPES[contract]) activeTradeType = contract;
        document.querySelectorAll("[data-trade-type]").forEach((button) => {
            button.classList.toggle("is-active", button.dataset.tradeType === activeTradeType);
        });
        const chartType = params.get("chart_type");
        const chartMode = chartType === "area" ? "line" : chartType;
        if (chartMode && window.profiteraChart) {
            window.profiteraChart.setMode(chartMode);
            document.querySelectorAll("[data-chart-mode]").forEach((button) => {
                button.classList.toggle("is-active", button.dataset.chartMode === chartMode);
            });
        }
        const interval = params.get("interval");
        const intervalSeconds = interval && interval.endsWith("t") ? Number(interval.slice(0, -1)) : Number(interval);
        if (Number.isFinite(intervalSeconds) && intervalSeconds > 0 && window.profiteraChart) {
            window.profiteraChart.setInterval(intervalSeconds);
            document.querySelectorAll("[data-chart-interval]").forEach((button) => {
                button.classList.toggle("is-active", Number(button.dataset.chartInterval) === intervalSeconds);
            });
        }
    }

    function scheduleProposal() {
        clearTimeout(proposalTimer);
        proposalTimer = setTimeout(refreshProposal, 180);
    }

    function proposalContractType() {
        const config = TRADE_TYPES[activeTradeType] || TRADE_TYPES.rise_fall;
        const directionMap = {
            fall: "PUT",
            lower: "PUT",
            down: "MULTDOWN",
            put: "VANILLALONGPUT",
            no_touch: "NOTOUCH",
            differs: "DIGITDIFF",
            under: "DIGITUNDER",
            odd: "DIGITODD",
        };
        return directionMap[activeDirection] || config.contract;
    }

    function selectTradeType(type, sourceButton = null) {
        if (!TRADE_TYPES[type]) return;
        activeTradeType = type;
        document.querySelectorAll("[data-trade-type]").forEach((item) => item.classList.toggle("is-active", item.dataset.tradeType === type));
        document.querySelectorAll("[data-contract-card]").forEach((item) => item.classList.toggle("is-active", item.dataset.contractCard === type));
        if (sourceButton && sourceButton.scrollIntoView) sourceButton.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
        renderTicket();
        const contractInput = byId("trade-contract");
        if (contractInput) contractInput.value = proposalContractType();
        syncUrlState();
    }

    function selectedDerivSymbol() {
        return window.profiteraMarkets?.activeSymbol || byId("trade-symbol")?.value || "1HZ100V";
    }

    function proposalPayload() {
        const payload = {
            proposal: 1,
            amount: Number(byId("trade-stake")?.value || 10),
            basis: "stake",
            contract_type: proposalContractType(),
            currency: window.PROFITERA_DERIV_SESSION?.currency || "USD",
            symbol: selectedDerivSymbol(),
            duration: Number(byId("trade-duration")?.value || 5),
            duration_unit: byId("trade-duration-unit")?.value || "m",
        };
        if (["match_diff", "over_under"].includes(activeTradeType)) payload.barrier = String(activeDigit);
        else if (byId("barrier-field") && !byId("barrier-field").hidden && byId("trade-barrier")?.value) payload.barrier = byId("trade-barrier").value;
        if (activeTradeType === "accumulator") payload.growth_rate = Number(byId("growth-rate")?.value || 0.03);
        return payload;
    }

    function tradeBarrierValue() {
        if (["match_diff", "over_under"].includes(activeTradeType)) return String(activeDigit);
        const barrierField = byId("barrier-field");
        if (barrierField && !barrierField.hidden && byId("trade-barrier")?.value) return byId("trade-barrier").value;
        return undefined;
    }

    function updateRiskPreview() {
        const stake = Number(byId("trade-stake")?.value || 0);
        const duration = byId("trade-duration")?.value || "5";
        const unit = byId("trade-duration-unit")?.value || "m";
        const currency = window.PROFITERA_DERIV_SESSION?.currency || "USD";
        const symbol = selectedDerivSymbol();
        const stakeRisk = byId("stake-risk");
        const durationPreview = byId("duration-preview");
        const symbolPreview = byId("symbol-preview");
        if (stakeRisk) stakeRisk.textContent = Number.isFinite(stake) ? `${stake.toFixed(2)} ${currency}` : `0.00 ${currency}`;
        if (durationPreview) durationPreview.textContent = `${duration} ${unit}`;
        if (symbolPreview) symbolPreview.textContent = symbol;
    }

    function refreshProposal() {
        if (!window.profiteraMarkets || !window.profiteraMarkets.sendDeriv) return;
        updateRiskPreview();
        const payload = proposalPayload();
        if (!Number.isFinite(payload.amount) || payload.amount <= 0) return;
        window.profiteraMarkets.sendDeriv(payload, "proposal")
            .then((data) => {
                if (!data.proposal) return;
                const ask = Number(data.proposal.ask_price || payload.amount);
                const payoutValue = Number(data.proposal.payout || data.proposal.display_value || 0);
                const profit = Math.max(0, payoutValue - ask);
                const payout = byId("proposal-payout");
                const warning = byId("risk-warning");
                if (payout) payout.textContent = `Payout ${payoutValue.toFixed(2)} ${payload.currency} / Profit ${profit.toFixed(2)} ${payload.currency}`;
                if (warning && data.proposal.longcode) warning.textContent = data.proposal.longcode;
            })
            .catch((error) => {
                const payout = byId("proposal-payout");
                const warning = byId("risk-warning");
                if (payout) payout.textContent = "Proposal unavailable";
                if (warning && window.PROFITERA_DERIV_SESSION?.connected) warning.textContent = error.message;
            });
    }

    document.querySelectorAll("[data-trade-type]").forEach((button) => {
        button.addEventListener("click", () => {
            selectTradeType(button.dataset.tradeType, button);
        });
    });

    document.querySelectorAll("[data-chart-tools-toggle]").forEach((button) => {
        button.addEventListener("click", (event) => {
            event.stopPropagation();
            const wrapper = button.closest(".floating-tools");
            const open = !wrapper?.classList.contains("is-open");
            document.querySelectorAll(".floating-tools.is-open").forEach((item) => item.classList.remove("is-open"));
            if (wrapper) wrapper.classList.toggle("is-open", open);
            button.setAttribute("aria-expanded", open ? "true" : "false");
        });
    });
    document.addEventListener("click", (event) => {
        document.querySelectorAll(".floating-tools.is-open").forEach((wrapper) => {
            if (wrapper.contains(event.target)) return;
            wrapper.classList.remove("is-open");
            wrapper.querySelector("[data-chart-tools-toggle]")?.setAttribute("aria-expanded", "false");
        });
    });
    document.querySelectorAll("[data-chart-action]").forEach((button) => {
        button.addEventListener("click", () => {
            if (!window.profiteraChart) return;
            const action = button.dataset.chartAction;
            if (action === "zoom-in") window.profiteraChart.setZoom(window.profiteraChart.zoom + 0.18);
            if (action === "zoom-out") window.profiteraChart.setZoom(window.profiteraChart.zoom - 0.18);
            if (action === "reset") window.profiteraChart.reset();
            if (action === "fullscreen") {
                document.querySelector(".deriv-terminal")?.classList.toggle("chart-fullscreen");
                setTimeout(() => window.profiteraChart.resize(), 230);
            }
        });
    });

    document.querySelectorAll("[data-chart-mode]").forEach((button) => {
        button.addEventListener("click", () => {
            document.querySelectorAll("[data-chart-mode]").forEach((item) => item.classList.toggle("is-active", item === button));
            if (window.profiteraChart) window.profiteraChart.setMode(button.dataset.chartMode || "line");
            if (window.profiteraMarkets) window.profiteraMarkets.subscribeActive();
            closeFloatingPanels();
        });
    });

    document.querySelectorAll("[data-chart-interval]").forEach((button) => {
        button.addEventListener("click", () => {
            document.querySelectorAll("[data-chart-interval]").forEach((item) => item.classList.toggle("is-active", item === button));
            if (window.profiteraChart) window.profiteraChart.setInterval(button.dataset.chartInterval);
            if (window.profiteraMarkets) window.profiteraMarkets.subscribeActive();
            closeFloatingPanels();
        });
    });

    document.querySelectorAll("[data-chart-tool]").forEach((button) => {
        button.addEventListener("click", () => {
            const active = window.profiteraChart ? window.profiteraChart.setTool(button.dataset.chartTool) : null;
            document.querySelectorAll("[data-chart-tool]").forEach((item) => item.classList.toggle("is-active", active && item.dataset.chartTool === active));
            closeFloatingPanels();
        });
    });

    document.querySelectorAll("[data-chart-download]").forEach((button) => {
        button.addEventListener("click", () => {
            const canvas = byId("price-chart");
            if (!canvas) return;
            const link = document.createElement("a");
            link.download = `profitera-chart-${Date.now()}.png`;
            link.href = canvas.toDataURL("image/png");
            link.click();
        });
    });

    const modalLayer = byId("modal-layer");
    document.querySelectorAll("[data-modal]").forEach((button) => {
        button.addEventListener("click", () => {
            button.closest(".floating-tools")?.classList.remove("is-open");
            button.closest(".floating-tools")?.querySelector("[data-chart-tools-toggle]")?.setAttribute("aria-expanded", "false");
            if (!modalLayer) return;
            closeFloatingPanels("modal");
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
            closeFloatingPanels("markets");
            popover.hidden = !popover.hidden;
            symbolCard.setAttribute("aria-expanded", popover.hidden ? "false" : "true");
            const search = byId("market-search");
            if (!popover.hidden && search) search.focus();
        });
    }
    document.addEventListener("click", (event) => {
        if (!popover || popover.hidden) return;
        if (popover.contains(event.target) || (symbolCard && symbolCard.contains(event.target))) return;
        popover.hidden = true;
    });

    const contractPopover = byId("contract-popover");
    const contractTrigger = byId("contract-trigger");
    if (contractTrigger && contractPopover) {
        contractTrigger.addEventListener("click", (event) => {
            event.stopPropagation();
            closeFloatingPanels();
            contractPopover.hidden = !contractPopover.hidden;
            contractTrigger.setAttribute("aria-expanded", contractPopover.hidden ? "false" : "true");
        });
    }
    document.querySelectorAll("[data-contract-card]").forEach((button) => {
        button.addEventListener("click", () => {
            selectTradeType(button.dataset.contractCard);
            if (contractPopover) contractPopover.hidden = true;
            if (contractTrigger) contractTrigger.setAttribute("aria-expanded", "false");
        });
    });
    document.querySelectorAll("[data-close-contract]").forEach((button) => {
        button.addEventListener("click", () => {
            if (contractPopover) contractPopover.hidden = true;
            if (contractTrigger) contractTrigger.setAttribute("aria-expanded", "false");
        });
    });
    document.addEventListener("click", (event) => {
        if (!contractPopover || contractPopover.hidden) return;
        if (contractPopover.contains(event.target) || (contractTrigger && contractTrigger.contains(event.target))) return;
        contractPopover.hidden = true;
        if (contractTrigger) contractTrigger.setAttribute("aria-expanded", "false");
    });

    document.querySelectorAll("[data-toggle-markets]").forEach((button) => {
        button.addEventListener("click", (event) => {
            event.stopPropagation();
            closeFloatingPanels("markets");
            if (popover) {
                popover.hidden = !popover.hidden;
                byId("market-search")?.focus();
            }
        });
    });

    document.querySelectorAll("[data-toggle-positions]").forEach((button) => {
        button.addEventListener("click", () => {
            const drawer = byId("positions-drawer");
            if (drawer) drawer.classList.toggle("is-open");
            document.body.classList.toggle("positions-open", drawer && drawer.classList.contains("is-open"));
        });
    });
    document.querySelectorAll("[data-close-positions]").forEach((button) => {
        button.addEventListener("click", () => {
            const drawer = byId("positions-drawer");
            if (drawer) drawer.classList.remove("is-open");
            document.body.classList.remove("positions-open");
        });
    });

    document.querySelectorAll("[data-bottom-tab]").forEach((button) => {
        button.addEventListener("click", () => {
            const tab = button.dataset.bottomTab;
            document.querySelectorAll("[data-bottom-tab]").forEach((item) => item.classList.toggle("is-active", item === button));
            document.querySelectorAll("[data-bottom-panel]").forEach((panel) => panel.classList.toggle("is-active", panel.dataset.bottomPanel === tab));
        });
    });

    function showWorkspacePage(page) {
        if (page !== "trade" && !document.querySelector(`[data-workspace-page="${page}"]`)) page = "dashboard";
        const isTrade = page === "trade";
        document.querySelectorAll("[data-workspace-page]").forEach((panel) => {
            panel.hidden = panel.dataset.workspacePage !== page;
        });
        document.querySelectorAll("[data-page]").forEach((item) => {
            item.classList.toggle("is-active", item.dataset.page === page || (isTrade && item.dataset.page === "trade"));
        });
        if (isTrade) closeFloatingPanels();
    }

    document.querySelectorAll("[data-page]").forEach((button) => {
        button.addEventListener("click", () => showWorkspacePage(button.dataset.page || "trade"));
    });

    document.querySelectorAll("[data-collapse-rail]").forEach((button) => {
        button.addEventListener("click", () => {
            const terminal = document.querySelector(".deriv-terminal");
            terminal?.classList.toggle("rail-collapsed");
            localStorage.setItem("profitera:rail-collapsed", terminal?.classList.contains("rail-collapsed") ? "1" : "0");
        });
    });
    if (localStorage.getItem("profitera:rail-collapsed") === "1") {
        document.querySelector(".deriv-terminal")?.classList.add("rail-collapsed");
    }

    const terminalSearch = byId("terminal-search");
    if (terminalSearch) {
        terminalSearch.addEventListener("focus", () => {
            if (popover) popover.hidden = false;
            byId("market-search")?.focus();
        });
        terminalSearch.addEventListener("input", () => {
            if (popover) popover.hidden = false;
            const search = byId("market-search");
            if (search) {
                search.value = terminalSearch.value;
                search.dispatchEvent(new Event("input", { bubbles: true }));
            }
        });
    }

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

    function setTicketOpen(open) {
        const panel = byId("ticket-panel");
        const root = document.querySelector(".deriv-terminal");
        if (!panel) return;
        panel.classList.toggle("is-open", open);
        if (root) root.classList.toggle("ticket-sheet-collapsed", !open);
        document.querySelectorAll("[data-toggle-ticket]").forEach((button) => {
            button.setAttribute("aria-expanded", open ? "true" : "false");
        });
        window.setTimeout(() => window.profiteraChart?.resize?.(), 220);
    }

    document.querySelectorAll("[data-toggle-ticket]").forEach((button) => {
        let startY = 0;
        let currentY = 0;
        let dragging = false;

        button.addEventListener("click", () => {
            if (dragging) return;
            const panel = byId("ticket-panel");
            setTicketOpen(!(panel && panel.classList.contains("is-open")));
        });

        button.addEventListener("pointerdown", (event) => {
            const panel = byId("ticket-panel");
            const root = document.querySelector(".deriv-terminal");
            if (!panel || !window.matchMedia("(max-width: 900px)").matches) return;
            startY = event.clientY;
            currentY = startY;
            dragging = false;
            panel.classList.add("is-dragging");
            root?.classList.add("ticket-sheet-dragging");
            button.setPointerCapture?.(event.pointerId);
        });

        button.addEventListener("pointermove", (event) => {
            const panel = byId("ticket-panel");
            const root = document.querySelector(".deriv-terminal");
            if (!panel || !panel.classList.contains("is-dragging")) return;
            currentY = event.clientY;
            const delta = Math.max(-170, Math.min(170, currentY - startY));
            if (Math.abs(delta) > 8) dragging = true;
            panel.style.setProperty("--sheet-drag", `${delta}px`);
            root?.style.setProperty("--sheet-drag", `${delta}px`);
        });

        const finishDrag = (event) => {
            const panel = byId("ticket-panel");
            const root = document.querySelector(".deriv-terminal");
            if (!panel || !panel.classList.contains("is-dragging")) return;
            panel.classList.remove("is-dragging");
            root?.classList.remove("ticket-sheet-dragging");
            panel.style.removeProperty("--sheet-drag");
            root?.style.removeProperty("--sheet-drag");
            const delta = currentY - startY;
            if (Math.abs(delta) > 28) setTicketOpen(delta < 0);
            window.setTimeout(() => { dragging = false; }, 0);
            if (event && event.pointerId !== undefined) button.releasePointerCapture?.(event.pointerId);
        };

        button.addEventListener("pointerup", finishDrag);
        button.addEventListener("pointercancel", finishDrag);
    });

    const accountCurrent = byId("account-current");
    const accountLabel = byId("account-label");
    const accountBalance = byId("account-balance");
    if (accountCurrent) {
        accountCurrent.addEventListener("click", () => {
            closeFloatingPanels("account");
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

    ["trade-stake", "trade-duration", "trade-barrier", "growth-rate"].forEach((id) => {
        const input = byId(id);
        if (input) input.addEventListener("input", () => {
            updateAccumulatorBarrierText();
            updateChartOverlay();
            updateRiskPreview();
            scheduleProposal();
        });
    });
    document.querySelectorAll("[data-duration-unit-choice]").forEach((button) => {
        button.addEventListener("click", () => {
            const unit = byId("trade-duration-unit");
            if (unit) unit.value = button.dataset.durationUnitChoice || "m";
            document.querySelectorAll("[data-duration-unit-choice]").forEach((item) => item.classList.toggle("is-active", item === button));
            updateRiskPreview();
            scheduleProposal();
        });
    });

    document.querySelectorAll("[data-stake-step]").forEach((button) => {
        button.addEventListener("click", () => {
            const input = byId("trade-stake");
            if (!input) return;
            const step = Number(button.dataset.stakeStep || 0);
            const next = Math.max(1, (Number(input.value) || 0) + step);
            input.value = next.toFixed(next % 1 === 0 ? 0 : 2);
            updateRiskPreview();
            scheduleProposal();
        });
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeFloatingPanels();
            const drawer = byId("positions-drawer");
            if (drawer) drawer.classList.remove("is-open");
            document.body.classList.remove("positions-open");
        }
        if ((event.ctrlKey || event.metaKey) && event.key === "=" && window.profiteraChart) {
            event.preventDefault();
            window.profiteraChart.setZoom(window.profiteraChart.zoom + 0.18);
        }
        if ((event.ctrlKey || event.metaKey) && event.key === "-" && window.profiteraChart) {
            event.preventDefault();
            window.profiteraChart.setZoom(window.profiteraChart.zoom - 0.18);
        }
        if ((event.ctrlKey || event.metaKey) && event.key === "0" && window.profiteraChart) {
            event.preventDefault();
            window.profiteraChart.reset();
        }
    });

    window.addEventListener("profitera:account", (event) => {
        const account = event.detail || {};
        const currency = account.currency || window.PROFITERA_DERIV_SESSION?.currency || "USD";
        const numericBalance = Number(account.balance);
        const balanceText = Number.isFinite(numericBalance)
            ? `${numericBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`
            : `${account.balance || "0.00"} ${currency}`;
        if (accountLabel && account.loginid) accountLabel.textContent = account.loginid;
        if (accountBalance) accountBalance.textContent = balanceText;
        const mobileLabel = byId("mobile-account-label");
        const mobileBalance = byId("mobile-account-balance");
        if (mobileLabel && account.loginid) mobileLabel.textContent = account.loginid;
        if (mobileBalance) mobileBalance.textContent = balanceText;
        const dashboardBalance = byId("dashboard-balance");
        if (dashboardBalance) dashboardBalance.textContent = balanceText;
        const connection = byId("execution-connection");
        const currencyLabel = byId("execution-currency");
        if (connection) connection.textContent = account.loginid || "Connected";
        if (currencyLabel) currencyLabel.textContent = currency;
    });

    function money(value) {
        const currency = window.PROFITERA_DERIV_SESSION?.currency || "USD";
        return `${Number(value || 0).toFixed(2)} ${currency}`;
    }

    function tradeCard(trade) {
        const pl = Number(trade.profit || 0);
        return `
            <article class="activity-card ${trade.status === "won" ? "is-win" : trade.status === "lost" ? "is-loss" : ""}">
                <strong>${escapeHtml(trade.contract)}</strong>
                <span>${escapeHtml(trade.symbol)}</span>
                <span>${money(trade.stake)}</span>
                <span class="${pl >= 0 ? "positive" : "negative"}">${money(pl)}</span>
                <small>${escapeHtml(trade.statusLabel || trade.status)}</small>
            </article>
        `;
    }

    function renderLocalTrades() {
        const openFeed = byId("open-trades-feed");
        const historyFeed = byId("history-feed");
        const transactionsFeed = byId("transactions-feed");
        const trades = [...localTrades.values()];
        const open = trades.filter((trade) => trade.status === "open");
        const closed = trades.filter((trade) => trade.status !== "open");
        if (openFeed) openFeed.innerHTML = open.length ? open.map(tradeCard).join("") : '<span class="empty-state-inline">No open trades yet.</span>';
        if (historyFeed) historyFeed.innerHTML = closed.length ? closed.map(tradeCard).join("") : '<span class="empty-state-inline">Completed trades will appear here.</span>';
        if (transactionsFeed) {
            transactionsFeed.innerHTML = trades.length ? trades.map((trade) => `
                <article class="activity-card">
                    <strong>${escapeHtml(trade.id)}</strong>
                    <span>${escapeHtml(trade.contract)}</span>
                    <span>${money(trade.stake)}</span>
                    <span>${money(trade.payout || 0)}</span>
                    <small>${escapeHtml(trade.transaction || "Stake reserved")}</small>
                </article>
            `).join("") : '<span class="empty-state-inline">Deposits, stakes, and payouts will appear here.</span>';
        }
        const totalProfit = closed.reduce((sum, trade) => sum + Number(trade.profit || 0), 0) + open.reduce((sum, trade) => sum + Number(trade.profit || 0), 0);
        const winners = closed.filter((trade) => Number(trade.profit || 0) > 0);
        const dashProfit = byId("dashboard-profit");
        const dashWinrate = byId("dashboard-winrate");
        const dashSymbol = byId("dashboard-symbol");
        if (dashProfit) {
            dashProfit.textContent = money(totalProfit);
            dashProfit.className = totalProfit >= 0 ? "positive" : "negative";
        }
        if (dashWinrate) dashWinrate.textContent = closed.length ? `${Math.round((winners.length / closed.length) * 100)}%` : "0%";
        if (dashSymbol) dashSymbol.textContent = selectedDerivSymbol();
    }

    function addLocalTrade(payload, serverData = {}) {
        const price = Number(byId("active-price")?.textContent) || 0;
        const id = serverData.contract_id || `SIM-${localTradeId++}`;
        const stake = Number(payload.stake || 0);
        const trade = {
            id,
            symbol: payload.symbol,
            contract: TRADE_TYPES[activeTradeType]?.title || payload.contract_type,
            stake,
            entry: price,
            current: price,
            payout: stake * 1.86,
            profit: 0,
            status: "open",
            statusLabel: "12s remaining",
            transaction: "Stake reserved",
            ticks: 0,
        };
        localTrades.set(String(id), trade);
        renderLocalTrades();
        window.profiteraPortfolio?.addLocal?.({
            id,
            symbol: trade.symbol,
            direction: activeDirection,
            stake: trade.stake,
            profit: 0,
            status: "open",
        });
        const timer = setInterval(() => {
            const current = localTrades.get(String(id));
            if (!current || current.status !== "open") {
                clearInterval(timer);
                return;
            }
            current.ticks += 1;
            const livePrice = Number(byId("active-price")?.textContent) || current.current || current.entry;
            current.current = livePrice;
            const directionBias = ["rise", "higher", "up", "call"].includes(activeDirection) ? 1 : -1;
            const drift = current.entry ? ((livePrice - current.entry) / current.entry) * 1000 * directionBias : (Math.random() - 0.45);
            current.profit = Math.max(-stake, Math.min(stake * 0.9, drift || ((Math.random() - 0.45) * stake)));
            current.statusLabel = `${Math.max(0, 12 - current.ticks * 2)}s remaining`;
            if (current.ticks >= 6) {
                current.status = current.profit >= 0 ? "won" : "lost";
                current.statusLabel = current.status === "won" ? "Won" : "Lost";
                current.transaction = current.status === "won" ? "Payout credited" : "Contract expired";
                window.profiteraChart?.addTradeFlag?.(current.status === "won" ? "win" : "loss", livePrice || current.entry);
                clearInterval(timer);
            }
            renderLocalTrades();
        }, 2000);
    }

    const form = byId("trade-form");
    if (form) {
        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            const payload = {
                symbol: selectedDerivSymbol(),
                direction: activeDirection,
                stake: byId("trade-stake").value,
                duration: byId("trade-duration").value,
                duration_unit: byId("trade-duration-unit").value,
                contract_type: proposalContractType(),
                barrier: tradeBarrierValue(),
                growth_rate: (byId("growth-rate") || {}).value || undefined,
                multiplier: (byId("trade-multiplier") || {}).value || undefined,
                take_profit: (byId("take-profit") || {}).value || undefined,
            };
            const warning = byId("risk-warning");
            const status = byId("contract-status");
            const primary = byId("primary-action");
            if (status) status.textContent = "Submitting";
            if (primary) {
                primary.classList.add("is-loading");
                primary.disabled = true;
            }
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
                addLocalTrade(payload, data);
            } catch (error) {
                if (warning) warning.textContent = error.message;
                if (status) status.textContent = "Rejected";
                addLocalTrade(payload, {});
            } finally {
                if (primary) {
                    primary.classList.remove("is-loading");
                    primary.disabled = false;
                }
            }
        });
    }

    window.addEventListener("profitera:tick", (event) => {
        const price = Number(event.detail.price);
        if (!Number.isFinite(price)) return;
        const parts = price.toFixed(5).replace(".", "");
        lastDigit = Number(parts.charAt(parts.length - 1));
        renderDigits();
        updateChartOverlay();
        const badge = byId("chart-price-badge");
        if (badge) badge.textContent = price.toFixed(2);
        scheduleProposal();
    });

    window.addEventListener("profitera:market", () => {
        syncUrlState();
        updateRiskPreview();
        scheduleProposal();
    });

    function reportMobileLayout() {
        const terminal = document.querySelector(".deriv-terminal");
        const topbar = document.querySelector(".trade-topbar");
        const tabs = document.querySelector(".trade-type-tabs");
        const chart = document.querySelector(".chart-stage");
        const ticket = byId("ticket-panel");
        if (!terminal || !window.matchMedia("(max-width: 900px)").matches) return;
        window.PROFITERA_MOBILE_LAYOUT = {
            topbar: Math.round(topbar?.getBoundingClientRect().height || 0),
            tabsDisplay: tabs ? getComputedStyle(tabs).display : "missing",
            tabsHeight: Math.round(tabs?.getBoundingClientRect().height || 0),
            chart: Math.round(chart?.getBoundingClientRect().height || 0),
            ticket: Math.round(ticket?.getBoundingClientRect().height || 0),
        };
        console.info("Profitera mobile layout", window.PROFITERA_MOBILE_LAYOUT);
    }
    applyInitialState();
    renderTicket();
    updateRiskPreview();
    renderLocalTrades();
    syncUrlState();
    updateClock();
    setInterval(updateClock, 1000);
    window.setTimeout(() => {
        const terminal = document.querySelector(".deriv-terminal");
        if (terminal) {
            terminal.classList.remove("is-loading");
            terminal.classList.add("is-ready");
        }
        window.profiteraChart?.resize?.();
        reportMobileLayout();
    }, 420);
})();
