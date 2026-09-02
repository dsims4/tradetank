class TradeDraft {
    constructor() {
        this.trades = [];
        this.activeTrade = null;
        this.history = [];
    }

    clear() {
        this.trades = [];
        this.activeTrade = null;
        this.history = [];
    }

    hasActiveTrade() {
        return this.activeTrade !== null;
    }

    startTrade(orderSide, orderEvent) {
        if (this.hasActiveTrade()) {
            throw new Error("A trade is already active.");
        }

        if (orderSide !== "buy" && orderSide !== "sell") {
            throw new TypeError("The order side must be buy or sell.");
        }

        if (!this.isValidOrderEvent(orderEvent)) {
            throw new TypeError("A valid order event is required.");
        }

        const eventSide =
            orderSide === "buy"
                ? "buySide"
                : "sellSide";

        this.activeTrade = {
            side: orderSide === "buy" ? "long" : "short",
            orderEvents: {
                buySide: [],
                sellSide: []
            },
            processDeviation: false,
            notes: ""
        };

        this.activeTrade.orderEvents[eventSide].push({
            time: orderEvent.time,
            price: orderEvent.price,
            contractCount: orderEvent.contractCount
        });
    }

    getNetContractCount() {
        if (!this.hasActiveTrade()) return 0;

        const buyCount = this.activeTrade.orderEvents.buySide.reduce(
            (total, orderEvent) => total + orderEvent.contractCount,
            0
        );

        const sellCount = this.activeTrade.orderEvents.sellSide.reduce(
            (total, orderEvent) => total + orderEvent.contractCount,
            0
        );

        return buyCount - sellCount;
    }

    isValidOrderEvent(orderEvent) {
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

    recordOrderEvent(orderSide, orderEvent) {
        if (orderSide !== "buy" && orderSide !== "sell") {
            throw new TypeError("The order side must be buy or sell.");
        }

        if (!this.isValidOrderEvent(orderEvent)) {
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

        const eventSide =
            orderSide === "buy"
                ? "buySide"
                : "sellSide";

        this.activeTrade.orderEvents[eventSide].push({
            time: orderEvent.time,
            price: orderEvent.price,
            contractCount: orderEvent.contractCount
        });

        if (netAfterOrder === 0) {
            this.completeActiveTrade();
        }
    }

    startReversal(orderSide, orderEvent,
        closingContractCount, openingContractCount) {

        const eventSide =
            orderSide === "buy"
                ? "buySide"
                : "sellSide";

        this.activeTrade.orderEvents[eventSide].push({
            time: orderEvent.time,
            price: orderEvent.price,
            contractCount: closingContractCount
        });

        this.completeActiveTrade();

        this.startTrade(orderSide, {
            time: orderEvent.time,
            price: orderEvent.price,
            contractCount: openingContractCount
        });
    }

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

    updateActiveTradeDetails(notes, processDeviation) {
        if (!this.hasActiveTrade()) {
            throw new Error("There is no active trade to update.");
        }

        if (
            typeof notes !== "string" ||
            notes.length > 1500
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

    getCompletedTradeCount() {
        return this.trades.length;
    }

    getOrderEventsForDisplay() {
        const trades = [...this.trades];

        if (this.activeTrade) trades.push(this.activeTrade);

        return trades.flatMap((trade) => {
            const buyEvents =
                trade.orderEvents.buySide.map(
                    (orderEvent) => ({
                        ...orderEvent,
                        orderSide: "buy"
                    })
                );

            const sellEvents =
                trade.orderEvents.sellSide.map(
                    (orderEvent) => ({
                        ...orderEvent,
                        orderSide: "sell"
                    })
                );

            return [
                ...buyEvents,
                ...sellEvents
            ];
        });
    }

    canUndo() {
        return this.history.length > 0;
    }

    undoLastOrderEvent() {
        const previousState = this.history.pop();

        if (!previousState) return false;

        this.trades = previousState.trades;
        this.activeTrade = previousState.activeTrade;

        return true;
    }

    getActiveTradeDetails() {
        if (!this.activeTrade) return null;

        return {
            notes: this.activeTrade.notes,
            processDeviation:
                this.activeTrade.processDeviation
        };
    }

    getCompletedTradesForDisplay() {
        return structuredClone(this.trades);
    }

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
            notes.length > 1500
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
