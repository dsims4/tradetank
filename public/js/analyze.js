function runAnalyzePage() {
    const analyzeGrid = document.querySelector(
        "[data-analyze-stats]"
    );

    if (!analyzeGrid) return;

    const statsCards = [
        ...analyzeGrid.querySelectorAll(".analyze-stat")
    ];
    const integerStats = new Set([
        "tradesCount",
        "daysTradedCount",
        "daysTotalCount"
    ]);

    function formatStatValue(statName, value) {
        if (value === null || value === undefined) return "-";

        if (statName === "processDeviationRate") {
            return `${(value * 100).toFixed(2)}%`;
        }

        if (integerStats.has(statName)) {
            return String(value);
        }

        return Number(value).toFixed(2);
    }

    async function loadStats() {
        const response = await fetch("/api/analyze-stats");
        const stats = await readAPIResponse(
            response,
            "The statistics request failed."
        );

        for (const statValue of analyzeGrid.querySelectorAll(
            "[data-stat]"
        )) {
            const statName = statValue.dataset.stat;

            statValue.textContent = formatStatValue(
                statName,
                stats[statName]
            );
        }
    }

    let draggedCard = null;
    let dragOffsetX = 0;
    let dragOffsetY = 0;
    let draggedWidth = 0;
    let draggedHeight = 0;
    let dragImage = null;

    for (const statCard of statsCards) {
        statCard.draggable = true;
    }

    analyzeGrid.addEventListener("dragstart", (event) => {
        const statCard = event.target.closest(".analyze-stat");

        if (!statCard) return;

        draggedCard = statCard;

        const draggedBounds =
            draggedCard.getBoundingClientRect();

        dragOffsetX = event.clientX - draggedBounds.left;
        dragOffsetY = event.clientY - draggedBounds.top;
        draggedWidth = draggedBounds.width;
        draggedHeight = draggedBounds.height;

        dragImage = statCard.cloneNode(true);
        dragImage.classList.add("analyze-stat-drag-image");
        dragImage.style.left = `${draggedBounds.left}px`;
        dragImage.style.top = `${draggedBounds.top}px`;
        dragImage.style.width = `${draggedWidth}px`;
        dragImage.style.height = `${draggedHeight}px`;
        document.body.append(dragImage);

        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setDragImage(
            dragImage,
            dragOffsetX,
            dragOffsetY
        );

        requestAnimationFrame(() => {
            dragImage?.remove();
            dragImage = null;

            if (draggedCard === statCard) {
                statCard.classList.add(
                    "analyze-stat--dragging"
                );
            }
        });
    });

    analyzeGrid.addEventListener("dragover", (event) => {
        event.preventDefault();

        if (!draggedCard) return;

        const targetCard = event.target.closest(".analyze-stat");

        if (!targetCard || targetCard === draggedCard) return;

        const targetBounds =
            targetCard.getBoundingClientRect();

        const draggedLeft = event.clientX - dragOffsetX;
        const draggedTop = event.clientY - dragOffsetY;
        const draggedRight = draggedLeft + draggedWidth;
        const draggedBottom = draggedTop + draggedHeight;
        const overlapWidth = Math.max(
            0,
            Math.min(draggedRight, targetBounds.right) -
                Math.max(draggedLeft, targetBounds.left)
        );
        const overlapHeight = Math.max(
            0,
            Math.min(draggedBottom, targetBounds.bottom) -
                Math.max(draggedTop, targetBounds.top)
        );
        const overlapRatio =
            overlapWidth * overlapHeight /
            (draggedWidth * draggedHeight);

        if (overlapRatio < 0.4) return;

        const currentCards = [
            ...analyzeGrid.querySelectorAll(".analyze-stat")
        ];
        const draggedCardIndex = currentCards.indexOf(draggedCard);
        const targetCardIndex = currentCards.indexOf(targetCard);

        if (draggedCardIndex < targetCardIndex) {
            targetCard.after(draggedCard);
        } else {
            targetCard.before(draggedCard);
        }
    });

    analyzeGrid.addEventListener("dragend", () => {
        dragImage?.remove();
        dragImage = null;
        draggedCard?.classList.remove(
            "analyze-stat--dragging"
        );
        draggedCard = null;
    });

    loadStats().catch(() => {
        for (const statValue of analyzeGrid.querySelectorAll(
            "[data-stat]"
        )) {
            statValue.textContent = "Unavailable";
        }
    });
}

runAnalyzePage();
