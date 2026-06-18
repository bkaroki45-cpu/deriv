(function () {
    class PortfolioStream {
        constructor() {
            this.body = document.getElementById("trade-table-body");
            this.count = document.getElementById("portfolio-count");
            this.profit = document.getElementById("portfolio-profit");
            this.winrate = document.getElementById("portfolio-winrate");
            this.connection = document.querySelector('[data-connection="portfolio"]');
            this.trades = new Map();
            this.connect();
        }

        connect() {
            const scheme = window.location.protocol === "https:" ? "wss" : "ws";
            const socket = new WebSocket(`${scheme}://${window.location.host}/ws/portfolio/`);
            socket.onopen = () => this.setConnection(true);
            socket.onmessage = (event) => this.apply(JSON.parse(event.data));
            socket.onclose = () => {
                this.setConnection(false);
                setTimeout(() => this.connect(), 3000);
            };
            socket.onerror = () => this.setConnection(false);
        }

        apply(message) {
            if (message.type === "new_trade" && message.trade) {
                this.trades.set(String(message.trade.id), message.trade);
            }
            if ((message.type === "trade_update" || message.type === "trade_closed") && message.trade_id) {
                const key = String(message.trade_id);
                const current = this.trades.get(key) || { id: key };
                this.trades.set(key, { ...current, ...message });
                if (message.type === "trade_closed" && window.profiteraChart) {
                    window.profiteraChart.addTradeFlag(Number(message.profit || 0) >= 0 ? "win" : "loss", Number(message.exit_price || document.getElementById("active-price").textContent));
                }
                if (message.type === "trade_closed" && window.profiteraDigits && message.winning_digit !== undefined) {
                    window.profiteraDigits.flash(message.winning_digit, message.predicted_digit);
                }
            }
            this.render();
        }

        addLocal(trade) {
            this.trades.set(String(trade.id || Date.now()), trade);
            this.render();
        }

        escape(value) {
            return String(value ?? "-")
                .replaceAll("&", "&amp;")
                .replaceAll("<", "&lt;")
                .replaceAll(">", "&gt;")
                .replaceAll('"', "&quot;")
                .replaceAll("'", "&#039;");
        }

        render() {
            if (!this.body) return;
            const rows = [...this.trades.values()];
            if (!rows.length) {
                this.body.innerHTML = '<tr class="empty-row"><td colspan="5">No portfolio data loaded.</td></tr>';
            } else {
                this.body.innerHTML = rows.map((trade) => {
                    const pl = Number(trade.profit || 0);
                    return `
                        <tr id="trade-${this.escape(trade.id)}">
                            <td>${this.escape(trade.symbol)}</td>
                            <td>${this.escape(trade.direction || trade.contract_type)}</td>
                            <td>${this.escape(trade.stake)}</td>
                            <td class="${pl >= 0 ? "positive" : "negative"}">${pl.toFixed(2)}</td>
                            <td>${this.escape(trade.status || "open")}</td>
                        </tr>
                    `;
                }).join("");
            }
            const totalProfit = rows.reduce((sum, trade) => sum + Number(trade.profit || 0), 0);
            const closed = rows.filter((trade) => trade.status === "closed");
            const winners = closed.filter((trade) => Number(trade.profit || 0) > 0);
            if (this.count) this.count.textContent = String(rows.length);
            if (this.profit) {
                this.profit.textContent = totalProfit.toFixed(2);
                this.profit.className = totalProfit >= 0 ? "positive" : "negative";
            }
            if (this.winrate) this.winrate.textContent = closed.length ? `${Math.round((winners.length / closed.length) * 100)}%` : "0%";
        }

        setConnection(online) {
            if (!this.connection) return;
            this.connection.textContent = online ? "online" : "offline";
            this.connection.classList.toggle("online", online);
        }
    }

    window.profiteraPortfolio = new PortfolioStream();
})();
