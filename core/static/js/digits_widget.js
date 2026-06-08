(function () {
    class DigitsWidget {
        constructor(rootId) {
            this.root = document.getElementById(rootId);
            this.lastDigitEl = document.getElementById("last-digit");
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
                    <strong>${digit}</strong>
                    <div class="digit-bar"><span></span></div>
                    <small>0 ticks</small>
                `;
                this.root.appendChild(cell);
            }
        }

        ingest(price) {
            const text = String(price);
            const match = text.match(/\d(?=\D*$)/);
            if (!match) return;
            const digit = Number(match[0]);
            this.counts[digit] += 1;
            this.total += 1;
            if (this.lastDigitEl) this.lastDigitEl.textContent = String(digit);
            this.update();
        }

        update() {
            const max = Math.max(...this.counts, 1);
            this.counts.forEach((count, digit) => {
                const cell = this.root.querySelector(`[data-digit="${digit}"]`);
                if (!cell) return;
                const percent = this.total ? (count / this.total) * 100 : 0;
                cell.classList.toggle("is-hot", count === max && count > 0);
                cell.querySelector(".digit-bar span").style.width = `${percent}%`;
                cell.querySelector("small").textContent = `${count} ticks`;
            });
        }
    }

    window.tradeNovaDigits = new DigitsWidget("digits-grid");
})();
