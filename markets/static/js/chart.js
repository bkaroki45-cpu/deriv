const canvas = document.getElementById("chart");
const ctx = canvas.getContext("2d");
const statusEl = document.getElementById("chart-status");
const priceEl = document.getElementById("last-price");
const countEl = document.getElementById("candle-count");
const rangeEl = document.getElementById("price-range");

let candles = [];
let zoom = 1;
let pan = 0;
let dragging = false;
let lastX = 0;

function setStatus(text, online) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.classList.toggle("online", Boolean(online));
}

function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = Math.max(720, Math.floor(rect.width * devicePixelRatio));
    canvas.height = Math.max(360, Math.floor(rect.height * devicePixelRatio));
    drawChart();
}

function visibleCandles() {
    const amount = Math.floor(120 / zoom);
    return candles.slice(Math.max(0, candles.length - amount));
}

function chartScale(series) {
    const high = Math.max(...series.map((candle) => candle.high));
    const low = Math.min(...series.map((candle) => candle.low));
    const padding = Math.max((high - low) * 0.12, Math.abs(high) * 0.0001);
    const top = high + padding;
    const bottom = low - padding;
    const plotHeight = canvas.height - 64 * devicePixelRatio;
    return {
        top,
        bottom,
        y: (price) => 28 * devicePixelRatio + ((top - price) / (top - bottom || 1)) * plotHeight,
    };
}

function drawGrid() {
    ctx.strokeStyle = "rgba(145, 161, 181, 0.14)";
    ctx.lineWidth = devicePixelRatio;
    for (let i = 1; i < 6; i += 1) {
        const y = (canvas.height / 6) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
    for (let i = 1; i < 8; i += 1) {
        const x = (canvas.width / 8) * i;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
}

function drawChart() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#111820";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    drawGrid();

    const series = visibleCandles();
    if (!series.length) {
        ctx.fillStyle = "#a2a8aa";
        ctx.font = `${14 * devicePixelRatio}px Inter, sans-serif`;
        ctx.fillText("Waiting for live candle data", 22 * devicePixelRatio, 36 * devicePixelRatio);
        return;
    }

    const axisWidth = 92 * devicePixelRatio;
    const plotWidth = canvas.width - axisWidth - 18 * devicePixelRatio;
    const step = plotWidth / Math.max(series.length, 1);
    const candleWidth = Math.max(4 * devicePixelRatio, Math.min(18 * devicePixelRatio, step * 0.58));
    const scale = chartScale(series);

    ctx.font = `${12 * devicePixelRatio}px Inter, sans-serif`;
    ctx.textAlign = "right";
    ctx.fillStyle = "#a2a8aa";
    for (let i = 0; i <= 4; i += 1) {
        const price = scale.bottom + ((scale.top - scale.bottom) / 4) * i;
        ctx.fillText(price.toFixed(4), canvas.width - 12 * devicePixelRatio, scale.y(price));
    }

    series.forEach((candle, index) => {
        const x = 16 * devicePixelRatio + index * step + step / 2 + pan * devicePixelRatio;
        const openY = scale.y(candle.open);
        const closeY = scale.y(candle.close);
        const highY = scale.y(candle.high);
        const lowY = scale.y(candle.low);
        const rising = candle.close >= candle.open;
        ctx.strokeStyle = rising ? "#00c390" : "#ff444f";
        ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath();
        ctx.moveTo(x, highY);
        ctx.lineTo(x, lowY);
        ctx.stroke();
        ctx.fillRect(x - candleWidth / 2, Math.min(openY, closeY), candleWidth, Math.max(2 * devicePixelRatio, Math.abs(openY - closeY)));
    });

    const latest = series[series.length - 1];
    if (priceEl) priceEl.textContent = latest.close.toFixed(4);
    if (countEl) countEl.textContent = String(candles.length);
    if (rangeEl) rangeEl.textContent = `${scale.bottom.toFixed(4)} - ${scale.top.toFixed(4)}`;
}

function applyZoom(nextZoom) {
    zoom = Math.min(5, Math.max(0.25, nextZoom));
    drawChart();
}

document.querySelectorAll("[data-chart-action]").forEach((button) => {
    button.addEventListener("click", () => {
        if (button.dataset.chartAction === "zoom-in") applyZoom(zoom + 0.2);
        if (button.dataset.chartAction === "zoom-out") applyZoom(zoom - 0.2);
        if (button.dataset.chartAction === "reset") {
            zoom = 1;
            pan = 0;
            drawChart();
        }
    });
});

canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    applyZoom(zoom + (event.deltaY > 0 ? -0.12 : 0.12));
}, { passive: false });

canvas.addEventListener("mousedown", (event) => {
    dragging = true;
    lastX = event.clientX;
});

window.addEventListener("mouseup", () => {
    dragging = false;
});

window.addEventListener("mousemove", (event) => {
    if (!dragging) return;
    pan += event.clientX - lastX;
    lastX = event.clientX;
    drawChart();
});

function connect() {
    const scheme = window.location.protocol === "https:" ? "wss" : "ws";
    const socket = new WebSocket(`${scheme}://${window.location.host}/ws/charts/`);

    socket.onopen = () => setStatus("online", true);
    socket.onerror = () => setStatus("error", false);
    socket.onclose = () => {
        setStatus("offline", false);
        setTimeout(connect, 3000);
    };
    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        const candle = {
            open: Number(data.open),
            high: Number(data.high),
            low: Number(data.low),
            close: Number(data.close),
            time: data.time,
        };
        if (!Number.isFinite(candle.close)) return;
        candles.push(candle);
        if (candles.length > 600) candles.shift();
        drawChart();
    };
}

window.addEventListener("resize", resize);
resize();
connect();
