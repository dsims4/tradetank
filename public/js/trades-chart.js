/*
 * This function initializes the read-only Trades page.
 *
 * It loads saved trades in groups of five and creates their summary boxes.
 * Candles are requested only after the user selects a trade. If required page
 * elements are missing, this function stops without changing the page.
 *
 * This function does not return a value.
 */
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
    const marketDataAccess = document.querySelector(
        "[data-market-data-access]"
    ) !== null;

    if (
        !canvas ||
        !chartContainer ||
        !controls ||
        !dateInput ||
        !status ||
        !warning ||
        !tradeSummaries ||
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
    let currentResponseHasNext = false;
    let selectedTradeID = null;
    let loadedTradingDate = "";
    let tradeChoicesRequestID = 0;

    const resizeObserver = new ResizeObserver(() => chart.resize());

    resizeObserver.observe(chartContainer);
    chart.resize();

    /*
     * This function combines a saved trade's buy orders and sell orders into
     * the single marker list expected by the candlestick chart.
     *
     * Returns a new marker array in which every item clearly says "buy" or
     * "sell." It does not change the saved trade object.
     */
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

    /*
     * This function shows a warning when Databento marked the day's candle data
     * degraded, meaning it may be incomplete or less reliable.
     *
     * It hides and clears the warning for all other data conditions.
     *
     * This function does not return a value.
     */
    function setDataConditionWarning(dataCondition) {
        const dataIsDegraded =
            dataCondition === "degraded";

        warning.hidden = !dataIsDegraded;
        warning.textContent = dataIsDegraded
            ? "Warning: Candlestick data for this trading " +
                "day is marked degraded and may be incomplete."
            : "";
    }

    /*
     * This function creates one label-and-value row inside an expanded trade box.
     *
     * Returns the completed HTML paragraph. An optional CSS class may be added
     * to the value, for example to make long notes scroll inside a fixed area.
     */
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

    /*
     * This function formats a numeric trade value with two decimal places.
     *
     * Values very close to zero are changed to zero so the page never displays
     * the confusing value -0.00. Returns the number as text.
     */
    function formatDecimal(value) {
        const number = Number(value);
        const normalizedNumber =
            Math.abs(number) < 0.005 ? 0 : number;

        return normalizedNumber.toFixed(2);
    }

    /*
     * This function collapses every currently expanded trade summary.
     *
     * It hides the details and updates aria-expanded, which tells screen readers
     * whether each box is open or closed.
     *
     * This function does not return a value.
     */
    function closeTradeChoices() {
        const openChoices = tradeSummaries.querySelectorAll(
            '[aria-expanded="true"]'
        );

        for (const choice of openChoices) {
            choice.setAttribute("aria-expanded", "false");
            choice.nextElementSibling.hidden = true;
            choice.closest(".trade-summary").classList.remove(
                "trade-summary--expanded"
            );
        }
    }

    /*
     * This function updates the Previous button, Next button, and page number.
     *
     * It disables navigation that cannot succeed and hides pagination when
     * the first page contains no trades.
     *
     * This function does not return a value.
     */
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

    /*
     * This function controls which trade summary boxes remain visible.
     *
     * Passing one summary hides the other summaries so the selected trade can
     * use the full panel. Passing null shows every summary again.
     *
     * This function does not return a value.
     */
    function showOnlyTrade(selectedSummary = null) {
        for (const summary of tradeSummaries.children) {
            summary.hidden = Boolean(
                selectedSummary && summary !== selectedSummary
            );
        }
    }

    /*
     * This function renders one page of saved trade choices.
     *
     * Each choice shows a short summary and details that can expand. Selecting
     * one hides the other choices and shows that trade's orders on the chart.
     *
     * This function does not return a value.
     */
    function renderTradeChoices(trades, page) {
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
                `Trade ${(page - 1) * 5 + index + 1}`;
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

            /*
             * Selecting a collapsed summary expands it. Selecting the open
             * summary again collapses it and clears its chart markers.
             */
            button.addEventListener("click", () => {
                const willOpen =
                    button.getAttribute("aria-expanded") ===
                    "false";

                closeTradeChoices();

                if (!willOpen) {
                    selectedTradeID = null;
                    chart.setOrderMarkers([]);
                    showOnlyTrade();
                    status.textContent =
                        "Choose a trade to view its chart.";
                    return;
                }

                button.setAttribute("aria-expanded", "true");
                details.hidden = false;
                summary.classList.add(
                    "trade-summary--expanded"
                );
                selectedTradeID = String(trade.id);
                showOnlyTrade(summary);
                loadChart(trade);
            });

            summary.className = "trade-summary";
            summary.append(button, details);
            tradeSummaries.append(summary);
        }
    }

    /*
     * This function loads one page of trades for one trading date.
     *
     * Trades are split into pages of five. Every request receives a number one
     * larger than the last. If an older request finishes late, its smaller
     * number reveals that it is outdated, so its result is ignored.
     *
     * Returns a Promise that finishes after loading succeeds or fails.
     */
    async function loadTradeChoices(
        tradingDate = "",
        page = 1
    ) {
        const searchParameters = new URLSearchParams();

        if (tradingDate) {
            searchParameters.set("date", tradingDate);
        }

        searchParameters.set("page", page);

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
            const responseData = await readAPIResponse(
                response,
                "The trades request failed."
            );

            /*
             * Ignore this response when the user made a newer request before
             * this one finished.
             */
            if (requestID !== tradeChoicesRequestID) {
                return;
            }

            renderTradeChoices(
                responseData.trades,
                responseData.page
            );

            if (responseData.tradingDate) {
                dateInput.value = responseData.tradingDate;
            }

            currentTradingDate =
                responseData.tradingDate || "";
            currentTradePage = responseData.page;
            currentResponseHasNext =
                responseData.hasNext;
            updateTradePagination();

            if (responseData.trades.length === 0) {
                status.textContent =
                    "No submitted trades were found.";
            } else {
                status.textContent = marketDataAccess
                    ? "Choose a trade to view its chart."
                    : "Choose a trade to inspect its saved details.";
            }
        } catch (error) {
            if (requestID !== tradeChoicesRequestID) {
                return;
            }

            status.textContent = error.message;
        }
    }

    /*
     * This function loads candlesticks for a selected saved trade.
     *
     * When candles for this date are already on screen, only the order markers
     * change. Otherwise, it asks the API for candles. If the user selects another
     * trade while waiting, the old result is ignored.
     *
     * Returns a Promise that finishes after loading succeeds or fails.
     */
    async function loadChart(trade) {
        const tradingDate = trade.tradingDate;

        /*
         * Restricted accounts may inspect or delete their saved trade records,
         * but the browser must not request the underlying market candles.
         */
        if (!marketDataAccess) {
            loadedTradingDate = tradingDate;
            chart.setCandlesticks([]);
            chart.setOrderMarkers([]);
            setDataConditionWarning(null);
            deleteButton.hidden = false;
            status.textContent =
                "The trade is selected, but its market-data " +
                "chart is unavailable.";
            return;
        }

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
            const responseData = await readAPIResponse(
                response,
                "The chart request failed."
            );

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

    /*
     * Submitting the date selector returns to the first page for that date.
     */
    controls.addEventListener("submit", (event) => {
        event.preventDefault();

        dateInput.value = dateInput.value.trim();

        if (!controls.reportValidity()) return;

        loadTradeChoices(dateInput.value, 1);
    });

    /*
     * The Previous button requests the preceding page when one exists.
     */
    previousTradesButton.addEventListener("click", () => {
        if (currentTradePage <= 1) return;

        loadTradeChoices(
            currentTradingDate,
            currentTradePage - 1
        );
    });

    /*
     * The Next button requests the following five trades. Another function
     * disables this button when the API says no following page exists.
     */
    nextTradesButton.addEventListener("click", () => {
        loadTradeChoices(
            currentTradingDate,
            currentTradePage + 1
        );
    });

    /*
     * Delete Day removes every saved trade for the loaded date after the user
     * confirms. The visible chart and summaries are cleared only after the
     * server confirms that deletion succeeded.
     */
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
            await readAPIResponse(
                response,
                "The trading day could not be deleted."
            );

            tradeChoicesRequestID += 1;
            currentTradingDate = "";
            currentTradePage = 1;
            currentResponseHasNext = false;
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
