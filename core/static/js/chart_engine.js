(function () {
    class ProfiteraChart {
        constructor(canvasId) {
            this.canvas = document.getElementById(canvasId);
            if (!this.canvas) return;
            this.ctx = this.canvas.getContext("2d");
            this.mode = "line";
            this.interval = 1;
            this.candles = [];
            this.ticks = [];
            this.zoom = 1;
            this.pan = 0;
            this.crosshair = null;
            this.activeTool = null;
            this.drawings = [];
            this.tradeFlags = [];
            this.contractOverlay = { type: "rise_fall" };
            this.accumulatorRange = null;
            this.priceAnimation = null;
            this.flowAnimation = null;
            this.animationFrame = null;
            this.readout = document.getElementById("crosshair-readout");
            this.dragging = false;
            this.lastPointerX = 0;
            this.pinchDistance = 0;
            this.resizeObserver = new ResizeObserver(() => this.resize());
            this.resizeObserver.observe(this.canvas.parentElement);
            this.bind();
            this.resize();
            window.addEventListener("resize", () => this.resize());
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

            this.canvas.addEventListener("mousedown", (event) => {
                if (this.activeTool) {
                    this.addDrawingPoint(event);
                    return;
                }
                this.dragging = true;
                this.lastPointerX = event.clientX;
            });
            window.addEventListener("mouseup", () => { this.dragging = false; });
            window.addEventListener("mousemove", (event) => {
                if (!this.dragging) return;
                this.pan += event.clientX - this.lastPointerX;
                this.lastPointerX = event.clientX;
                this.draw();
            });

            this.canvas.addEventListener("touchstart", (event) => {
                if (event.touches.length === 1) {
                    this.dragging = true;
                    this.lastPointerX = event.touches[0].clientX;
                }
                if (event.touches.length === 2) {
                    this.dragging = false;
                    this.pinchDistance = this.touchDistance(event);
                }
            }, { passive: true });

            this.canvas.addEventListener("touchmove", (event) => {
                if (event.touches.length === 1 && this.dragging) {
                    event.preventDefault();
                    this.pan += event.touches[0].clientX - this.lastPointerX;
                    this.lastPointerX = event.touches[0].clientX;
                    this.draw();
                }
                if (event.touches.length === 2) {
                    event.preventDefault();
                    const distance = this.touchDistance(event);
                    if (this.pinchDistance) this.setZoom(this.zoom + (distance - this.pinchDistance) / 180);
                    this.pinchDistance = distance;
                }
            }, { passive: false });

            this.canvas.addEventListener("touchend", () => {
                this.dragging = false;
                this.pinchDistance = 0;
            });
        }

        touchDistance(event) {
            const [a, b] = event.touches;
            return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
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

        setTool(tool) {
            this.activeTool = this.activeTool === tool ? null : tool;
            this.draw();
            return this.activeTool;
        }

        setZoom(zoom) {
            this.zoom = Math.min(6, Math.max(0.25, zoom));
            this.draw();
        }

        setContractOverlay(overlay) {
            const previousType = this.contractOverlay && this.contractOverlay.type;
            this.contractOverlay = { type: "rise_fall", ...(overlay || {}) };
            if (this.contractOverlay.type !== "accumulator") {
                this.accumulatorRange = null;
            } else if (previousType !== "accumulator" || this.contractOverlay.lockToEntry) {
                this.accumulatorRange = null;
            }
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
                this.animatePrice(last.close, candle.close);
                last.high = Math.max(last.high, candle.high);
                last.low = Math.min(last.low, candle.low);
                last.close = candle.close;
                last.time = candle.time;
            } else {
                if (last) {
                    this.animatePrice(last.close, candle.close);
                    this.animateFlow();
                }
                this.candles.push({ ...candle, bucket });
            }
            if (this.candles.length > 500) this.candles.shift();
            this.requestDraw();
        }

        animatePrice(from, to) {
            if (!Number.isFinite(Number(from)) || !Number.isFinite(Number(to)) || Number(from) === Number(to)) return;
            this.priceAnimation = {
                from: Number(from),
                to: Number(to),
                start: performance.now(),
                duration: 420,
            };
        }

        animateFlow() {
            this.flowAnimation = {
                start: performance.now(),
                duration: 420,
            };
        }

        animationEase(progress) {
            return 1 - Math.pow(1 - Math.min(1, Math.max(0, progress)), 3);
        }

        requestDraw() {
            if (this.animationFrame) return;
            this.animationFrame = requestAnimationFrame(() => {
                this.animationFrame = null;
                this.draw();
            });
        }

        clear() {
            this.candles = [];
            this.ticks = [];
            this.drawings = [];
            this.tradeFlags = [];
            this.draw();
        }

        addTradeFlag(kind, price) {
            const series = this.visibleSeries();
            const latest = series[series.length - 1];
            if (!latest || !Number.isFinite(Number(price))) return;
            this.tradeFlags.push({ kind, price: Number(price), time: latest.time || Date.now() / 1000 });
            if (this.tradeFlags.length > 40) this.tradeFlags.shift();
            this.draw();
        }

        addDrawingPoint(event) {
            const rect = this.canvas.getBoundingClientRect();
            const point = {
                x: (event.clientX - rect.left) * devicePixelRatio,
                y: (event.clientY - rect.top) * devicePixelRatio,
            };
            const last = this.drawings[this.drawings.length - 1];
            if (["trend", "rectangle", "fib"].includes(this.activeTool)) {
                if (!last || last.complete || last.tool !== this.activeTool) {
                    this.drawings.push({ tool: this.activeTool, points: [point], complete: false });
                } else {
                    last.points.push(point);
                    last.complete = true;
                }
            } else {
                this.drawings.push({ tool: this.activeTool, points: [point], complete: true });
            }
            this.draw();
        }

        visibleSeries() {
            const source = this.mode === "ticks"
                ? this.ticks.map((tick) => ({ open: tick.price, high: tick.price, low: tick.price, close: tick.price, time: tick.time }))
                : this.candles;
            const metrics = this.plotMetrics(this.canvas.width || 900);
            const target = Math.ceil(metrics.plotWidth / metrics.step) + 8;
            return source.slice(Math.max(0, source.length - target));
        }

        renderedSeries(series) {
            if (!this.priceAnimation || !series.length) return series;
            const elapsed = performance.now() - this.priceAnimation.start;
            const progress = Math.min(1, Math.max(0, elapsed / this.priceAnimation.duration));
            const eased = this.animationEase(progress);
            const close = this.priceAnimation.from + (this.priceAnimation.to - this.priceAnimation.from) * eased;
            const copy = series.map((item) => ({ ...item }));
            const latest = copy[copy.length - 1];
            latest.close = close;
            latest.high = Math.max(latest.high, close);
            latest.low = Math.min(latest.low, close);
            if (progress >= 1) this.priceAnimation = null;
            return copy;
        }

        scale(series) {
            const highs = series.map((item) => item.high);
            const lows = series.map((item) => item.low);
            const accumulator = this.accumulatorBounds(series);
            if (accumulator) {
                highs.push(accumulator.upper);
                lows.push(accumulator.lower);
            }
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
            const terminal = document.querySelector(".deriv-terminal");
            const styles = terminal ? getComputedStyle(terminal) : null;
            const chartBg = styles ? styles.getPropertyValue("--dt-chart").trim() : "#09111b";
            const chartLine = styles ? styles.getPropertyValue("--dt-chart-line").trim() : "#5ab8ff";
            ctx.fillStyle = chartBg || "#09111b";
            ctx.fillRect(0, 0, width, height);
            this.drawGrid(ctx, width, height);

            const series = this.renderedSeries(this.visibleSeries());
            if (!series.length) {
                ctx.fillStyle = "#8ea0b8";
                ctx.fillText("Waiting for live market data", 22, 34);
                return;
            }
            const scale = this.scale(series);
            this.drawPriceScale(ctx, scale, width, height);
            if (this.mode === "digits") this.drawDigitChart(ctx, width, height);
            else if (this.mode === "candles") {
                this.drawCandles(ctx, series, scale, width);
                this.drawLatestPriceLine(ctx, series, scale, width);
            } else {
                this.drawLine(ctx, series, scale, width, chartLine || "#5ab8ff");
            }
            this.drawContractOverlay(ctx, series, scale, width, height);
            this.drawStudies(ctx, series, scale, width);
            this.drawDrawings(ctx, width, height);
            this.drawTradeFlags(ctx, series, scale, width);
            this.drawCrosshair(ctx, series, scale, width, height);
            if (this.priceAnimation || this.flowAnimation) this.requestDraw();
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

        plotMetrics(width) {
            const axisWidth = 92 * devicePixelRatio;
            const futureWidth = Math.min(Math.max(width * 0.16, 90 * devicePixelRatio), 190 * devicePixelRatio);
            const plotRight = width - axisWidth;
            const activeRight = plotRight - futureWidth;
            const plotWidth = Math.max(120 * devicePixelRatio, activeRight);
            const step = Math.max(5 * devicePixelRatio, Math.min(18 * devicePixelRatio, 8 * devicePixelRatio * this.zoom));
            return {
                axisWidth,
                futureWidth,
                plotRight,
                activeRight,
                plotWidth,
                step,
            };
        }

        flowOffset(width, count) {
            if (!this.flowAnimation || count <= 1) return 0;
            const elapsed = performance.now() - this.flowAnimation.start;
            const progress = Math.min(1, Math.max(0, elapsed / this.flowAnimation.duration));
            const metrics = this.plotMetrics(width);
            if (progress >= 1) {
                this.flowAnimation = null;
                return 0;
            }
            return metrics.step * (1 - this.animationEase(progress));
        }

        seriesX(index, count, width) {
            const metrics = this.plotMetrics(width);
            const latestOffset = Math.max(0, count - 1 - index) * metrics.step;
            return metrics.activeRight - latestOffset + this.pan + this.flowOffset(width, count);
        }

        drawLatestPriceLine(ctx, series, scale, width) {
            const latest = series[series.length - 1];
            if (!latest) return;
            const metrics = this.plotMetrics(width);
            const x = this.seriesX(series.length - 1, series.length, width);
            const y = scale.y(latest.close);
            ctx.save();
            ctx.strokeStyle = "rgba(237, 244, 255, 0.64)";
            ctx.lineWidth = 1.2 * devicePixelRatio;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(metrics.plotRight, y);
            ctx.stroke();
            ctx.fillStyle = "#f5f6f6";
            ctx.beginPath();
            ctx.arc(x, y, 4 * devicePixelRatio, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        drawCandles(ctx, series, scale, width) {
            const metrics = this.plotMetrics(width);
            const bodyWidth = Math.max(3 * devicePixelRatio, Math.min(10 * devicePixelRatio, metrics.step * 0.58));
            series.forEach((candle, index) => {
                const x = this.seriesX(index, series.length, width);
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

        drawLine(ctx, series, scale, width, color) {
            const accumulator = this.accumulatorBounds(series);
            const lineColor = accumulator && accumulator.breached ? "#ff444f" : this.mode === "ticks" ? "#f5b942" : color;
            if (this.mode !== "ticks") {
                ctx.beginPath();
                series.forEach((item, index) => {
                    const x = this.seriesX(index, series.length, width);
                    const y = scale.y(item.close);
                    if (index === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                });
                ctx.lineTo(this.seriesX(series.length - 1, series.length, width), this.canvas.height);
                ctx.lineTo(this.pan, this.canvas.height);
                ctx.closePath();
                const gradient = ctx.createLinearGradient(0, 0, 0, this.canvas.height);
                gradient.addColorStop(0, "rgba(163, 170, 178, 0.26)");
                gradient.addColorStop(0.58, "rgba(121, 128, 138, 0.12)");
                gradient.addColorStop(1, "rgba(76, 82, 92, 0.03)");
                ctx.fillStyle = gradient;
                ctx.fill();
            }
            ctx.strokeStyle = lineColor;
            ctx.lineWidth = 1.7 * devicePixelRatio;
            ctx.beginPath();
            series.forEach((item, index) => {
                const x = this.seriesX(index, series.length, width);
                const y = scale.y(item.close);
                if (index === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.stroke();
            this.drawLatestPriceLine(ctx, series, scale, width);
        }

        drawDigitChart(ctx, width, height) {
            const counts = window.profiteraDigits ? window.profiteraDigits.counts : Array.from({ length: 10 }, () => 0);
            const max = Math.max(...counts, 1);
            const plotWidth = width - 110;
            const barWidth = plotWidth / 10 - 8;
            ctx.font = `${12 * devicePixelRatio}px Inter, sans-serif`;
            counts.forEach((count, digit) => {
                const pct = count / max;
                const barHeight = pct * (height - 80);
                const x = 18 + digit * (barWidth + 8);
                const y = height - 34 - barHeight;
                ctx.fillStyle = count === max && count > 0 ? "#31d4a0" : "#5ab8ff";
                if (count === Math.min(...counts.filter((value) => value > 0)) && count > 0) ctx.fillStyle = "#ff5f6d";
                ctx.fillRect(x, y, barWidth, barHeight);
                ctx.fillStyle = "#edf4ff";
                ctx.fillText(String(digit), x + barWidth / 2 - 4, height - 12);
            });
        }

        overlayPrice(series) {
            const latest = series[series.length - 1];
            if (!latest) return null;
            const rawBarrier = String(this.contractOverlay.barrier || "").trim();
            const numericBarrier = Number(rawBarrier);
            if (Number.isFinite(numericBarrier)) {
                if (/^[+-]/.test(rawBarrier)) return latest.close + numericBarrier;
                if (numericBarrier < 20 && latest.close > 100) return latest.close + numericBarrier;
                return numericBarrier;
            }
            const offset = Math.max(Math.abs(latest.close) * 0.0015, 0.35);
            return latest.close + (this.contractOverlay.direction === "lower" ? -offset : offset);
        }

        accumulatorBounds(series) {
            const overlay = this.contractOverlay || {};
            if (overlay.type !== "accumulator" || !series.length) return null;
            const latest = series[series.length - 1].close;
            if (overlay.lockToEntry) {
                if (!this.accumulatorRange || !Number.isFinite(this.accumulatorRange.center)) {
                    this.accumulatorRange = { center: latest };
                }
            } else {
                this.accumulatorRange = { center: latest };
            }
            const growth = Math.max(0.01, Math.min(0.08, Number(overlay.growthRate || overlay.growth_rate || 0.03) || 0.03));
            const percentWidth = Math.max(0.00022, growth * 0.0126);
            const halfRange = Math.max(Math.abs(this.accumulatorRange.center) * percentWidth, 0.16);
            const upper = this.accumulatorRange.center + halfRange;
            const lower = this.accumulatorRange.center - halfRange;
            const previous = series.length > 1 ? series[series.length - 2].close : latest;
            return {
                center: this.accumulatorRange.center,
                halfRange,
                upper,
                lower,
                breached: overlay.lockToEntry && (latest > upper || latest < lower),
                direction: latest >= previous ? "up" : "down",
            };
        }

        drawContractOverlay(ctx, series, scale, width, height) {
            const overlay = this.contractOverlay || {};
            if (!series.length || ["rise_fall", "multiplier"].includes(overlay.type)) return;
            const metrics = this.plotMetrics(width);
            const plotRight = metrics.plotRight;
            const price = this.overlayPrice(series);
            const y = Number.isFinite(price) ? scale.y(price) : null;
            ctx.save();
            if (overlay.type === "accumulator") {
                const bounds = this.accumulatorBounds(series);
                if (!bounds) {
                    ctx.restore();
                    return;
                }
                const top = scale.y(bounds.upper);
                const bottom = scale.y(bounds.lower);
                const latest = series[series.length - 1].close;
                const latestY = scale.y(latest);
                const latestX = this.seriesX(series.length - 1, series.length, width);
                const boxLeft = Math.max(latestX, metrics.activeRight - 4 * devicePixelRatio);
                const boxRight = metrics.plotRight - 8 * devicePixelRatio;
                const boxWidth = Math.max(96 * devicePixelRatio, boxRight - boxLeft);
                const boxHeight = Math.max(34 * devicePixelRatio, Math.abs(bottom - top));
                const boxTop = ((top + bottom) / 2) - boxHeight / 2;
                const isBreached = bounds.breached;
                const accent = isBreached ? "#ff444f" : "#70d9dd";
                ctx.fillStyle = isBreached ? "rgba(255, 68, 79, 0.18)" : "rgba(42, 99, 150, 0.22)";
                ctx.fillRect(boxLeft, boxTop, boxWidth, boxHeight);
                ctx.strokeStyle = isBreached ? "rgba(255, 68, 79, 0.92)" : "rgba(67, 158, 233, 0.76)";
                ctx.lineWidth = (isBreached ? 1.8 : 1.25) * devicePixelRatio;
                ctx.setLineDash([]);
                [top, bottom].forEach((lineY) => {
                    ctx.beginPath();
                    ctx.moveTo(boxLeft, lineY);
                    ctx.lineTo(boxLeft + boxWidth, lineY);
                    ctx.stroke();
                });
                ctx.strokeStyle = isBreached ? "rgba(255, 68, 79, 0.52)" : "rgba(67, 158, 233, 0.34)";
                ctx.beginPath();
                ctx.moveTo(boxLeft, boxTop);
                ctx.lineTo(boxLeft, boxTop + boxHeight);
                ctx.moveTo(boxLeft + boxWidth, boxTop);
                ctx.lineTo(boxLeft + boxWidth, boxTop + boxHeight);
                ctx.stroke();
                if (isBreached) {
                    ctx.strokeStyle = "rgba(255, 68, 79, 0.86)";
                    ctx.beginPath();
                    ctx.moveTo(latestX, latestY);
                    ctx.lineTo(boxLeft + boxWidth, latestY);
                    ctx.stroke();
                }
                const percent = ((bounds.halfRange / Math.abs(bounds.center || 1)) * 100).toFixed(5);
                ctx.font = `${10 * devicePixelRatio}px Inter, sans-serif`;
                ctx.textAlign = "right";
                ctx.fillStyle = accent;
                ctx.fillText(`+${percent}%`, boxLeft + boxWidth - 8 * devicePixelRatio, top - 4 * devicePixelRatio);
                ctx.fillText(`-${percent}%`, boxLeft + boxWidth - 8 * devicePixelRatio, bottom + 12 * devicePixelRatio);
            } else if (y !== null) {
                ctx.strokeStyle = overlay.type === "touch" ? "#f5b942" : "#00d4aa";
                ctx.lineWidth = 1.6 * devicePixelRatio;
                ctx.setLineDash([8, 6]);
                ctx.beginPath();
                ctx.moveTo(0, y);
                ctx.lineTo(plotRight, y);
                ctx.stroke();
                const label = overlay.label || "Barrier";
                this.drawOverlayLabel(ctx, `${label} ${price.toFixed(4)}`, Math.max(14, plotRight - 190), y - 8, ctx.strokeStyle);
            }
            ctx.restore();
        }

        drawOverlayLabel(ctx, label, x, y, color) {
            ctx.font = `${12 * devicePixelRatio}px Inter, sans-serif`;
            const padding = 7 * devicePixelRatio;
            const width = ctx.measureText(label).width + padding * 2;
            const height = 24 * devicePixelRatio;
            ctx.fillStyle = "rgba(7, 17, 31, 0.88)";
            ctx.fillRect(x, y - height, width, height);
            ctx.fillStyle = color;
            ctx.fillText(label, x + padding, y - 7 * devicePixelRatio);
        }

        drawStudies(ctx, series, scale, width) {
            if (!series.length) return;
            if (!["ma", "ema", "sr", "bb", "projection", "rsi", "macd"].includes(this.activeTool) && !this.drawings.some((item) => ["ma", "ema", "sr", "bb", "projection", "rsi", "macd"].includes(item.tool))) return;
            if (this.activeTool === "ma" || this.drawings.some((item) => item.tool === "ma")) {
                this.drawAverage(ctx, series, scale, width, "ma", "#f5b942");
            }
            if (this.activeTool === "ema" || this.drawings.some((item) => item.tool === "ema")) {
                this.drawAverage(ctx, series, scale, width, "ema", "#b78cff");
            }
            if (this.activeTool === "sr" || this.drawings.some((item) => item.tool === "sr")) {
                const highs = series.map((item) => item.high);
                const lows = series.map((item) => item.low);
                [Math.max(...highs), Math.min(...lows)].forEach((price) => {
                    const y = scale.y(price);
                    ctx.strokeStyle = "rgba(245, 185, 66, 0.75)";
                    ctx.setLineDash([8, 5]);
                    ctx.beginPath();
                    ctx.moveTo(0, y);
                    ctx.lineTo(width - 92, y);
                    ctx.stroke();
                    ctx.setLineDash([]);
                });
            }
            if (this.activeTool === "bb" || this.drawings.some((item) => item.tool === "bb")) {
                this.drawBollinger(ctx, series, scale, width);
            }
            if (this.activeTool === "projection" || this.drawings.some((item) => item.tool === "projection")) {
                const last = series[series.length - 1];
                const y = scale.y(last.close);
                ctx.strokeStyle = "rgba(0, 212, 170, 0.78)";
                ctx.setLineDash([10, 6]);
                ctx.beginPath();
                ctx.moveTo(width - 180, y);
                ctx.lineTo(width - 92, y - 42 * devicePixelRatio);
                ctx.stroke();
                ctx.setLineDash([]);
            }
            if (this.activeTool === "rsi" || this.drawings.some((item) => item.tool === "rsi")) this.drawStudyBadge(ctx, "RSI 14", width, "#00e676");
            if (this.activeTool === "macd" || this.drawings.some((item) => item.tool === "macd")) this.drawStudyBadge(ctx, "MACD", width, "#f5b942");
        }

        drawBollinger(ctx, series, scale, width) {
            const period = Math.min(20, Math.max(3, series.length));
            ["upper", "lower"].forEach((band) => {
                ctx.strokeStyle = "rgba(58, 168, 255, 0.72)";
                ctx.lineWidth = 1.5 * devicePixelRatio;
                ctx.beginPath();
                series.forEach((item, index) => {
                    const slice = series.slice(Math.max(0, index - period + 1), index + 1).map((point) => point.close);
                    const mean = slice.reduce((sum, value) => sum + value, 0) / slice.length;
                    const variance = slice.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / slice.length;
                    const deviation = Math.sqrt(variance) * 2;
                    const value = band === "upper" ? mean + deviation : mean - deviation;
                    const x = this.seriesX(index, series.length, width);
                    const y = scale.y(value);
                    if (index === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                });
                ctx.stroke();
            });
        }

        drawStudyBadge(ctx, label, width, color) {
            ctx.fillStyle = "rgba(7, 17, 31, 0.82)";
            ctx.strokeStyle = color;
            ctx.lineWidth = 1 * devicePixelRatio;
            ctx.strokeRect(width - 168, 18, 76, 24);
            ctx.fillRect(width - 168, 18, 76, 24);
            ctx.fillStyle = color;
            ctx.font = `${11 * devicePixelRatio}px Inter, sans-serif`;
            ctx.fillText(label, width - 158, 34);
        }

        drawAverage(ctx, series, scale, width, type, color) {
            const period = Math.min(10, Math.max(3, series.length));
            let ema = series[0].close;
            ctx.strokeStyle = color;
            ctx.lineWidth = 2 * devicePixelRatio;
            ctx.beginPath();
            series.forEach((item, index) => {
                let value;
                if (type === "ema") {
                    const k = 2 / (period + 1);
                    ema = item.close * k + ema * (1 - k);
                    value = ema;
                } else {
                    const slice = series.slice(Math.max(0, index - period + 1), index + 1);
                    value = slice.reduce((sum, point) => sum + point.close, 0) / slice.length;
                }
                const x = this.seriesX(index, series.length, width);
                const y = scale.y(value);
                if (index === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            });
            ctx.stroke();
        }

        drawDrawings(ctx, width, height) {
            ctx.lineWidth = 1.5 * devicePixelRatio;
            this.drawings.forEach((drawing) => {
                const [a, b] = drawing.points;
                if (!a) return;
                ctx.strokeStyle = "rgba(237, 244, 255, 0.64)";
                ctx.fillStyle = "rgba(90, 184, 255, 0.08)";
                if (drawing.tool === "horizontal") {
                    ctx.beginPath(); ctx.moveTo(0, a.y); ctx.lineTo(width, a.y); ctx.stroke();
                } else if (drawing.tool === "vertical") {
                    ctx.beginPath(); ctx.moveTo(a.x, 0); ctx.lineTo(a.x, height); ctx.stroke();
                } else if (drawing.tool === "trend" && b) {
                    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
                } else if (drawing.tool === "rectangle" && b) {
                    ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
                    ctx.fillRect(a.x, a.y, b.x - a.x, b.y - a.y);
                } else if (drawing.tool === "fib" && b) {
                    [0, 0.236, 0.382, 0.5, 0.618, 1].forEach((level) => {
                        const y = a.y + (b.y - a.y) * level;
                        ctx.beginPath(); ctx.moveTo(a.x, y); ctx.lineTo(b.x, y); ctx.stroke();
                        ctx.fillText(String(level), b.x + 6, y - 3);
                    });
                }
            });
        }

        drawTradeFlags(ctx, series, scale, width) {
            this.tradeFlags.forEach((flag) => {
                const found = series.findIndex((item) => item.time >= flag.time);
                const index = found >= 0 ? found : series.length - 1;
                const x = this.seriesX(index, series.length, width);
                const y = scale.y(flag.price);
                ctx.fillStyle = flag.kind === "win" ? "#31d4a0" : flag.kind === "loss" ? "#ff5f6d" : "#f5b942";
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(x + 18, y - 8);
                ctx.lineTo(x, y - 16);
                ctx.closePath();
                ctx.fill();
                ctx.strokeStyle = ctx.fillStyle;
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(x, y + 18);
                ctx.stroke();
            });
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
            if (this.readout) {
                const metrics = this.plotMetrics(width);
                const nearest = Math.max(0, Math.min(series.length - 1, series.length - 1 - Math.round((metrics.activeRight + this.pan - this.crosshair.x) / Math.max(1, metrics.step))));
                const item = series[nearest] || series[series.length - 1];
                const time = item && item.time ? new Date(item.time * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "--";
                this.readout.textContent = `Price ${price.toFixed(4)} / ${time}`;
            }
        }
    }

    window.ProfiteraChart = ProfiteraChart;
    window.profiteraChart = new ProfiteraChart("price-chart");
})();
