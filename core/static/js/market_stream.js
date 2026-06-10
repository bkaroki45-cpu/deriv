(function () {
    const DEFAULT_MARKETS = [
        { symbol: "1HZ10V", display_name: "Volatility 10 (1s) Index", market: "synthetic_index", market_display_name: "Synthetics" },
        { symbol: "1HZ25V", display_name: "Volatility 25 (1s) Index", market: "synthetic_index", market_display_name: "Synthetics" },
        { symbol: "1HZ50V", display_name: "Volatility 50 (1s) Index", market: "synthetic_index", market_display_name: "Synthetics" },
        { symbol: "1HZ75V", display_name: "Volatility 75 (1s) Index", market: "synthetic_index", market_display_name: "Synthetics" },
        { symbol: "1HZ100V", display_name: "Volatility 100 (1s) Index", market: "synthetic_index", market_display_name: "Synthetics" },
        { symbol: "R_10", display_name: "Volatility 10 Index", market: "synthetic_index", market_display_name: "Synthetic Indices" },
        { symbol: "R_25", display_name: "Volatility 25 Index", market: "synthetic_index", market_display_name: "Synthetic Indices" },
        { symbol: "R_50", display_name: "Volatility 50 Index", market: "synthetic_index", market_display_name: "Synthetic Indices" },
        { symbol: "R_75", display_name: "Volatility 75 Index", market: "synthetic_index", market_display_name: "Synthetic Indices" },
        { symbol: "R_100", display_name: "Volatility 100 Index", market: "synthetic_index", market_display_name: "Synthetic" },
        { symbol: "BOOM1000", display_name: "Boom 1000 Index", market: "synthetic_index", market_display_name: "Boom indices" },
        { symbol: "CRASH1000", display_name: "Crash 1000 Index", market: "synthetic_index", market_display_name: "Crash indices" },
        { symbol: "JD100", display_name: "Jump 100 Index", market: "synthetic_index", market_display_name: "Jump indices" },
        { symbol: "RANGE100", display_name: "Range Break 100 Index", market: "synthetic_index", market_display_name: "Range Break indices" },
        { symbol: "stpRNG", display_name: "Step Index", market: "synthetic_index", market_display_name: "Step Index" },
        { symbol: "RDBULL", display_name: "DEX 1500 UP Index", market: "synthetic_index", market_display_name: "DEX indices" },
        { symbol: "RDBEAR", display_name: "DEX 1500 DOWN Index", market: "synthetic_index", market_display_name: "DEX indices" },
        { symbol: "frxEURUSD", display_name: "EUR/USD", market: "forex", market_display_name: "Forex" },
    ];

    class MarketStream {
        constructor() {
            this.list = document.getElementById("market-list");
            this.search = document.getElementById("market-search");
            this.activeName = document.getElementById("active-symbol-name");
            this.activeCode = document.getElementById("active-symbol-code");
            this.activePrice = document.getElementById("active-price");
            this.activeChange = document.getElementById("active-change");
            this.tradeSymbol = document.getElementById("trade-symbol");
            this.connection = document.querySelector('[data-connection="markets"]');
            this.markets = [];
            this.prices = new Map();
            this.favorites = new Set(JSON.parse(localStorage.getItem("profitera:favorites") || "[]"));
            this.activeSymbol = "1HZ100V";
            this.filter = "all";
            this.derivSocket = null;
            this.localSocket = null;
            this.reconnectTimer = null;
            this.bind();
            this.loadSymbols();
            this.connectLocal();
            this.connectDeriv();
        }

        bind() {
            if (this.search) {
                this.search.addEventListener("input", () => this.render());
            }
            document.querySelectorAll("[data-market-filter]").forEach((button) => {
                button.addEventListener("click", () => {
                    document.querySelectorAll("[data-market-filter]").forEach((item) => item.classList.remove("is-active"));
                    button.classList.add("is-active");
                    this.filter = button.dataset.marketFilter;
                    this.render();
                });
            });
            document.querySelectorAll("[data-market-category]").forEach((button) => {
                button.addEventListener("click", () => {
                    document.querySelectorAll("[data-market-category]").forEach((item) => item.classList.remove("is-active"));
                    button.classList.add("is-active");
                    this.filter = button.dataset.marketCategory;
                    this.render();
                });
            });
        }

        async loadSymbols() {
            try {
                const response = await this.derivRequest({ active_symbols: "brief", req_id: 10 });
                const remote = Array.isArray(response.active_symbols) ? response.active_symbols : [];
                this.markets = this.syntheticFirst(remote.length ? remote : DEFAULT_MARKETS);
            } catch (error) {
                this.markets = this.syntheticFirst(DEFAULT_MARKETS);
                this.note(`Using local symbol list: ${error.message}`);
            }
            this.render();
        }

        syntheticFirst(markets) {
            const synthetic = markets.filter((item) => this.isSynthetic(item));
            const forex = markets.filter((item) => String(item.market).includes("forex"));
            const others = markets.filter((item) => !this.isSynthetic(item) && !String(item.market).includes("forex"));
            return [...synthetic, ...forex, ...others];
        }

        isSynthetic(item) {
            const text = `${item.symbol} ${item.display_name} ${item.market} ${item.market_display_name}`.toLowerCase();
            return text.includes("synthetic") || text.includes("volatility") || text.includes("boom") || text.includes("crash") || text.includes("jump") || text.includes("range break") || text.includes("step") || text.includes("dex") || /^r_\d+/.test(String(item.symbol).toLowerCase());
        }

        derivRequest(payload) {
            return new Promise((resolve, reject) => {
                const appId = window.PROFITERA_DERIV_APP_ID || "1089";
                const socket = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${appId}`);
                const timeout = setTimeout(() => {
                    socket.close();
                    reject(new Error("Deriv request timeout"));
                }, 8000);
                socket.onopen = () => socket.send(JSON.stringify(payload));
                socket.onmessage = (event) => {
                    clearTimeout(timeout);
                    const data = JSON.parse(event.data);
                    socket.close();
                    if (data.error) reject(new Error(data.error.message));
                    else resolve(data);
                };
                socket.onerror = () => {
                    clearTimeout(timeout);
                    reject(new Error("Deriv WebSocket unavailable"));
                };
            });
        }

        connectDeriv() {
            const appId = window.PROFITERA_DERIV_APP_ID || "1089";
            this.derivSocket = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${appId}`);
            this.derivSocket.onopen = () => {
                this.setConnection(true);
                this.subscribeActive();
            };
            this.derivSocket.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.tick) this.ingestTick({ symbol: data.tick.symbol, price: data.tick.quote, time: data.tick.epoch });
                if (data.candles && window.profiteraChart) {
                    window.profiteraChart.clear();
                    data.candles.forEach((candle) => window.profiteraChart.upsertCandle({
                        open: candle.open,
                        high: candle.high,
                        low: candle.low,
                        close: candle.close,
                        time: candle.epoch,
                    }));
                }
            };
            this.derivSocket.onclose = () => {
                this.setConnection(false);
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = setTimeout(() => this.connectDeriv(), 2500);
            };
            this.derivSocket.onerror = () => this.setConnection(false);
        }

        connectLocal() {
            const scheme = window.location.protocol === "https:" ? "wss" : "ws";
            this.localSocket = new WebSocket(`${scheme}://${window.location.host}/ws/markets/`);
            this.localSocket.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.type === "tick") this.ingestTick(data);
            };
            this.localSocket.onclose = () => setTimeout(() => this.connectLocal(), 3000);
        }

        subscribeActive() {
            if (!this.derivSocket || this.derivSocket.readyState !== WebSocket.OPEN) return;
            this.derivSocket.send(JSON.stringify({ forget_all: "ticks" }));
            this.derivSocket.send(JSON.stringify({ ticks: this.activeSymbol, subscribe: 1, req_id: 21 }));
            this.derivSocket.send(JSON.stringify({
                ticks_history: this.activeSymbol,
                end: "latest",
                count: 120,
                style: "candles",
                granularity: window.profiteraChart ? window.profiteraChart.interval : 60,
                req_id: 22,
            }));
        }

        setActive(symbol) {
            this.activeSymbol = symbol;
            const market = this.markets.find((item) => item.symbol === symbol);
            if (this.activeName && market) this.activeName.textContent = market.display_name || symbol;
            if (this.activeCode) this.activeCode.textContent = symbol;
            if (this.tradeSymbol) this.tradeSymbol.value = symbol;
            const popover = document.getElementById("markets-popover");
            if (popover) popover.hidden = true;
            if (window.profiteraChart) window.profiteraChart.clear();
            const synthetic = market ? this.isSynthetic(market) : !String(symbol).startsWith("frx");
            document.body.classList.toggle("market-forex", !synthetic);
            document.body.classList.toggle("market-synthetic", synthetic);
            window.dispatchEvent(new CustomEvent("profitera:market", { detail: { symbol, market, synthetic } }));
            this.subscribeActive();
            this.render();
        }

        ingestTick(tick) {
            const symbol = tick.symbol;
            const price = Number(tick.price);
            if (!symbol || !Number.isFinite(price)) return;
            const previous = this.prices.get(symbol);
            this.prices.set(symbol, price);
            if (symbol === this.activeSymbol) {
                if (this.activePrice) this.activePrice.textContent = price.toFixed(2);
                if (this.activeChange && previous) {
                    const change = ((price - previous) / previous) * 100;
                    this.activeChange.textContent = `${price.toFixed(2)} ${change >= 0 ? "+" : ""}${change.toFixed(2)}%`;
                    this.activeChange.className = change > 0 ? "positive" : change < 0 ? "negative" : "neutral";
                }
                if (window.profiteraChart) window.profiteraChart.ingestTick(tick);
                if (window.profiteraDigits) window.profiteraDigits.ingest(price);
                window.dispatchEvent(new CustomEvent("profitera:tick", { detail: { symbol, price } }));
            }
            this.updatePriceRow(symbol, price, previous);
        }

        render() {
            if (!this.list) return;
            const query = (this.search ? this.search.value : "").toLowerCase();
            const rows = this.markets
                .filter((item) => this.filter === "all" || (this.filter === "favorite" ? this.favorites.has(item.symbol) : this.filter === "synthetic" || this.filter === "derived" ? this.isSynthetic(item) : `${item.market} ${item.market_display_name}`.toLowerCase().includes(this.filter)))
                .filter((item) => `${item.symbol} ${item.display_name} ${item.market_display_name}`.toLowerCase().includes(query))
                .slice(0, 140);
            this.list.innerHTML = rows.map((item) => {
                const price = this.prices.get(item.symbol);
                const favorite = this.favorites.has(item.symbol);
                return `
                    <article class="market-row ${item.symbol === this.activeSymbol ? "is-active" : ""}" data-symbol="${item.symbol}">
                        <button class="favorite-btn ${favorite ? "is-on" : ""}" data-favorite="${item.symbol}" type="button">${favorite ? "*" : "+"}</button>
                        <button class="market-main" data-select-symbol="${item.symbol}" type="button">
                            <span class="market-name">${item.display_name || item.symbol}</span>
                            <span class="market-meta">${item.symbol} / ${item.market_display_name || item.market || "Market"}</span>
                        </button>
                        <strong class="market-price" data-price-symbol="${item.symbol}">${price ? price.toFixed(2) : "-"}</strong>
                    </article>
                `;
            }).join("");
            this.list.querySelectorAll("[data-select-symbol]").forEach((button) => {
                button.addEventListener("click", () => this.setActive(button.dataset.selectSymbol));
            });
            this.list.querySelectorAll("[data-favorite]").forEach((button) => {
                button.addEventListener("click", () => {
                    const symbol = button.dataset.favorite;
                    if (this.favorites.has(symbol)) this.favorites.delete(symbol);
                    else this.favorites.add(symbol);
                    localStorage.setItem("profitera:favorites", JSON.stringify([...this.favorites]));
                    this.render();
                });
            });
        }

        updatePriceRow(symbol, price, previous) {
            const el = document.querySelector(`[data-price-symbol="${symbol}"]`);
            if (!el) return;
            el.textContent = price.toFixed(2);
            el.classList.toggle("up", previous !== undefined && price > previous);
            el.classList.toggle("down", previous !== undefined && price < previous);
        }

        setConnection(online) {
            if (!this.connection) return;
            this.connection.textContent = online ? "online" : "offline";
            this.connection.classList.toggle("online", online);
        }

        note(message) {
            console.log(`Profitera market: ${message}`);
        }
    }

    window.profiteraMarkets = new MarketStream();
})();
