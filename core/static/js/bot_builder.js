(function () {
    const stage = document.getElementById("builder-stage");
    const modalLayer = document.getElementById("bot-modal-layer");
    let draggedLabel = "";
    let zoom = 1;

    document.querySelectorAll(".block-menu-item[draggable='true']").forEach((block) => {
        block.addEventListener("dragstart", (event) => {
            draggedLabel = block.textContent.trim();
            event.dataTransfer.setData("text/plain", draggedLabel);
        });
    });

    if (stage) {
        stage.addEventListener("dragover", (event) => event.preventDefault());
        stage.addEventListener("drop", (event) => {
            event.preventDefault();
            const rect = stage.getBoundingClientRect();
            const label = event.dataTransfer.getData("text/plain") || draggedLabel || "Strategy block";
            const node = document.createElement("article");
            node.className = "bot-block";
            node.style.left = `${Math.max(8, (event.clientX - rect.left) / zoom - 90)}px`;
            node.style.top = `${Math.max(8, (event.clientY - rect.top) / zoom - 24)}px`;
            node.innerHTML = `<h3>${label}</h3><p><span>Configure parameters</span></p>`;
            stage.appendChild(node);
        });
    }

    document.querySelectorAll("[data-bot-modal]").forEach((button) => {
        button.addEventListener("click", () => {
            if (!modalLayer) return;
            modalLayer.hidden = false;
            document.querySelectorAll("[data-bot-panel]").forEach((panel) => {
                panel.hidden = panel.dataset.botPanel !== button.dataset.botModal;
            });
        });
    });

    document.querySelectorAll("[data-close-bot-modal]").forEach((button) => {
        button.addEventListener("click", () => {
            if (modalLayer) modalLayer.hidden = true;
        });
    });

    if (modalLayer) {
        modalLayer.addEventListener("click", (event) => {
            if (event.target === modalLayer) modalLayer.hidden = true;
        });
    }

    document.querySelectorAll("[data-bot-action]").forEach((button) => {
        button.addEventListener("click", () => {
            const action = button.dataset.botAction;
            if (action === "zoom-in") zoom = Math.min(1.4, zoom + 0.1);
            if (action === "zoom-out") zoom = Math.max(0.7, zoom - 0.1);
            if (stage && (action === "zoom-in" || action === "zoom-out")) stage.style.transform = `scale(${zoom})`;
            if (action === "sort" && stage) {
                [...stage.querySelectorAll(".bot-block")].forEach((block, index) => {
                    block.style.left = `${18 + (index % 2) * 500}px`;
                    block.style.top = `${48 + Math.floor(index / 2) * 178}px`;
                });
            }
            if (action === "undo" || action === "redo") {
                button.animate([{ transform: "scale(1)" }, { transform: "scale(0.86)" }, { transform: "scale(1)" }], { duration: 180 });
            }
        });
    });

    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
        button.addEventListener("click", () => {
            document.body.classList.toggle("theme-light");
        });
    });
})();
