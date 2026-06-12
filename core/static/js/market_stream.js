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
        { symbol: "frxGBPUSD", display_name: "GBP/USD", market: "forex", market_display_name: "Forex" },
        { symbol: "frxUSDJPY", display_name: "USD/JPY", market: "forex", market_display_name: "Forex" },
        { symbol: "frxXAUUSD", display_name: "Gold/USD", market: "commodities", market_display_name: "Commodities" },
        { symbol: "cryBTCUSD", display_name: "BTC/USD", market: "cryptocurrency", market_display_name: "Crypto" },
        { symbol: "cryETHUSD", display_name: "ETH/USD", market: "cryptocurrency", market_display_name: "Crypto" },
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
            this.previousPrices = new Map();
            this.favorites = new Set(JSON.parse(localStorage.getItem("profitera:favorites") || "[]"));
            this.recent = JSON.parse(localStorage.getItem("profitera:recent-markets") || "[]");
            this.activeSymbol = new URLSearchParams(window.location.search).get("symbol") || "1HZ100V";
            this.filter = "all";
            this.derivSocket = null;
            this.localSocket = null;
            this.reconnectTimer = null;
            this.pending = new Map();
            this.requestId = 100;
            this.visibleSubscriptions = new Set();
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
                const response = await this.derivRequest({ active_symbols: "full", req_id: 10 });
                const remote = Array.isArray(response.active_symbols) ? response.active_symbols : [];
                this.markets = this.syntheticFirst((remote.length ? remote : DEFAULT_MARKETS).map((item) => this.normalizeMarket(item)));
            } catch (error) {
                this.markets = this.syntheticFirst(DEFAULT_MARKETS.map((item) => this.normalizeMarket(item)));
                this.note(`Using local symbol list: ${error.message}`);
            }
            this.activeSymbol = this.exactSymbol(this.activeSymbol)
                || this.exactSymbol("1HZ100V")
                || (this.markets[0] && this.markets[0].symbol)
                || this.activeSymbol;
            this.syncActiveSymbolUi();
            this.render();
            this.subscribeVisibleRows();
        }

        normalizeMarket(item) {
            const symbol = String(item.symbol || "").trim();
            return {
                ...item,
                symbol,
                display_name: item.display_name || item.symbol || symbol,
                market: item.market || "",
                market_display_name: item.market_display_name || item.market || "Market",
            };
        }

        exactSymbol(symbol) {
            const requested = String(symbol || "").trim().toLowerCase();
            if (!requested) return "";
            const market = this.markets.find((item) => String(item.symbol).toLowerCase() === requested);
            return market ? market.symbol : "";
        }

        activeMarket() {
            return this.markets.find((item) => item.symbol === this.activeSymbol);
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

        matchesCategory(item, category) {
            if (category === "all") return true;
            if (category === "favorite") return this.favorites.has(item.symbol);
            if (category === "recent") return this.recent.includes(item.symbol);
            const text = `${item.symbol} ${item.display_name} ${item.market} ${item.market_display_name}`.toLowerCase();
            if (["synthetic", "derived"].includes(category)) return this.isSynthetic(item);
            if (category === "stock") return text.includes("stock") || text.includes("indices") || text.includes("otc stocks");
            if (category === "basket") return text.includes("basket");
            if (category === "crypto") return text.includes("crypto") || text.includes("cryptocurrency") || text.includes("btc") || text.includes("eth");
            if (category === "commodities") return text.includes("commod") || text.includes("gold") || text.includes("silver") || text.includes("xau");
            return text.includes(category);
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

        sendDeriv(payload, type = "request") {
            return new Promise((resolve, reject) => {
                if (!this.derivSocket || this.derivSocket.readyState !== WebSocket.OPEN) {
                    reject(new Error("Deriv WebSocket is not connected"));
                    return;
                }
                const reqId = this.requestId += 1;
                this.pending.set(reqId, { resolve, reject, type });
                this.derivSocket.send(JSON.stringify({ ...payload, req_id: reqId }));
                setTimeout(() => {
                    if (!this.pending.has(reqId)) return;
                    this.pending.delete(reqId);
                    reject(new Error("Deriv request timeout"));
                }, 10000);
            });
        }

        connectDeriv() {
            const appId = window.PROFITERA_DERIV_APP_ID || "1089";
            this.derivSocket = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${appId}`);
            this.derivSocket.onopen = () => {
                this.setConnection(true);
                this.authorize();
                this.subscribeActive();
            };
            this.derivSocket.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.req_id && this.pending.has(data.req_id)) {
                    const pending = this.pending.get(data.req_id);
                    this.pending.delete(data.req_id);
                    if (data.error) pending.reject(new Error(data.error.message));
                    else pending.resolve(data);
                    if (pending.type !== "subscription") return;
                }
                if (data.authorize) this.requestBalance();
                if (data.balance) {
                    window.dispatchEvent(new CustomEvent("profitera:account", { detail: data.balance }));
                }
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

        authorize() {
            const token = window.PROFITERA_DERIV_SESSION && window.PROFITERA_DERIV_SESSION.token;
            if (!token || !this.derivSocket || this.derivSocket.readyState !== WebSocket.OPEN) return;
            this.derivSocket.send(JSON.stringify({ authorize: token, req_id: this.requestId += 1 }));
        }

        requestBalance() {
            if (!this.derivSocket || this.derivSocket.readyState !== WebSocket.OPEN) return;
            this.derivSocket.send(JSON.stringify({ balance: 1, subscribe: 1, req_id: this.requestId += 1 }));
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
            this.subscribeVisibleRows();
            this.derivSocket.send(JSON.stringify({
                ticks_history: this.activeSymbol,
                end: "latest",
                count: 120,
                style: "candles",
                granularity: window.profiteraChart ? window.profiteraChart.interval : 60,
                req_id: 22,
            }));
        }

        subscribeVisibleRows() {
            if (!this.derivSocket || this.derivSocket.readyState !== WebSocket.OPEN) return;
            this.derivSocket.send(JSON.stringify({ forget_all: "ticks" }));
            const symbols = new Set([this.activeSymbol]);
            if (this.list) {
                this.list.querySelectorAll("[data-symbol]").forEach((row) => {
                    const symbol = this.exactSymbol(row.dataset.symbol);
                    if (symbol && symbols.size < 24) symbols.add(symbol);
                });
            }
            this.visibleSubscriptions = symbols;
            symbols.forEach((symbol) => {
                this.derivSocket.send(JSON.stringify({ ticks: symbol, subscribe: 1, req_id: this.requestId += 1 }));
            });
        }

        syncActiveSymbolUi() {
            const market = this.activeMarket();
            if (this.activeName) this.activeName.textContent = market ? (market.display_name || this.activeSymbol) : this.activeSymbol;
            if (this.activeCode) this.activeCode.textContent = this.activeSymbol;
            if (this.tradeSymbol) this.tradeSymbol.value = this.activeSymbol;
            const synthetic = market ? this.isSynthetic(market) : !String(this.activeSymbol).startsWith("frx");
            document.body.classList.toggle("market-forex", !synthetic);
            document.body.classList.toggle("market-synthetic", synthetic);
        }

        rememberSymbol(symbol) {
            this.recent = [symbol, ...this.recent.filter((item) => item !== symbol)].slice(0, 12);
            localStorage.setItem("profitera:recent-markets", JSON.stringify(this.recent));
        }

        setActive(symbol) {
            const exact = this.exactSymbol(symbol);
            if (!exact) {
                this.note(`Unknown Deriv market ignored: ${symbol}`);
                return;
            }
            this.activeSymbol = exact;
            const market = this.activeMarket();
            this.syncActiveSymbolUi();
            this.rememberSymbol(exact);
            const popover = document.getElementById("markets-popover");
            if (popover) popover.hidden = true;
            if (window.profiteraChart) window.profiteraChart.clear();
            const synthetic = market ? this.isSynthetic(market) : !String(exact).startsWith("frx");
            window.dispatchEvent(new CustomEvent("profitera:market", { detail: { symbol: exact, market, synthetic } }));
            this.subscribeActive();
            this.render();
            this.subscribeVisibleRows();
        }

        ingestTick(tick) {
            const symbol = tick.symbol;
            const price = Number(tick.price);
            if (!symbol || !Number.isFinite(price)) return;
            const previous = this.prices.get(symbol);
            if (previous !== undefined) this.previousPrices.set(symbol, previous);
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
                .filter((item) => this.matchesCategory(item, this.filter))
                .filter((item) => `${item.symbol} ${item.display_name} ${item.market_display_name}`.toLowerCase().includes(query))
                .slice(0, 140);
            this.list.innerHTML = rows.map((item) => {
                const price = this.prices.get(item.symbol);
                const previous = this.previousPrices.get(item.symbol);
                const change = Number.isFinite(price) && Number.isFinite(previous) && previous !== 0
                    ? ((price - previous) / previous) * 100
                    : null;
                const favorite = this.favorites.has(item.symbol);
                return `
                    <article class="market-row ${item.symbol === this.activeSymbol ? "is-active" : ""}" data-symbol="${item.symbol}">
                        <button class="favorite-btn ${favorite ? "is-on" : ""}" data-favorite="${item.symbol}" type="button">${favorite ? "*" : "+"}</button>
                        <button class="market-main" data-select-symbol="${item.symbol}" type="button">
                            <span class="market-name">${item.display_name || item.symbol}</span>
                            <span class="market-meta">${item.symbol} / ${item.market_display_name || item.market || "Market"}</span>
                        </button>
                        <strong class="market-price" data-price-symbol="${item.symbol}">${Number.isFinite(price) ? price.toFixed(2) : "-"}</strong>
                        <span class="market-change ${change > 0 ? "up" : change < 0 ? "down" : ""}" data-change-symbol="${item.symbol}">${change === null ? "-" : `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`}</span>
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
                    this.subscribeVisibleRows();
                });
            });
            this.subscribeVisibleRows();
        }

        updatePriceRow(symbol, price, previous) {
            const el = document.querySelector(`[data-price-symbol="${symbol}"]`);
            if (el) {
                el.textContent = price.toFixed(2);
                el.classList.toggle("up", previous !== undefined && price > previous);
                el.classList.toggle("down", previous !== undefined && price < previous);
            }
            const changeEl = document.querySelector(`[data-change-symbol="${symbol}"]`);
            if (changeEl && previous) {
                const change = ((price - previous) / previous) * 100;
                changeEl.textContent = `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`;
                changeEl.classList.toggle("up", change > 0);
                changeEl.classList.toggle("down", change < 0);
            }
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
