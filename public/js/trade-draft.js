/** Maintains and validates the browser-only draft for one submitted trading day. */
const TRADE_NOTES_MAXIMUM_LENGTH = 1500;

/*
 * This function validates the two order actions recognized by the draft model.
 *
 * Returns true for buy or sell; otherwise false.
 */
function isValidOrderSide(orderSide) {
    return orderSide === "buy" || orderSide === "sell";
}

/*
 * This function validates one local event before it can change position state.
 * Prices use quarter points and quantities use positive whole contracts.
 *
 * Returns true when every event field is valid; otherwise false.
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
 * This function maps an order action to its storage property.
 *
 * Returns buySide for buy and sellSide for sell.
 */
function getOrderEventCollectionName(orderSide) {
    return orderSide === "buy" ? "buySide" : "sellSide";
}

/*
 * This function appends a selected quantity from an event to one side of a trade.
 * A smaller selected quantity allows a reversal event to be split between two trades.
 *
 * It mutates the trade and returns no value.
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
 * This function totals the quantities represented by an order-event array.
 *
 * Returns the summed contract count.
 */
function getContractCount(orderEvents) {
    return orderEvents.reduce(
        (total, orderEvent) => total + orderEvent.contractCount,
        0
    );
}

/*
 * This function adds display-only side information to copied order events.
 *
 * Returns a new marker array without modifying the draft events.
 */
function getOrderMarkers(orderEvents, orderSide) {
    return orderEvents.map((orderEvent) => ({
        ...orderEvent,
        orderSide
    }));
}

class TradeDraft {
    /*
     * This constructor creates an empty day draft with no position or undo history.
     *
     * Returns the new TradeDraft instance.
     */
    constructor() {
        this.trades = [];
        this.activeTrade = null;
        this.history = [];
    }

    /*
     * This method removes every completed trade, active position, and undo snapshot.
     *
     * It mutates the draft and returns no value.
     */
    clear() {
        this.trades = [];
        this.activeTrade = null;
        this.history = [];
    }

    /*
     * This method checks whether the draft currently contains an open position.
     *
     * Returns true while a trade is active; otherwise false.
     */
    hasActiveTrade() {
        return this.activeTrade !== null;
    }

    /*
     * This method creates a long or short trade from its first valid order event.
     *
     * It returns no value and throws when another trade is active or input is invalid.
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
     * This method calculates buys minus sells for the active trade.
     * Positive values are long, negative values are short, and zero is closed.
     *
     * Returns the signed net contract count, or zero when no trade is active.
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
     * This method moves a flat active trade into the completed trade array.
     *
     * It returns no value and throws when no trade exists or its net position is open.
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
     * This method splits one oversized opposing order into a close and a new opening trade.
     * Both parts retain the original event time and price but use their respective quantities.
     *
     * It mutates draft state and returns no value.
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
     * This method applies one buy or sell event as an open, scale, close, or reversal.
     * State is snapshotted first so every accepted action can be undone exactly once.
     *
     * It mutates the draft and returns no value; invalid event input throws TypeError.
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
     * This method produces the completed trade payload only when the entire day is flat.
     * A deep copy prevents request preparation from mutating the displayed draft.
     *
     * Returns the copied trade array, or throws for an open or empty draft.
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
     * This method updates notes and process-deviation state on the current open trade.
     *
     * It returns no value and throws for missing state, oversized notes, or invalid boolean.
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
     * This method reports how many complete flat trades are stored in the draft.
     *
     * Returns the completed trade-array length.
     */
    getCompletedTradeCount() {
        return this.trades.length;
    }

    /*
     * This method flattens completed and active order events into chart marker objects.
     *
     * Returns a new chronological-by-trade marker array containing display-side fields.
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
     * This method checks whether an earlier order snapshot is available.
     *
     * Returns true when Undo can restore state; otherwise false.
     */
    canUndo() {
        return this.history.length > 0;
    }

    /*
     * This method restores the snapshot captured before the most recent order event.
     *
     * Returns true when state was restored, or false when history was already empty.
     */
    undoLastOrderEvent() {
        const previousState = this.history.pop();

        if (!previousState) return false;

        this.trades = previousState.trades;
        this.activeTrade = previousState.activeTrade;

        return true;
    }

    /*
     * This method exposes editable descriptive fields for the active trade.
     *
     * Returns notes and processDeviation, or null when no trade is active.
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
     * This method exposes completed trades without sharing mutable draft references.
     *
     * Returns a deep copy of the completed trade array.
     */
    getCompletedTradesForDisplay() {
        return structuredClone(this.trades);
    }

    /*
     * This method updates one completed trade's notes across current and undoable states.
     * Keeping snapshots aligned prevents Undo from restoring an obsolete note value.
     *
     * It returns no value and throws for an invalid index or oversized notes.
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
