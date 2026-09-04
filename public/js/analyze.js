/*
 * This function initializes the Analyze page.
 *
 * It asks the API for the user's statistics, puts the cards back in the user's
 * saved order, and lets cards be reordered by dragging them. If this script is
 * loaded on a page without the statistics grid, it stops without doing anything.
 *
 * This function does not return a value.
 */
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
    const statUnits = new Map([
        ["tradesCount", "trade"],
        ["pointsCount", "point"],
        ["daysTradedCount", "day"],
        ["daysTotalCount", "day"],
        ["expectancyPerContract", "point"],
        ["expectancyPerTrade", "point"],
        ["expectancyWithProcessDeviation", "point"],
        ["expectancyWithoutProcessDeviation", "point"],
        ["averageTradesPerDay", "trade"],
        ["averageScaleIns", "scale-in"],
        ["averageScaleOuts", "scale-out"],
        ["biggestWinContract", "point"],
        ["biggestLossContract", "point"],
        ["biggestWinTrade", "point"],
        ["biggestLossTrade", "point"]
    ]);

    /*
     * This function reads the internal statistic name stored inside one card.
     *
     * Returns the card's data-stat text, such as "tradesCount."
     * Returns undefined when the card does not contain that value element.
     */
    function getStatName(statCard) {
        return statCard.querySelector("[data-stat]")?.dataset.stat;
    }

    /*
     * This function reads the statistic names in the order currently shown.
     *
     * Returns a new array of statistic names from first card to last card.
     */
    function getStatOrder() {
        return [
            ...analyzeGrid.querySelectorAll(".analyze-stat")
        ].map(getStatName);
    }

    /*
     * This function applies a previously saved statistic-card order.
     *
     * The saved order is ignored if it contains an unknown name, repeats a name,
     * or misses a card. The page then keeps its normal HTML order. This prevents
     * old saved settings from breaking the page after a new statistic is added.
     *
     * This function does not return a value.
     */
    function applyStatOrder(statOrder) {
        if (
            !Array.isArray(statOrder) ||
            statOrder.length !== statsCards.length
        ) {
            return;
        }

        const cardsByStat = new Map(
            statsCards.map((statCard) => [
                getStatName(statCard),
                statCard
            ])
        );

        if (
            new Set(statOrder).size !== statsCards.length ||
            statOrder.some((statName) => !cardsByStat.has(statName))
        ) {
            return;
        }

        for (const statName of statOrder) {
            analyzeGrid.append(cardsByStat.get(statName));
        }
    }

    /*
     * This function formats one statistic with its appropriate unit.
     *
     * A missing value becomes a dash. Rates become percentages. Whole-number
     * counts do not show decimal places, and other numbers show two decimal
     * places. Singular and plural units are chosen from the value.
     *
     * Returns the complete text shown in the card.
     */
    function formatStatValue(statName, value) {
        if (value === null || value === undefined) return "-";

        if (statName === "processDeviationRate") {
            return `${(value * 100).toFixed(2)}%`;
        }

        const number = Number(value);
        const formattedValue = integerStats.has(statName)
            ? String(number)
            : number.toFixed(2);
        const singularUnit = statUnits.get(statName);
        const unit = Math.abs(number) === 1
            ? singularUnit
            : `${singularUnit}s`;

        return `${formattedValue} ${unit}`;
    }

    /*
     * This function loads all Analyze-page statistics from the API.
     *
     * It first restores the saved card order and then fills each card's value.
     *
     * Returns a Promise that finishes after the cards have been updated.
     */
    async function loadStats() {
        const response = await fetch("/api/analyze-stats");
        const stats = await readAPIResponse(
            response,
            "The statistics request failed."
        );

        applyStatOrder(stats.statOrder);

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

    /*
     * This function saves the current statistic-card order to the API.
     *
     * Saves are placed in a line and sent one after another. This prevents a
     * slower old save from arriving after a newer save and replacing it.
     *
     * Returns a Promise that fails if the server rejects the new order.
     */
    async function saveStatOrder(statOrder) {
        const response = await fetch("/api/analyze-stat-order", {
            method: "PUT",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ statOrder })
        });

        await readAPIResponse(
            response,
            "The statistics order could not be saved."
        );
    }

    let draggedCard = null;
    let dragOffsetX = 0;
    let dragOffsetY = 0;
    let draggedWidth = 0;
    let draggedHeight = 0;
    let dragImage = null;
    let orderBeforeDrag = "";
    let statOrderSave = Promise.resolve();

    /*
     * Browsers do not make ordinary elements draggable automatically, so each
     * statistics card must have its draggable setting turned on.
     */
    for (const statCard of statsCards) {
        statCard.draggable = true;
    }

    /*
     * When dragging starts, remember where the pointer grabbed the card and the
     * card's size. A temporary copy is used as the floating drag image so its
     * rounded corners match the real card.
     */
    analyzeGrid.addEventListener("dragstart", (event) => {
        const statCard = event.target.closest(".analyze-stat");

        if (!statCard) return;

        draggedCard = statCard;
        orderBeforeDrag = JSON.stringify(getStatOrder());

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

    /*
     * While a card is dragged, compare it with the card underneath it. Reorder
     * them after at least 40 percent of the dragged card covers the other card.
     */
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
        /*
         * Requiring 40 percent overlap prevents an accidental swap when the
         * dragged card only touches the other card's edge.
         */
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

    /*
     * When dragging ends, remove the temporary drag appearance. Save the card
     * order only if it is different from the order before dragging began.
     */
    analyzeGrid.addEventListener("dragend", () => {
        const statOrder = getStatOrder();

        dragImage?.remove();
        dragImage = null;
        draggedCard?.classList.remove(
            "analyze-stat--dragging"
        );
        draggedCard = null;

        if (JSON.stringify(statOrder) === orderBeforeDrag) return;

        statOrderSave = statOrderSave
            .then(() => saveStatOrder(statOrder))
            .catch((error) => {
                console.error(error);
            });
    });

    /*
     * A failed statistics request gives every card the same clear fallback.
     */
    loadStats().catch(() => {
        for (const statValue of analyzeGrid.querySelectorAll(
            "[data-stat]"
        )) {
            statValue.textContent = "Unavailable";
        }
    });
}

runAnalyzePage();
