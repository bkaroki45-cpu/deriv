(function () {
    class BotEngine {
        constructor() {
            this.running = false;
            this.logEl = document.getElementById("bot-log");
            this.stateEl = document.getElementById("bot-state");
            this.operator = document.getElementById("bot-operator");
            this.threshold = document.getElementById("bot-threshold");
            this.action = document.getElementById("bot-action");
            this.bind();
        }

        bind() {
            const start = document.getElementById("bot-start");
            const stop = document.getElementById("bot-stop");
            if (start) start.addEventListener("click", () => this.start());
            if (stop) stop.addEventListener("click", () => this.stop());
            document.querySelectorAll("[data-bot-template]").forEach((button) => {
                button.addEventListener("click", () => this.template(button.dataset.botTemplate));
            });
            window.addEventListener("profitera:tick", (event) => this.onTick(event.detail));
        }

        template(name) {
            if (name === "trend") {
                this.operator.value = ">";
                this.threshold.value = "";
                this.action.value = "BUY";
                this.log("Trend follower template loaded.");
            } else if (name === "martingale") {
                this.operator.value = "<";
                this.threshold.value = "";
                this.action.value = "BUY";
                this.log("Martingale template loaded. Add stake escalation server-side before live use.");
            } else {
                this.operator.value = ">";
                this.threshold.value = "";
                this.action.value = "BUY";
                this.log("Digit tick template loaded. Signals will use live Deriv ticks.");
            }
        }

        start() {
            this.running = true;
            this.setState("running");
            this.log("Automatic trade started.");
        }

        stop() {
            this.running = false;
            this.setState("stopped");
            this.log("Automatic trade stopped.");
        }

        onTick({ symbol, price }) {
            if (!this.running) return;
            const threshold = Number(this.threshold.value);
            if (!Number.isFinite(threshold)) return;
            const matched = this.operator.value === ">" ? price > threshold : price < threshold;
            if (matched) {
                this.log(`${symbol} ${price.toFixed(5)} matched rule. Signal: ${this.action.value}.`);
            }
        }

        setState(state) {
            if (this.stateEl) this.stateEl.textContent = state;
        }

        log(message) {
            if (!this.logEl) return;
            const stamp = new Date().toLocaleTimeString();
            this.logEl.textContent = `[${stamp}] ${message}\n${this.logEl.textContent}`.slice(0, 2400);
        }
    }

    window.profiteraBot = new BotEngine();
})();
