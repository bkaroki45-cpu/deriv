(function () {
    class DigitsWidget {
        constructor(rootId) {
            this.root = document.getElementById(rootId);
            this.lastDigitEl = document.getElementById("last-digit");
            this.maxWindow = 1000;
            this.window = [];
            this.counts = Array.from({ length: 10 }, () => 0);
            this.total = 0;
            if (this.root) this.render();
        }

        render() {
            this.root.innerHTML = "";
            for (let digit = 0; digit <= 9; digit += 1) {
                const cell = document.createElement("div");
                cell.className = "digit-cell";
                cell.dataset.digit = String(digit);
                cell.innerHTML = `
                    <span class="digit-flame">▲</span>
                    <strong>${digit}</strong>
                    <div class="digit-bar"><span></span></div>
                    <em class="digit-percent">0.0%</em>
                    <small>0 ticks</small>
                `;
                this.root.appendChild(cell);
            }
        }

        digitFromTick(tick) {
            if (tick && Number.isInteger(Number(tick.digit))) return Number(tick.digit);
            const price = tick && typeof tick === "object" ? tick.price : tick;
            const quote = tick && typeof tick === "object" ? tick.quote : "";
            const pipSize = Number(tick && typeof tick === "object" ? tick.pipSize ?? tick.pip_size : NaN);
            const text = quote
                ? String(quote)
                : Number.isFinite(Number(price)) && Number.isInteger(pipSize)
                    ? Number(price).toFixed(pipSize)
                    : String(price);
            const match = text.replace(/[^0-9]/g, "").match(/\d$/);
            return match ? Number(match[0]) : null;
        }

        ingest(tick) {
            const digit = this.digitFromTick(tick);
            if (!Number.isInteger(digit) || digit < 0 || digit > 9) return;
            this.window.push(digit);
            if (this.window.length > this.maxWindow) {
                const removed = this.window.shift();
                if (Number.isInteger(removed)) this.counts[removed] = Math.max(0, this.counts[removed] - 1);
            }
            this.counts[digit] += 1;
            this.total = this.window.length;
            if (this.lastDigitEl) this.lastDigitEl.textContent = String(digit);
            this.update();
            this.pulse(digit);
        }

        reset() {
            this.window = [];
            this.counts = Array.from({ length: 10 }, () => 0);
            this.total = 0;
            if (this.lastDigitEl) this.lastDigitEl.textContent = "-";
            this.update();
        }

        seed(ticks) {
            this.reset();
            const items = Array.isArray(ticks) ? ticks.slice(-this.maxWindow) : [];
            let lastDigit = null;
            items.forEach((tick) => {
                const digit = this.digitFromTick(tick);
                if (!Number.isInteger(digit) || digit < 0 || digit > 9) return;
                this.window.push(digit);
                this.counts[digit] += 1;
                lastDigit = digit;
            });
            this.total = this.window.length;
            if (this.lastDigitEl) this.lastDigitEl.textContent = lastDigit === null ? "-" : String(lastDigit);
            this.update();
            if (lastDigit !== null) this.pulse(lastDigit);
        }

        update() {
            if (!this.root) return;
            const max = Math.max(...this.counts, 1);
            const positive = this.counts.filter((count) => count > 0);
            const min = positive.length ? Math.min(...positive) : 0;
            this.counts.forEach((count, digit) => {
                const cell = this.root.querySelector(`[data-digit="${digit}"]`);
                if (!cell) return;
                const percent = this.total ? (count / this.total) * 100 : 0;
                cell.classList.toggle("is-hot", count === max && count > 0);
                cell.classList.toggle("is-low", count === min && count > 0 && min !== max);
                cell.querySelector(".digit-bar span").style.width = `${percent}%`;
                cell.querySelector(".digit-percent").textContent = `${percent.toFixed(1)}%`;
                cell.querySelector("small").textContent = `${count} ticks`;
            });
        }

        pulse(digit) {
            if (!this.root) return;
            const cell = this.root.querySelector(`[data-digit="${digit}"]`);
            if (!cell) return;
            cell.classList.remove("is-active-tick");
            void cell.offsetWidth;
            cell.classList.add("is-active-tick");
        }

        flash(winningDigit, predictedDigit) {
            const winner = this.root.querySelector(`[data-digit="${winningDigit}"]`);
            const loser = this.root.querySelector(`[data-digit="${predictedDigit}"]`);
            if (winner) {
                winner.classList.remove("is-win");
                void winner.offsetWidth;
                winner.classList.add("is-win");
            }
            if (loser && Number(winningDigit) !== Number(predictedDigit)) {
                loser.classList.remove("is-loss");
                void loser.offsetWidth;
                loser.classList.add("is-loss");
            }
        }
    }

    window.profiteraDigits = new DigitsWidget("digits-grid");
})();
