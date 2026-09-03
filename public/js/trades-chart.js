function runTradesChart() {
    const canvas = document.getElementById(
        "trades-candlestick-chart"
    );
    const chartContainer = canvas?.closest(
        ".candlestick-chart-container"
    );
    const controls = document.querySelector(
        "[data-trades-chart-controls]"
    );
    const dateInput = document.querySelector(
        "[data-trades-chart-date]"
    );
    const status = document.querySelector(
        "[data-trades-chart-status]"
    );
    const warning = document.querySelector(
        "[data-trades-chart-warning]"
    );
    const tradeSummaries = document.querySelector(
        "[data-trade-summaries]"
    );
    const tradesSidebar = tradeSummaries?.closest(
        ".trades-summary-sidebar"
    );
    const deleteButton = document.querySelector(
        "[data-delete-trading-day]"
    );
    const pagination = document.querySelector(
        "[data-trade-pagination]"
    );
    const previousTradesButton = document.querySelector(
        "[data-previous-trades]"
    );
    const nextTradesButton = document.querySelector(
        "[data-next-trades]"
    );
    const tradePage = document.querySelector(
        "[data-trade-page]"
    );

    if (
        !canvas ||
        !chartContainer ||
        !controls ||
        !dateInput ||
        !status ||
        !warning ||
        !tradeSummaries ||
        !tradesSidebar ||
        !deleteButton ||
        !pagination ||
        !previousTradesButton ||
        !nextTradesButton ||
        !tradePage
    ) {
        return;
    }

    const chart = new CandlestickChart(canvas);
    let currentTradingDate = "";
    let currentTradePage = 1;
    let currentTradeOffset = 0;
    let currentVisibleTradeCount = 0;
    let currentResponseHasNext = false;
    let tradePageOffsets = [0];
    let selectedTradeID = null;
    let loadedTradingDate = "";
    let tradeChoicesRequestID = 0;
    let tradeFitFrame = null;

    const resizeObserver = new ResizeObserver(() => {
        chart.resize();
        scheduleTradeChoiceFit();
    });

    resizeObserver.observe(chartContainer);
    chart.resize();

    function getTradeOrderMarkers(trade) {
        const buyMarkers =
            trade.orderEvents.buySide.map(
                (orderEvent) => ({
                    ...orderEvent,
                    orderSide: "buy"
                })
            );

        const sellMarkers =
            trade.orderEvents.sellSide.map(
                (orderEvent) => ({
                    ...orderEvent,
                    orderSide: "sell"
                })
            );

        return [
            ...buyMarkers,
            ...sellMarkers
        ];
    }

    function setDataConditionWarning(dataCondition) {
        const dataIsDegraded =
            dataCondition === "degraded";

        warning.hidden = !dataIsDegraded;
        warning.textContent = dataIsDegraded
            ? "Warning: Candlestick data for this trading " +
                "day is marked degraded and may be incomplete."
            : "";
    }

    function createTradeDetail(
        label,
        value,
        valueClassName = ""
    ) {
        const detail = document.createElement("p");
        const detailLabel = document.createElement("strong");
        const detailValue = document.createElement("span");

        detailLabel.textContent = `${label}: `;
        detailValue.textContent = String(value);

        if (valueClassName) {
            detailValue.className = valueClassName;
        }

        detail.append(detailLabel, detailValue);

        return detail;
    }

    function formatDecimal(value) {
        const number = Number(value);
        const normalizedNumber =
            Math.abs(number) < 0.005 ? 0 : number;

        return normalizedNumber.toFixed(2);
    }

    function closeTradeChoices() {
        const openChoices = tradeSummaries.querySelectorAll(
            '[aria-expanded="true"]'
        );

        for (const choice of openChoices) {
            choice.setAttribute("aria-expanded", "false");
            choice.nextElementSibling.hidden = true;
        }
    }

    function updateTradePagination() {
        const renderedTradeCount =
            tradeSummaries.children.length;

        previousTradesButton.disabled =
            currentTradePage <= 1;
        nextTradesButton.disabled =
            !currentResponseHasNext;
        tradePage.textContent = `Page ${currentTradePage}`;
        pagination.hidden =
            renderedTradeCount === 0 &&
            currentTradePage === 1;
    }

    function scheduleTradeChoiceFit() {
        if (tradeFitFrame !== null) {
            cancelAnimationFrame(tradeFitFrame);
        }

        tradeFitFrame = requestAnimationFrame(() => {
            tradeFitFrame = requestAnimationFrame(() => {
                tradeFitFrame = null;
                fitTradeChoices();
            });
        });
    }

    function fitTradeChoices() {
        const summaries = Array.from(
            tradeSummaries.children
        );

        for (const summary of summaries) {
            summary.hidden = false;
            summary.style.maxHeight = "";
            summary.style.overflowY = "";

            const notes = summary.querySelector(
                ".trade-summary-notes"
            );

            if (notes) {
                notes.style.maxHeight = "";
            }
        }

        currentVisibleTradeCount = summaries.length;
        const chartBounds =
            chartContainer.getBoundingClientRect();

        if (window.matchMedia("(min-width: 801px)").matches) {
            tradesSidebar.style.height =
                `${chartBounds.height}px`;
        } else {
            tradesSidebar.style.height = "";
        }

        const selectedChoice = tradeSummaries.querySelector(
            '.trade-summary-choice[aria-expanded="true"]'
        );

        if (!selectedChoice) {
            updateTradePagination();
            return;
        }

        const selectedSummary = selectedChoice.closest(
            ".trade-summary"
        );

        for (const summary of summaries) {
            summary.hidden = summary !== selectedSummary;
        }

        updateTradePagination();
    }

    function renderTradeChoices(trades, offset) {
        tradeSummaries.replaceChildren();

        for (const [index, trade] of trades.entries()) {
            const summary = document.createElement("section");
            const button = document.createElement("button");
            const tradeLabel = document.createElement("span");
            const pointsLabel = document.createElement("span");
            const details = document.createElement("div");
            const detailsID = `trade-details-${trade.id}`;

            button.type = "button";
            button.className =
                "button trade-summary-choice";
            button.setAttribute("aria-expanded", "false");
            button.setAttribute("aria-controls", detailsID);

            tradeLabel.className = "trade-summary-label";
            tradeLabel.textContent =
                `Trade ${offset + index + 1}`;
            pointsLabel.className = "trade-summary-points";
            pointsLabel.textContent =
                `${formatDecimal(trade.pointsPerTrade)} points`;
            button.append(tradeLabel, pointsLabel);

            details.id = detailsID;
            details.className = "trade-summary-details";
            details.hidden = true;
            details.append(
                createTradeDetail(
                    "Side",
                    trade.side.charAt(0).toUpperCase() +
                        trade.side.slice(1)
                ),
                createTradeDetail(
                    "Contracts",
                    trade.contractCount
                ),
                createTradeDetail(
                    "Points per contract",
                    formatDecimal(trade.pointsPerContract)
                ),
                createTradeDetail(
                    "Process deviation",
                    trade.processDeviation ? "Yes" : "No"
                ),
                createTradeDetail(
                    "Notes",
                    trade.notes || "None",
                    "trade-summary-notes"
                )
            );

            button.addEventListener("click", () => {
                const willOpen =
                    button.getAttribute("aria-expanded") ===
                    "false";

                closeTradeChoices();

                if (!willOpen) {
                    selectedTradeID = null;
                    chart.setOrderMarkers([]);
                    scheduleTradeChoiceFit();
                    status.textContent =
                        "Choose a trade to view its chart.";
                    return;
                }

                button.setAttribute("aria-expanded", "true");
                details.hidden = false;
                selectedTradeID = String(trade.id);
                scheduleTradeChoiceFit();
                loadChart(trade);
            });

            summary.className = "trade-summary";
            summary.append(button, details);
            tradeSummaries.append(summary);
        }
    }

    async function loadTradeChoices(
        tradingDate = "",
        page = 1,
        offset = 0
    ) {
        const searchParameters = new URLSearchParams();

        if (tradingDate) {
            searchParameters.set("date", tradingDate);
        }

        searchParameters.set("page", page);
        searchParameters.set("offset", offset);

        const query = searchParameters.toString();
        const requestURL =
            `/api/trades${query ? `?${query}` : ""}`;
        const requestID = ++tradeChoicesRequestID;

        status.textContent = "Loading trades...";
        selectedTradeID = null;
        closeTradeChoices();
        chart.setOrderMarkers([]);
        tradeSummaries.replaceChildren();
        pagination.hidden = true;
        deleteButton.hidden = true;

        if (loadedTradingDate !== tradingDate) {
            chart.setCandlesticks([]);
            loadedTradingDate = "";
            setDataConditionWarning(null);
        }

        try {
            const response = await fetch(requestURL);
            const responseData = await response.json();

            if (requestID !== tradeChoicesRequestID) {
                return;
            }

            if (!response.ok) {
                throw new Error(
                    responseData.error ||
                    "The trades request failed."
                );
            }
            renderTradeChoices(
                responseData.trades,
                responseData.offset
            );

            if (responseData.tradingDate) {
                dateInput.value = responseData.tradingDate;
            }

            currentTradingDate =
                responseData.tradingDate || "";
            currentTradePage = responseData.page;
            currentTradeOffset = responseData.offset;
            currentResponseHasNext =
                responseData.hasNext;
            currentVisibleTradeCount =
                responseData.trades.length;
            updateTradePagination();

            status.textContent = responseData.trades.length
                ? "Choose a trade to view its chart."
                : "No submitted trades were found.";

            const latestTrade = responseData.trades[0];

            if (latestTrade) {
                tradeSummaries
                    .querySelector(".trade-summary-choice")
                    .click();
            }
        } catch (error) {
            if (requestID !== tradeChoicesRequestID) {
                return;
            }

            status.textContent = error.message;
        }
    }

    async function loadChart(trade) {
        const tradingDate = trade.tradingDate;

        if (loadedTradingDate === tradingDate) {
            chart.setOrderMarkers(
                getTradeOrderMarkers(trade)
            );
            deleteButton.hidden = false;
            status.textContent =
                `Loaded selected ${trade.side} trade.`;
            return;
        }

        const searchParameters = new URLSearchParams();

        if (tradingDate) {
            searchParameters.set("date", tradingDate);
        }

        const query = searchParameters.toString();
        const requestURL =
            `/api/trades-chart${query ? `?${query}` : ""}`;

        status.textContent = "Loading chart...";
        deleteButton.hidden = true;

        try {
            const response = await fetch(requestURL);
            const responseIsJSON =
                response.headers
                    .get("content-type")
                    ?.includes("application/json");
            const responseData = responseIsJSON
                ? await response.json()
                : {};

            if (!response.ok) {
                throw new Error(
                    responseData.error ||
                    "The chart request failed."
                );
            }

            if (selectedTradeID !== String(trade.id)) {
                return;
            }

            setDataConditionWarning(
                responseData.dataCondition
            );
            chart.setCandlesticks(
                responseData.candlesticks
            );

            if (responseData.candlesticks.length === 0) {
                chart.setOrderMarkers([]);
                loadedTradingDate = "";
                deleteButton.hidden =
                    !responseData.hasTrades;
                status.textContent =
                    "Candlestick data is currently unavailable " +
                    "for this trading day.";
                return;
            }

            loadedTradingDate = tradingDate;
            chart.setOrderMarkers(
                getTradeOrderMarkers(trade)
            );

            if (responseData.tradingDate) {
                dateInput.value = responseData.tradingDate;
            }

            deleteButton.hidden = !responseData.hasTrades;

            status.textContent = responseData.hasTrades
                ? `Loaded selected ${trade.side} trade.`
                : "No submitted trades were found.";
        } catch (error) {
            if (selectedTradeID !== String(trade.id)) {
                return;
            }

            chart.setCandlesticks([]);
            chart.setOrderMarkers([]);
            loadedTradingDate = "";
            setDataConditionWarning(null);
            status.textContent = error.message;
        }
    }

    controls.addEventListener("submit", (event) => {
        event.preventDefault();

        dateInput.value = dateInput.value.trim();

        if (!controls.reportValidity()) return;

        tradePageOffsets = [0];
        loadTradeChoices(dateInput.value, 1, 0);
    });

    previousTradesButton.addEventListener("click", () => {
        if (currentTradePage <= 1) return;

        loadTradeChoices(
            currentTradingDate,
            currentTradePage - 1,
            tradePageOffsets[currentTradePage - 2]
        );
    });

    nextTradesButton.addEventListener("click", () => {
        const nextOffset =
            currentTradeOffset +
            currentVisibleTradeCount;

        tradePageOffsets[currentTradePage] = nextOffset;
        tradePageOffsets.length = currentTradePage + 1;
        loadTradeChoices(
            currentTradingDate,
            currentTradePage + 1,
            nextOffset
        );
    });

    deleteButton.addEventListener("click", async () => {
        if (!loadedTradingDate) return;

        const tradingDate = loadedTradingDate;
        const shouldDelete = window.confirm(
            `Delete every saved trade for ${tradingDate}? ` +
            "This cannot be undone."
        );

        if (!shouldDelete) return;

        deleteButton.disabled = true;
        status.textContent = "Deleting trading day...";

        try {
            const searchParameters = new URLSearchParams({
                date: tradingDate
            });
            const response = await fetch(
                `/api/trades?${searchParameters.toString()}`,
                { method: "DELETE" }
            );
            const responseIsJSON =
                response.headers
                    .get("content-type")
                    ?.includes("application/json");
            const responseData = responseIsJSON
                ? await response.json()
                : {};

            if (!response.ok) {
                throw new Error(
                    responseData.error ||
                    "The trading day could not be deleted."
                );
            }

            tradeChoicesRequestID += 1;
            currentTradingDate = "";
            currentTradePage = 1;
            currentTradeOffset = 0;
            currentVisibleTradeCount = 0;
            currentResponseHasNext = false;
            tradePageOffsets = [0];
            selectedTradeID = null;
            loadedTradingDate = "";
            tradeSummaries.replaceChildren();
            pagination.hidden = true;
            chart.setCandlesticks([]);
            chart.setOrderMarkers([]);
            setDataConditionWarning(null);
            deleteButton.hidden = true;
            status.textContent =
                `Deleted the submitted trading day for ${tradingDate}.`;
        } catch (error) {
            status.textContent = error.message;
        } finally {
            deleteButton.disabled = false;
        }
    });

    loadTradeChoices();
}

runTradesChart();
