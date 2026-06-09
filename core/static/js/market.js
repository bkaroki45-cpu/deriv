const socket = new WebSocket("ws://127.0.0.1:8000/ws/markets/");

socket.onopen = function () {
    console.log("Connected to Profitera market stream");
};

socket.onmessage = function (event) {
    const data = JSON.parse(event.data);

    const symbol = data.symbol;
    const price = data.price;

    // Update sidebar prices
    const el = document.getElementById(symbol);
    if (el) {
        el.innerText = price;
    }

    // Update main feed
    document.getElementById("live-price").innerText =
        symbol + " → " + price;
};

socket.onclose = function () {
    console.log("Disconnected from market stream");
};
