const canvas = document.getElementById("chart");
const ctx = canvas.getContext("2d");

// =========================
// CANVAS SETUP
// =========================
canvas.width = window.innerWidth;
canvas.height = 600;

// =========================
// LIVE CANDLE STORAGE
// =========================
let candles = [];

// =========================
// WEBSOCKET CONNECTION
// =========================
const socket = new WebSocket("ws://127.0.0.1:8000/ws/charts/");

socket.onopen = function () {
    console.log("📊 Connected to TradeNova Chart Stream");
};

socket.onerror = function (error) {
    console.log("❌ WebSocket Error:", error);
};

socket.onclose = function () {
    console.log("⚠️ WebSocket Closed");
};

// =========================
// RECEIVE REAL CANDLES
// =========================
socket.onmessage = function (event) {
    const data = JSON.parse(event.data);

    const candle = {
        open: parseFloat(data.open),
        high: parseFloat(data.high),
        low: parseFloat(data.low),
        close: parseFloat(data.close),
        time: data.time
    };

    candles.push(candle);

    // keep chart light (last 100 candles)
    if (candles.length > 100) {
        candles.shift();
    }

    drawChart();
};

// =========================
// DRAW CANDLESTICK CHART
// =========================
function drawChart() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (candles.length === 0) return;

    const width = 8;
    const spacing = 4;
    const scale = calculateScale();

    candles.forEach((candle, i) => {

        const x = i * (width + spacing);

        const openY = canvas.height - candle.open * scale;
        const closeY = canvas.height - candle.close * scale;
        const highY = canvas.height - candle.high * scale;
        const lowY = canvas.height - candle.low * scale;

        // =========================
        // WICK
        // =========================
        ctx.strokeStyle = "#e5e7eb";
        ctx.beginPath();
        ctx.moveTo(x + width / 2, highY);
        ctx.lineTo(x + width / 2, lowY);
        ctx.stroke();

        // =========================
        // BODY
        // =========================
        const isBullish = candle.close > candle.open;

        ctx.fillStyle = isBullish ? "#22c55e" : "#ef4444";

        ctx.fillRect(
            x,
            Math.min(openY, closeY),
            width,
            Math.max(1, Math.abs(openY - closeY))
        );
    });
}

// =========================
// AUTO SCALE PRICES (IMPORTANT)
// =========================
function calculateScale() {
    let max = Math.max(...candles.map(c => c.high));
    let min = Math.min(...candles.map(c => c.low));

    let range = max - min;

    if (range === 0) return 1;

    return canvas.height / range * 0.8;
}

// =========================
// RESPONSIVE RESIZE
// =========================
window.addEventListener("resize", () => {
    canvas.width = window.innerWidth;
    canvas.height = 600;
    drawChart();
});