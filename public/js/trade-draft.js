/** Holds and checks unsaved trades in the browser until a trading day is saved. */
const TRADE_NOTES_MAXIMUM_LENGTH = 1500;

/*
 * This function checks whether an order action is one the trade draft understands.
 *
 * Returns true for "buy" or "sell." Returns false for every other value.
 */
function isValidOrderSide(orderSide) {
    return orderSide === "buy" || orderSide === "sell";
}

/*
 * This function checks one unsaved order before it can change the open position.
 *
 * The order needs a real time, an ES price in a 0.25-point increment, and a
 * positive whole number of contracts.
 *
 * Returns true when every field is valid. Returns false otherwise.
 */
function isValidOrderEvent(orderEvent) {
    return (
        orderEvent &&
        typeof orderEvent === "object" &&
        typeof orderEvent.time === "string" &&
        !Number.isNaN(Date.parse(orderEvent.time)) &&
        Number.isFinite(orderEvent.price) &&
        orderEvent.price > 0 &&
        Number.isInteger(orderEvent.price * 4) &&
        Number.isSafeInteger(orderEvent.contractCount) &&
        orderEvent.contractCount > 0
    );
}

/*
 * This function finds the property where an order should be stored.
 *
 * Returns "buySide" for a buy and "sellSide" for a sell.
 */
function getOrderEventCollectionName(orderSide) {
    return orderSide === "buy" ? "buySide" : "sellSide";
}

/*
 * This function adds all or part of an order to one side of a trade.
 *
 * Part of an oversized order may close the current trade while the remaining
 * contracts open a reversed trade. The selected contract count lets the same
 * original order be divided between those two trades.
 *
 * It changes the supplied trade object and does not return a value.
 */
function addOrderEvent(trade, orderSide, orderEvent, contractCount) {
    const collectionName = getOrderEventCollectionName(orderSide);

    trade.orderEvents[collectionName].push({
        time: orderEvent.time,
        price: orderEvent.price,
        contractCount
    });
}

/*
 * This function adds the contract counts from an array of orders.
 *
 * Returns the total number of contracts in those orders.
 */
function getContractCount(orderEvents) {
    return orderEvents.reduce(
        (total, orderEvent) => total + orderEvent.contractCount,
        0
    );
}

/*
 * This function copies orders and labels each copy as a buy or sell for the chart.
 *
 * Returns a new chart-marker array without changing the saved draft orders.
 */
function getOrderMarkers(orderEvents, orderSide) {
    return orderEvents.map((orderEvent) => ({
        ...orderEvent,
        orderSide
    }));
}

class TradeDraft {
    /*
     * This constructor creates a new empty trading-day draft.
     * It begins with no completed trades, open position, or Undo history.
     *
     * Returns the new TradeDraft instance.
     */
    constructor() {
        this.trades = [];
        this.activeTrade = null;
        this.history = [];
    }

    /*
     * This method removes every completed trade, open position, and saved Undo state.
     *
     * It changes the draft and does not return a value.
     */
    clear() {
        this.trades = [];
        this.activeTrade = null;
        this.history = [];
    }

    /*
     * This method checks whether an unsaved trade still has contracts open.
     *
     * Returns true while a trade is open. Returns false otherwise.
     */
    hasActiveTrade() {
        return this.activeTrade !== null;
    }

    /*
     * This method opens a new long or short trade from its first valid order.
     * A buy opens a long trade and a sell opens a short trade.
     *
     * It does not return a value.
     * It throws an error when another trade is open or the order is invalid.
     */
    startTrade(orderSide, orderEvent) {
        if (this.hasActiveTrade()) {
            throw new Error("A trade is already active.");
        }

        if (!isValidOrderSide(orderSide)) {
            throw new TypeError("The order side must be buy or sell.");
        }

        if (!isValidOrderEvent(orderEvent)) {
            throw new TypeError("A valid order event is required.");
        }

        this.activeTrade = {
            side: orderSide === "buy" ? "long" : "short",
            orderEvents: {
                buySide: [],
                sellSide: []
            },
            processDeviation: false,
            notes: ""
        };

        addOrderEvent(
            this.activeTrade,
            orderSide,
            orderEvent,
            orderEvent.contractCount
        );
    }

    /*
     * This method calculates the open position by subtracting contracts sold
     * from contracts bought.
     *
     * A positive result is long, a negative result is short, and zero is closed.
     *
     * Returns the positive or negative number of open contracts.
     * Returns zero when there is no open trade.
     */
    getNetContractCount() {
        if (!this.hasActiveTrade()) return 0;

        const buyCount = getContractCount(
            this.activeTrade.orderEvents.buySide
        );
        const sellCount = getContractCount(
            this.activeTrade.orderEvents.sellSide
        );

        return buyCount - sellCount;
    }

    /*
     * This method moves a trade with zero open contracts into the completed list.
     *
     * It does not return a value.
     * It throws an error when no trade exists or contracts remain open.
     */
    completeActiveTrade() {
        if (!this.hasActiveTrade()) {
            throw new Error("There is no active trade to complete.");
        }

        if (this.getNetContractCount() !== 0) {
            throw new Error("An open position cannot be completed.");
        }

        this.trades.push(this.activeTrade);
        this.activeTrade = null;
    }

    /*
     * This method handles an opposite-side order larger than the open position.
     *
     * The amount equal to the open position closes the current trade. The excess
     * opens a new trade in the opposite direction. Both parts keep the original
     * time and price but use their own contract counts.
     *
     * It changes the draft and does not return a value.
     */
    startReversal(
        orderSide,
        orderEvent,
        closingContractCount,
        openingContractCount
    ) {
        addOrderEvent(
            this.activeTrade,
            orderSide,
            orderEvent,
            closingContractCount
        );

        this.completeActiveTrade();

        this.startTrade(orderSide, {
            time: orderEvent.time,
            price: orderEvent.price,
            contractCount: openingContractCount
        });
    }

    /*
     * This method applies one buy or sell as an opening order, scale-in, scale-out,
     * full close, or reversal.
     *
     * Before changing anything, it saves a complete copy of the current draft.
     * Undo can restore that exact earlier copy.
     *
     * It changes the draft and does not return a value.
     * It throws a TypeError when the order is invalid.
     */
    recordOrderEvent(orderSide, orderEvent) {
        if (!isValidOrderSide(orderSide)) {
            throw new TypeError("The order side must be buy or sell.");
        }

        if (!isValidOrderEvent(orderEvent)) {
            throw new TypeError("A valid order event is required.");
        }

        this.history.push({
            trades: structuredClone(this.trades),
            activeTrade: structuredClone(this.activeTrade)
        });

        if (!this.hasActiveTrade()) {
            this.startTrade(orderSide, orderEvent);
            return;
        }

        const netBeforeOrder = this.getNetContractCount();
        const orderChangesNetBy =
            orderSide === "buy"
                ? orderEvent.contractCount
                : -orderEvent.contractCount;
        const netAfterOrder = netBeforeOrder + orderChangesNetBy;

        const reversesPosition =
            (
                netBeforeOrder > 0 &&
                netAfterOrder < 0
            ) || (
                netBeforeOrder < 0 &&
                netAfterOrder > 0
            );

        if (reversesPosition) {
            const closingContractCount =
                Math.abs(netBeforeOrder);
            const openingContractCount =
                Math.abs(netAfterOrder);

            this.startReversal(
                orderSide,
                orderEvent,
                closingContractCount,
                openingContractCount
            );

            return;
        }

        addOrderEvent(
            this.activeTrade,
            orderSide,
            orderEvent,
            orderEvent.contractCount
        );

        if (netAfterOrder === 0) {
            this.completeActiveTrade();
        }
    }

    /*
     * This method prepares completed trades to be sent to the server.
     *
     * It works only when no contracts remain open. A deep copy duplicates every
     * nested trade and order, so later request changes cannot alter the draft
     * still displayed on the page.
     *
     * Returns the copied completed-trade array.
     * Throws an error when a trade is open or the draft contains no trades.
     */
    getTradesForSubmission() {
        if (this.hasActiveTrade()) {
            throw new Error(
                "The open position must be closed before saving."
            );
        }

        if (this.trades.length === 0) {
            throw new Error(
                "At least one completed trade is required."
            );
        }

        return structuredClone(this.trades);
    }

    /*
     * This method changes the notes and yes/no process-deviation value for the
     * current open trade.
     *
     * It does not return a value.
     * It throws an error when no trade is open, notes are too long, or the
     * process-deviation value is not true or false.
     */
    updateActiveTradeDetails(notes, processDeviation) {
        if (!this.hasActiveTrade()) {
            throw new Error("There is no active trade to update.");
        }

        if (
            typeof notes !== "string" ||
            notes.length > TRADE_NOTES_MAXIMUM_LENGTH
        ) {
            throw new TypeError(
                "Trade notes must contain at most 1500 characters."
            );
        }

        if (typeof processDeviation !== "boolean") {
            throw new TypeError(
                "Process deviation must be a boolean."
            );
        }

        this.activeTrade.notes = notes;
        this.activeTrade.processDeviation = processDeviation;
    }

    /*
     * This method reports how many completed trades are in the unsaved draft.
     *
     * Returns the number of completed trades.
     */
    getCompletedTradeCount() {
        return this.trades.length;
    }

    /*
     * This method combines orders from completed and open trades into one list
     * of chart markers.
     *
     * Returns a new marker array in trade order. Every marker says whether it is
     * a buy or sell. The original draft orders are not changed.
     */
    getOrderEventsForDisplay() {
        const trades = [...this.trades];

        if (this.activeTrade) trades.push(this.activeTrade);

        return trades.flatMap((trade) => {
            return [
                ...getOrderMarkers(
                    trade.orderEvents.buySide,
                    "buy"
                ),
                ...getOrderMarkers(
                    trade.orderEvents.sellSide,
                    "sell"
                )
            ];
        });
    }

    /*
     * This method checks whether Undo has an earlier copy of the draft to restore.
     *
     * Returns true when Undo is available. Returns false otherwise.
     */
    canUndo() {
        return this.history.length > 0;
    }

    /*
     * This method restores the complete draft copy saved before the newest order.
     *
     * Returns true when an earlier state was restored.
     * Returns false when there was nothing to undo.
     */
    undoLastOrderEvent() {
        const previousState = this.history.pop();

        if (!previousState) return false;

        this.trades = previousState.trades;
        this.activeTrade = previousState.activeTrade;

        return true;
    }

    /*
     * This method gets the editable notes and process-deviation value for the open trade.
     *
     * Returns an object containing notes and processDeviation.
     * Returns null when no trade is open.
     */
    getActiveTradeDetails() {
        if (!this.activeTrade) return null;

        return {
            notes: this.activeTrade.notes,
            processDeviation:
                this.activeTrade.processDeviation
        };
    }

    /*
     * This method gives display code a copy of the completed trades.
     * The copy prevents display code from accidentally changing the real draft.
     *
     * Returns a deep copy, including copies of all nested orders.
     */
    getCompletedTradesForDisplay() {
        return structuredClone(this.trades);
    }

    /*
     * This method changes the notes for one completed trade.
     *
     * It also changes that trade's notes inside every saved Undo copy. Otherwise,
     * pressing Undo could bring back an older version of the notes.
     *
     * It does not return a value.
     * It throws an error when the trade number is invalid or notes are too long.
     */
    updateCompletedTradeNotes(tradeIndex, notes) {
        if (
            !Number.isSafeInteger(tradeIndex) ||
            tradeIndex < 0 ||
            tradeIndex >= this.trades.length
        ) {
            throw new TypeError(
                "A valid completed trade is required."
            );
        }

        if (
            typeof notes !== "string" ||
            notes.length > TRADE_NOTES_MAXIMUM_LENGTH
        ) {
            throw new TypeError(
                "Trade notes must contain at most 1500 characters."
            );
        }

        this.trades[tradeIndex].notes = notes;

        this.history.forEach((state) => {
            if (state.trades[tradeIndex]) {
                state.trades[tradeIndex].notes = notes;
            } else if (
                state.trades.length === tradeIndex &&
                state.activeTrade
            ) {
                state.activeTrade.notes = notes;
            }
        });
    }
}
