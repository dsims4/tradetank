/*
 * This function initializes the interactive Input page.
 *
 * It connects the candlestick chart, unsaved trades, date selector, buttons,
 * notes, and final save request. Unsaved trades stay only in browser memory
 * until Save Chart succeeds. If required Input-page elements are missing, this
 * function stops without changing the page.
 *
 * This function does not return a value.
 */
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

    /*
     * This function clears the currently selected Buy, Sell, or Close action.
     *
     * It also marks every action button unpressed. Screen readers use this state
     * to tell the user that no action is selected.
     *
     * This function does not return a value.
     */
    function clearSelectedTradeAction() {
        selectedTradeAction = null;

        tradeActionButtons.forEach((button) => {
            button.setAttribute("aria-pressed", "false");
        });
    }

    /*
     * This function enables or disables buttons based on the unsaved trades.
     *
     * Close is available only while a position is open. Undo and Reset are
     * available only after at least one unsaved order has been placed.
     *
     * This function does not return a value.
     */
    function updateTradeActionAvailability() {
        closeTradeButton.disabled =
            !tradeDraft.hasActiveTrade();

        const canUndo = tradeDraft.canUndo();

        undoOrderButton.disabled = !canUndo;
        resetOrdersButton.disabled = !canUndo;
    }

    /*
     * This function clears the notes and process-deviation inputs.
     *
     * This function does not return a value.
     */
    function resetTradeDetails() {
        tradeNotesInput.value = "";
        processDeviationInput.checked = false;
    }

    /*
     * This function puts the open trade's notes and process-deviation choice
     * back into the form after Undo changes the active trade.
     *
     * If no trade is active, it clears the detail inputs instead.
     *
     * This function does not return a value.
     */
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

    /*
     * This function creates an editable notes box for each completed unsaved trade.
     *
     * Typing in a generated box updates the matching trade stored in browser
     * memory. The completed-notes section stays hidden when there are none.
     *
     * This function does not return a value.
     */
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

    /*
     * This function removes every unsaved trade, chart marker, note, and selected
     * action from the Input page.
     *
     * A successful save can additionally reset the contract count to one.
     *
     * This function does not return a value.
     */
    function resetTradeDraft(resetContractCount = false) {
        tradeDraft.clear();
        chart.setOrderMarkers([]);
        renderCompletedTradeNotes();
        resetTradeDetails();
        clearSelectedTradeAction();
        updateTradeActionAvailability();

        if (resetContractCount) {
            contractCountInput.value = "1";
        }
    }

    /*
     * Each action button selects the order action that the next valid chart
     * click will record.
     */
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

    /*
     * A chart click checks the selected action, candle, price, and contract count
     * before adding an unsaved order to browser memory.
     */
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

        /*
         * Close automatically uses the opposite action and the exact number of
         * contracts still open. For example, closing a long three-contract
         * position creates Sell 3. Buy and Sell use the number entered by the user.
         */
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
            /*
             * Notes and process deviation belong to a complete trade, not to one
             * order. Save the fields on the already open trade before recording
             * this order. If this is the first order of a new trade, attach the
             * same fields immediately after creating that trade.
             */
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

    /*
     * This function asks the API for candles on a selected trading date.
     *
     * An empty date asks for the newest trading day with complete data. A
     * successful response updates the remembered date, chart, Save permission,
     * and message. A failed response removes any old candles from the chart.
     *
     * Returns a Promise that finishes after the response succeeds or fails.
     */
    async function loadChart(tradingDate = "") {
        resetTradeDraft();
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
            const responseData = await readAPIResponse(
                response,
                "The chart request failed."
            );

            if (responseData.tradingDate) {
                dateInput.value = responseData.tradingDate;
                window.sessionStorage.setItem(
                    "tradetank-input-chart-date",
                    responseData.tradingDate
                );
            }

            chart.setCandlesticks(
                responseData.candlesticks
            );

            tradeFieldset.disabled = !responseData.canSubmit;

            if (responseData.alreadySubmitted) {
                status.textContent =
                    "This chart has already been submitted.";
            } else {
                status.textContent =
                    `Loaded ${responseData.candlesticks.length} ` +
                    `five-minute candlesticks.`;
            }
        } catch (error) {
            chart.setCandlesticks([]);
            status.textContent = error.message;
        }
    }

    /*
     * Submitting the date form loads the requested New York trading date with
     * JavaScript instead of letting the browser leave or reload the page.
     */
    controls.addEventListener("submit", (event) => {
        event.preventDefault();

        dateInput.value = dateInput.value.trim();

        if (!controls.reportValidity()) return;

        loadChart(dateInput.value);
    });

    /*
     * Undo removes the newest order and restores the trades, chart markers, form
     * fields, buttons, and message to their earlier state.
     */
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

    /*
     * Reset discards the entire unsaved draft only after user confirmation.
     */
    resetOrdersButton.addEventListener("click", () => {
        const shouldReset = window.confirm(
            "Do you want to discard all unsaved trades for this chart?"
        );

        if (!shouldReset) return;

        resetTradeDraft();

        status.textContent =
            "All unsaved trades were discarded.";
    });

    /*
     * Save Chart checks the completed unsaved trades and sends them to the server
     * as JSON. JSON is the text format used to carry the trade objects. Browser
     * memory is cleared only after the server confirms the save.
     */
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

            const responseData = await readAPIResponse(
                response,
                "The chart could not be saved."
            );

            resetTradeDraft(true);

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

    /*
     * Remember the most recently viewed date only for this browser tab. Closing
     * the tab removes this sessionStorage value.
     * An empty value lets the server choose the latest available session.
     */
    const rememberedTradingDate =
        window.sessionStorage.getItem(
            "tradetank-input-chart-date"
        ) || "";

    loadChart(rememberedTradingDate);
}

runCandlestickChart();
