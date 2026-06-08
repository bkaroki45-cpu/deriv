(function () {
    class TradeNovaChart {
        constructor(canvasId) {
            this.canvas = document.getElementById(canvasId);
            if (!this.canvas) return;
            this.ctx = this.canvas.getContext("2d");
            this.mode = "candles";
            this.interval = 1;
            this.candles = [];
            this.ticks = [];
            this.zoom = 1;
            this.pan = 0;
            this.crosshair = null;
            this.readout = document.getElementById("crosshair-readout");
            this.resizeObserver = new ResizeObserver(() => this.resize());
            this.resizeObserver.observe(this.canvas.parentElement);
            this.bind();
            this.resize();
        }

        bind() {
            this.canvas.addEventListener("mousemove", (event) => {
                const rect = this.canvas.getBoundingClientRect();
                this.crosshair = {
                    x: (event.clientX - rect.left) * devicePixelRatio,
                    y: (event.clientY - rect.top) * devicePixelRatio,
                };
                this.draw();
            });

            this.canvas.addEventListener("mouseleave", () => {
                this.crosshair = null;
                if (this.readout) this.readout.textContent = "Move over chart";
                this.draw();
            });

            this.canvas.addEventListener("wheel", (event) => {
                event.preventDefault();
                this.setZoom(this.zoom + (event.deltaY > 0 ? -0.12 : 0.12));
            }, { passive: false });

            let dragging = false;
            let lastX = 0;
            this.canvas.addEventListener("mousedown", (event) => {
                dragging = true;
                lastX = event.clientX;
            });
            window.addEventListener("mouseup", () => { dragging = false; });
            window.addEventListener("mousemove", (event) => {
                if (!dragging) return;
                this.pan += event.clientX - lastX;
                lastX = event.clientX;
                this.draw();
            });
        }

        resize() {
            const rect = this.canvas.getBoundingClientRect();
            this.canvas.width = Math.max(640, Math.floor(rect.width * devicePixelRatio));
            this.canvas.height = Math.max(280, Math.floor(rect.height * devicePixelRatio));
            this.draw();
        }

        setMode(mode) {
            this.mode = mode;
            this.draw();
        }

        setInterval(interval) {
            this.interval = Number(interval) || 1;
            this.draw();
        }

        setZoom(zoom) {
            this.zoom = Math.min(3.5, Math.max(0.55, zoom));
            this.draw();
        }

        reset() {
            this.zoom = 1;
            this.pan = 0;
            this.draw();
        }

        ingestTick(tick) {
            const price = Number(tick.price || tick.quote);
            const time = Number(tick.time || tick.epoch || Date.now() / 1000);
            if (!Number.isFinite(price)) return;
            this.ticks.push({ price, time });
            if (this.ticks.length > 700) this.ticks.shift();
            this.upsertCandle({ open: price, high: price, low: price, close: price, time });
        }

        upsertCandle(raw) {
            const candle = {
                open: Number(raw.open),
                high: Number(raw.high),
                low: Number(raw.low),
                close: Number(raw.close),
                time: Number(raw.time || raw.epoch || Date.now() / 1000),
            };
            if (!Number.isFinite(candle.close)) return;
            const bucket = Math.floor(candle.time / this.interval) * this.interval;
            const last = this.candles[this.candles.length - 1];
            if (last && last.bucket === bucket) {
                last.high = Math.max(last.high, candle.high);
                last.low = Math.min(last.low, candle.low);
                last.close = candle.close;
                last.time = candle.time;
            } else {
                this.candles.push({ ...candle, bucket });
            }
            if (this.candles.length > 500) this.candles.shift();
            requestAnimationFrame(() => this.draw());
        }

        clear() {
            this.candles = [];
            this.ticks = [];
            this.draw();
        }

        visibleSeries() {
            const source = this.mode === "ticks"
                ? this.ticks.map((tick) => ({ open: tick.price, high: tick.price, low: tick.price, close: tick.price, time: tick.time }))
                : this.candles;
            const target = Math.floor(90 / this.zoom);
            return source.slice(Math.max(0, source.length - target));
        }

        scale(series) {
            const highs = series.map((item) => item.high);
            const lows = series.map((item) => item.low);
            const max = Math.max(...highs);
            const min = Math.min(...lows);
            const pad = Math.max((max - min) * 0.12, max * 0.0001);
            const top = max + pad;
            const bottom = min - pad;
            const height = this.canvas.height - 44;
            return {
                top,
                bottom,
                y: (price) => 18 + ((top - price) / (top - bottom || 1)) * height,
            };
        }

        draw() {
            if (!this.ctx) return;
            const ctx = this.ctx;
            const width = this.canvas.width;
            const height = this.canvas.height;
            ctx.clearRect(0, 0, width, height);
            ctx.fillStyle = "#09111b";
            ctx.fillRect(0, 0, width, height);
            this.drawGrid(ctx, width, height);

            const series = this.visibleSeries();
            if (!series.length) {
                ctx.fillStyle = "#8ea0b8";
                ctx.fillText("Waiting for live market data", 22, 34);
                return;
            }
            const scale = this.scale(series);
            this.drawPriceScale(ctx, scale, width, height);
            if (this.mode === "candles") this.drawCandles(ctx, series, scale, width);
            else this.drawLine(ctx, series, scale, width);
            this.drawCrosshair(ctx, series, scale, width, height);
        }

        drawGrid(ctx, width, height) {
            ctx.strokeStyle = "rgba(145, 161, 181, 0.11)";
            ctx.lineWidth = 1;
            for (let i = 1; i < 5; i += 1) {
                const y = (height / 5) * i;
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(width, y);
                ctx.stroke();
            }
            for (let i = 1; i < 8; i += 1) {
                const x = (width / 8) * i;
                ctx.beginPath();
                ctx.moveTo(x, 0);
                ctx.lineTo(x, height);
                ctx.stroke();
            }
        }

        drawPriceScale(ctx, scale, width, height) {
            ctx.fillStyle = "#8ea0b8";
            ctx.font = `${12 * devicePixelRatio}px Inter, sans-serif`;
            ctx.textAlign = "right";
            for (let i = 0; i <= 4; i += 1) {
                const price = scale.bottom + ((scale.top - scale.bottom) / 4) * i;
                const y = scale.y(price);
                ctx.fillText(price.toFixed(4), width - 10, y - 4);
            }
            ctx.strokeStyle = "rgba(145, 161, 181, 0.2)";
            ctx.beginPath();
            ctx.moveTo(width - 86, 0);
            ctx.lineTo(width - 86, height);
            ctx.stroke();
        }

        drawCandles(ctx, series, scale, width) {
            const plotWidth = width - 92;
            const step = plotWidth / Math.max(series.length, 1);
            const bodyWidth = Math.max(4 * devicePixelRatio, step * 0.58);
            series.forEach((candle, index) => {
                const x = index * step + step / 2 + this.pan;
                const openY = scale.y(candle.open);
                const closeY = scale.y(candle.close);
                const highY = scale.y(candle.high);
                const lowY = scale.y(candle.low);
                const up = candle.close >= candle.open;
                ctx.strokeStyle = up ? "#31d4a0" : "#ff5f6d";
                ctx.fillStyle = ctx.strokeStyle;
                ctx.beginPath();
                ctx.moveTo(x, highY);
                ctx.lineTo(x, lowY);
                ctx.stroke();
                ctx.fillRect(x - bodyWidth / 2, Math.min(openY, closeY), bodyWidth, Math.max(2, Math.abs(openY - closeY)));
            });
        }

        drawLine(ctx, series, scale, width) {
            const plotWidth = width - 92;
            const step = plotWidth / Math.max(series.length - 1, 1);
            ctx.strokeStyle = this.mode === "ticks" ? "#f5b942" : "#5ab8ff";
            ctx.lineWidth = 2 * devicePixelRatio;
            ctx.beginPath();
            series.forEach((item, index) => {
                const x = index * step + this.pan;
                const y = scale.y(item.close);
                if (index === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.stroke();
        }

        drawCrosshair(ctx, series, scale, width, height) {
            if (!this.crosshair) return;
            ctx.strokeStyle = "rgba(237, 244, 255, 0.35)";
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(this.crosshair.x, 0);
            ctx.lineTo(this.crosshair.x, height);
            ctx.moveTo(0, this.crosshair.y);
            ctx.lineTo(width, this.crosshair.y);
            ctx.stroke();
            ctx.setLineDash([]);

            const price = scale.top - ((this.crosshair.y - 18) / (height - 44)) * (scale.top - scale.bottom);
            if (this.readout) this.readout.textContent = `Price ${price.toFixed(4)}`;
        }
    }

    window.TradeNovaChart = TradeNovaChart;
    window.tradeNovaChart = new TradeNovaChart("price-chart");
})();
