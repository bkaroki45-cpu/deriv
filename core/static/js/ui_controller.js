(function () {
    function csrfToken() {
        const match = document.cookie.match(/csrftoken=([^;]+)/);
        return match ? decodeURIComponent(match[1]) : "";
    }

    document.querySelectorAll("[data-chart-mode]").forEach((button) => {
        button.addEventListener("click", () => {
            document.querySelectorAll("[data-chart-mode]").forEach((item) => item.classList.remove("is-active"));
            button.classList.add("is-active");
            if (window.tradeNovaChart) window.tradeNovaChart.setMode(button.dataset.chartMode);
        });
    });

    document.querySelectorAll("[data-chart-interval]").forEach((button) => {
        button.addEventListener("click", () => {
            document.querySelectorAll("[data-chart-interval]").forEach((item) => item.classList.remove("is-active"));
            button.classList.add("is-active");
            if (window.tradeNovaChart) window.tradeNovaChart.setInterval(button.dataset.chartInterval);
        });
    });

    document.querySelectorAll("[data-chart-action]").forEach((button) => {
        button.addEventListener("click", () => {
            if (!window.tradeNovaChart) return;
            const action = button.dataset.chartAction;
            if (action === "zoom-in") window.tradeNovaChart.setZoom(window.tradeNovaChart.zoom + 0.18);
            if (action === "zoom-out") window.tradeNovaChart.setZoom(window.tradeNovaChart.zoom - 0.18);
            if (action === "reset") window.tradeNovaChart.reset();
        });
    });

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
            };
            const warning = document.getElementById("risk-warning");
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
                if (window.tradeNovaPortfolio) {
                    window.tradeNovaPortfolio.addLocal({
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
