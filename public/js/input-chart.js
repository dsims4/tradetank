function runCandlestickChart() {
    const canvas = document.getElementById("candlestick-chart");
    const chartContainer = canvas?.closest(
        ".candlestick-chart-container"
    );
    const controls = document.querySelector("[data-input-chart-controls]");
    const dateInput = document.querySelector("[data-input-chart-date]");
    const status = document.querySelector("[data-input-chart-status]");
    const tradeFieldset = document.querySelector(
        "[data-input-trade-fieldset]"
    );
    const tradeActionButtons = document.querySelectorAll(
        "[data-trade-action]"
    );
    const closeTradeButton = document.querySelector(
        '[data-trade-action="close"]'
    );
    const contractCountInput = document.querySelector(
        "[data-contract-count]"
    );
    const tradeNotesInput = document.querySelector(
        "[data-trade-notes]"
    );
    const processDeviationInput = document.querySelector(
        "[data-process-deviation]"
    );
    const tradeForm = document.querySelector(
        "[data-input-trade-form]"
    );
    const undoOrderButton = document.querySelector(
        "[data-undo-order]"
    );
    const resetOrdersButton = document.querySelector(
        "[data-reset-orders]"
    );
    const completedTradeNotesSection = document.querySelector(
        "[data-completed-trade-notes-section]"
    );
    const completedTradeNotes = document.querySelector(
        "[data-completed-trade-notes]"
    );

    if (
        !canvas ||
        !chartContainer ||
        !controls ||
        !dateInput ||
        !status ||
        !tradeFieldset ||
        !closeTradeButton ||
        !contractCountInput ||
        !tradeNotesInput ||
        !processDeviationInput ||
        !tradeForm ||
        !undoOrderButton ||
        !resetOrdersButton ||
        !completedTradeNotesSection ||
        !completedTradeNotes
    ) {
        return;
    }

    if (window.location.search) {
        window.history.replaceState(
            {},
            document.title,
            `${window.location.pathname}${window.location.hash}`
        );
    }

    const chart = new CandlestickChart(canvas);
    const tradeDraft = new TradeDraft();

    let selectedTradeAction = null;

    function clearSelectedTradeAction() {
        selectedTradeAction = null;

        tradeActionButtons.forEach((button) => {
            button.setAttribute("aria-pressed", "false");
        });
    }

    function updateTradeActionAvailability() {
        closeTradeButton.disabled =
            !tradeDraft.hasActiveTrade();

        const canUndo = tradeDraft.canUndo();

        undoOrderButton.disabled = !canUndo;
        resetOrdersButton.disabled = !canUndo;
    }

    function resetTradeDetails() {
        tradeNotesInput.value = "";
        processDeviationInput.checked = false;
    }

    function restoreActiveTradeDetails() {
        const details = tradeDraft.getActiveTradeDetails();

        if (!details) {
            resetTradeDetails();
            return;
        }

        tradeNotesInput.value = details.notes;
        processDeviationInput.checked =
            details.processDeviation;
    }

    function renderCompletedTradeNotes() {
        const trades =
            tradeDraft.getCompletedTradesForDisplay();

        completedTradeNotes.replaceChildren();
        completedTradeNotesSection.hidden = trades.length === 0;

        trades.forEach((trade, index) => {
            const label = document.createElement("label");
            const textarea = document.createElement("textarea");

            label.textContent = `Trade ${index + 1} notes`;
            textarea.className = "form-input";
            textarea.maxLength = 1500;
            textarea.value = trade.notes;
            textarea.addEventListener("input", () => {
                try {
                    tradeDraft.updateCompletedTradeNotes(
                        index,
                        textarea.value
                    );
                } catch (error) {
                    status.textContent = error.message;
                }
            });

            label.append(textarea);
            completedTradeNotes.append(label);
        });
    }

    tradeActionButtons.forEach((button) => {
        button.addEventListener("click", () => {
            selectedTradeAction = button.dataset.tradeAction;

            tradeActionButtons.forEach((actionButton) => {
                actionButton.setAttribute(
                    "aria-pressed",
                    String(actionButton === button)
                );
            });

            status.textContent =
                `${button.textContent.trim()} selected. ` +
                "Click the chart to place the order.";
        });
    });

    canvas.addEventListener("click", () => {
        if (!selectedTradeAction) {
            status.textContent =
                "Select Buy, Sell, or Close first.";
            return;
        }

        const chartSelection =
            chart.getCrosshairSelection();

        if (!chartSelection) {
            status.textContent =
                "Click inside the chart area.";
            return;
        }

        if (!chartSelection.isWithinCandleRange) {
            status.textContent =
                "Choose a price within that candle's range.";
            return;
        }

        let orderSide = selectedTradeAction;
        let contractCount = contractCountInput.valueAsNumber;

        if (selectedTradeAction === "close") {
            const netContractCount =
                tradeDraft.getNetContractCount();

            if (netContractCount === 0) {
                status.textContent =
                    "There is no open position to close.";
                return;
            }

            orderSide =
                netContractCount > 0
                ? "sell"
                : "buy";
            contractCount =
                Math.abs(netContractCount);
        } else if (
            !contractCountInput.reportValidity() ||
            !Number.isSafeInteger(contractCount) ||
            contractCount <= 0
        ) {
            status.textContent =
                "Enter a valid contract count.";
            return;
        }

        const notes = tradeNotesInput.value;
        const processDeviation =
            processDeviationInput.checked;
        const hadActiveTrade =
            tradeDraft.hasActiveTrade();
        const completedTradeCountBefore =
            tradeDraft.getCompletedTradeCount();

        try {
            if (hadActiveTrade) {
                tradeDraft.updateActiveTradeDetails(
                    notes,
                    processDeviation
                );
            }

            tradeDraft.recordOrderEvent(
                orderSide,
                {
                    time: chartSelection.time,
                    price: chartSelection.price,
                    contractCount
                }
            );

            chart.setOrderMarkers(
                tradeDraft.getOrderEventsForDisplay()
            );
            renderCompletedTradeNotes();

            if (
                !hadActiveTrade &&
                tradeDraft.hasActiveTrade()
            ) {
                tradeDraft.updateActiveTradeDetails(
                    notes,
                    processDeviation
                );
            }

            const completedTrade =
                tradeDraft.getCompletedTradeCount() >
                completedTradeCountBefore;

            if (completedTrade) resetTradeDetails();

            const netContractCount =
                tradeDraft.getNetContractCount();

            clearSelectedTradeAction();
            updateTradeActionAvailability();

            if (netContractCount > 0) {
                status.textContent =
                    `Open position: long ${netContractCount}.`;
            } else if (netContractCount < 0) {
                status.textContent =
                    `Open position: short ${Math.abs(netContractCount)}.`;
            } else {
                status.textContent =
                    "Trade completed.";
            }
        } catch (error) {
            status.textContent = error.message;
        }
    });

    const resizeObserver = new ResizeObserver(() => chart.resize());
    resizeObserver.observe(chartContainer);
    chart.resize();

    async function loadChart(tradingDate = "") {
        tradeDraft.clear();
        renderCompletedTradeNotes();
        resetTradeDetails();
        clearSelectedTradeAction();
        updateTradeActionAvailability();
        tradeFieldset.disabled = true;

        const searchParameters =
            new URLSearchParams();

        if (tradingDate) {
            searchParameters.set("date", tradingDate);
        }

        const query = searchParameters.toString();
        const requestURL = `/api/input-chart${query ? `?${query}` : ""}`;

        status.textContent = "Loading chart...";

        try {
            const response = await fetch(requestURL);
            const responseData = await response.json();

            if (!response.ok) {
                throw new Error(
                    responseData.error ||
                    "The chart request failed."
                );
            }

            if (responseData.tradingDate) {
                dateInput.value = responseData.tradingDate;
                window.sessionStorage.setItem(
                    "tradetankInputChartDate",
                    responseData.tradingDate
                );
            }

            chart.setCandlesticks(
                responseData.candlesticks
            );

            tradeFieldset.disabled = !responseData.canSubmit;

            status.textContent =
                `Loaded ${responseData.candlesticks.length} ` +
                `five-minute candlesticks.`;
        } catch (error) {
            chart.setCandlesticks([]);
            status.textContent = error.message;
        }
    }

    controls.addEventListener("submit", (event) => {
        event.preventDefault();

        dateInput.value = dateInput.value.trim();

        if (!controls.reportValidity()) return;

        loadChart(dateInput.value);
    });

    undoOrderButton.addEventListener("click", () => {
        if (!tradeDraft.undoLastOrderEvent()) return;

        chart.setOrderMarkers(
            tradeDraft.getOrderEventsForDisplay()
        );
        renderCompletedTradeNotes();

        restoreActiveTradeDetails();
        clearSelectedTradeAction();
        updateTradeActionAvailability();

        const netContractCount =
            tradeDraft.getNetContractCount();

        if (netContractCount > 0) {
            status.textContent =
                `The undo is complete. Open position: ` +
                `long ${netContractCount} contracts.`;
        } else if (netContractCount < 0) {
            status.textContent =
                `The undo is complete. Open position: ` +
                `short ${Math.abs(netContractCount)} contract.`;
        } else {
            status.textContent =
                "The undo is complete. No position is open.";
        }
    });

    resetOrdersButton.addEventListener("click", () => {
        const shouldReset = window.confirm(
            "Do you want to discard all unsaved trades for this chart?"
        );

        if (!shouldReset) return;

        tradeDraft.clear();
        chart.setOrderMarkers([]);
        renderCompletedTradeNotes();
        resetTradeDetails();
        clearSelectedTradeAction();
        updateTradeActionAvailability();

        status.textContent =
            "All unsaved trades were discarded.";
    });

    tradeForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        let trades;

        try {
            trades =
                tradeDraft.getTradesForSubmission();
        } catch (error) {
            status.textContent = error.message;
            return;
        }

        tradeFieldset.disabled = true;
        status.textContent = "The chart is saving.";

        try {
            const response = await fetch(
                "/api/input-chart",
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({
                        tradingDate: dateInput.value,
                        trades
                    })
                }
            );

            const responseIsJSON =
                response.headers
                    .get("content-type")
                    ?.includes("application/json");

            const responseData =
                responseIsJSON
                ? await response.json()
                : {};

            if (!response.ok) {
                throw new Error(
                    responseData.error ||
                    "The chart could not be saved."
                );
            }

            tradeDraft.clear();
            resetTradeDetails();
            clearSelectedTradeAction();
            updateTradeActionAvailability();

            status.textContent =
                `${responseData.savedTradeCount} ` +
                `trade${responseData.savedTradeCount === 1 ? "" : "s"} ` +
                `${responseData.savedTradeCount === 1 ? "was" : "were"} saved.`;
        } catch (error) {
            tradeFieldset.disabled = false;
            updateTradeActionAvailability();
            status.textContent = error.message;
        }
    });

    const rememberedTradingDate =
        window.sessionStorage.getItem(
            "tradetankInputChartDate"
        ) || "";

    loadChart(rememberedTradingDate);
}

runCandlestickChart();
