(function () {
    const stage = document.getElementById("builder-stage");
    let draggedLabel = "";

    document.querySelectorAll(".strategy-block[draggable='true']").forEach((block) => {
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
            node.className = "builder-node";
            node.style.left = `${Math.max(8, event.clientX - rect.left - 80)}px`;
            node.style.top = `${Math.max(8, event.clientY - rect.top - 24)}px`;
            node.innerHTML = `<strong>${label}</strong><small>Configure parameters</small>`;
            stage.appendChild(node);
            const validation = document.getElementById("builder-validation");
            if (validation) validation.textContent = "valid";
        });
    }
})();
