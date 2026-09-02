class CandlestickChart {
    constructor(canvas, candlesticks = []) {
        this.candlesticks = candlesticks;
        this.canvas = canvas;
        this.ctx = canvas.getContext("2d");
        this.width = 0;
        this.height = 0;
        this.crosshair = null;
        this.orderMarkers = [];
        this.fontFamily =
            "general-sans, system-ui, sans-serif";
        this.timeFormatter = new Intl.DateTimeFormat(
            "en-US",
            {
                timeZone: "America/New_York",
                hour: "numeric",
                minute: "2-digit"
            }
        );
        this.canvas.addEventListener("pointermove", (event) => {
            this.updateCrosshair(event);
        });
        this.canvas.addEventListener("pointerleave", () => {
            this.clearCrosshair();
        });

        document.fonts.ready.then(() => this.render());
    }

    setCandlesticks(candlesticks) {
        if (!Array.isArray(candlesticks)) {
            throw new TypeError(
                "Candlesticks must be provided as an array."
            );
        }

        this.crosshair = null;
        this.orderMarkers = [];
        this.candlesticks = candlesticks;
        this.render();
    }

    resize() {
        const boundingClientRect = this.canvas.getBoundingClientRect();
        const devicePixelRatio = window.devicePixelRatio || 1;

        this.width = boundingClientRect.width;
        this.height = boundingClientRect.height;

        this.canvas.width = this.width * devicePixelRatio;
        this.canvas.height = this.height * devicePixelRatio;

        this.ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

        this.render();
    }

    render() {
        this.ctx.clearRect(
            0,
            0,
            this.width,
            this.height
        );

        this.ctx.fillStyle = "#ffffff";
        this.ctx.fillRect(
            0,
            0,
            this.width,
            this.height
        );

        this.ctx.fillStyle = "#000000";
        this.ctx.font = `16px ${this.fontFamily}`;
        this.ctx.textAlign = "center";
        this.ctx.textBaseline = "middle";

        if (this.candlesticks.length === 0) {
            this.ctx.fillStyle = "#000000";
            this.ctx.font = `16px ${this.fontFamily}`;
            this.ctx.textAlign = "center";
            this.ctx.textBaseline = "middle";

            this.ctx.fillText(
                "The candlestick data is not available.",
                this.width / 2,
                this.height / 2
            );

            return;
        }

        this.drawCandlesticks();
        this.drawOrderMarkers();
        this.drawPriceAxis();
        this.drawTimeAxis();
        this.drawCrosshair();
    }

    getPriceRange() {
        if (this.candlesticks.length === 0) return null;

        const lowestPrice = Math.min(
            ...this.candlesticks.map(
                (candlestick) => candlestick.lowPrice
            )
        );

        const highestPrice = Math.max(
            ...this.candlesticks.map(
                (candlestick) => candlestick.highPrice
            )
        );

        const visibleRange =
            highestPrice - lowestPrice;
        const groupedOrderMarkers =
            this.getGroupedOrderMarkers();
        const plotHeight = Math.max(
            this.getPlotArea().height,
            1
        );
        const baselinePaddingPixels = plotHeight / 12;
        const getMarkerPaddingPixels = (orderSide) => {
            const maximumRows = groupedOrderMarkers.reduce(
                (maximum, orderMarker) =>
                    orderMarker.orderSide === orderSide
                        ? Math.max(
                            maximum,
                            orderMarker.orderEvents.length
                        )
                        : maximum,
                0
            );

            if (maximumRows === 0) {
                return baselinePaddingPixels;
            }

            return Math.max(
                baselinePaddingPixels,
                this.getOrderMarkerLabelHeight(maximumRows) + 10
            );
        };
        let upperPaddingPixels =
            getMarkerPaddingPixels("sell");
        let lowerPaddingPixels =
            getMarkerPaddingPixels("buy");
        const paddingPixelTotal =
            upperPaddingPixels + lowerPaddingPixels;
        const maximumPaddingPixelTotal = plotHeight * 0.8;

        if (paddingPixelTotal > maximumPaddingPixelTotal) {
            const scale =
                maximumPaddingPixelTotal / paddingPixelTotal;

            upperPaddingPixels *= scale;
            lowerPaddingPixels *= scale;
        }

        const dataHeight = Math.max(
            plotHeight - upperPaddingPixels - lowerPaddingPixels,
            1
        );
        const pricePerPixel = visibleRange / dataHeight;
        const upperPadding = Math.max(
            upperPaddingPixels * pricePerPixel,
            1
        );
        const lowerPadding = Math.max(
            lowerPaddingPixels * pricePerPixel,
            1
        );

        return {
            minimum: lowestPrice - lowerPadding,
            maximum: highestPrice + upperPadding
        };
    }

    getPlotArea() {
        const left = 10;
        const top = 20;
        const right = this.width - 70;
        const bottom = this.height - 35;

        return {
            left,
            top,
            right,
            bottom,
            width: right - left,
            height: bottom - top
        };
    }

    priceToY(price, priceRange) {
        const plotArea = this.getPlotArea();
        const rangeSize =
            priceRange.maximum - priceRange.minimum;
        const positionInRange =
            (priceRange.maximum - price) / rangeSize;

        return (
            plotArea.top +
            positionInRange * plotArea.height
        );
    }

    getCandleGeometry(index) {
        const plotArea = this.getPlotArea();
        const rightPadding = 10;
        const candlestickAreaWidth =
            plotArea.width - rightPadding;
        const slotWidth =
            candlestickAreaWidth / this.candlesticks.length;
        const centerX =
            plotArea.left + slotWidth * (index + 0.5);
        const bodyWidth =
            Math.max(1, Math.min(slotWidth * 0.65, 10));

        return {
            centerX,
            bodyWidth
        };
    }

    drawCandlesticks() {
        const priceRange = this.getPriceRange();

        if (!priceRange) return;

        this.ctx.lineWidth = 1;
        this.ctx.strokeStyle = "#000000";

        this.candlesticks.forEach((candlestick, index) => {
            const { centerX, bodyWidth } =
                this.getCandleGeometry(index);

            const highY =
                this.priceToY(candlestick.highPrice, priceRange);
            const lowY =
                this.priceToY(candlestick.lowPrice, priceRange);
            const openY =
                this.priceToY(candlestick.openPrice, priceRange);
            const closeY =
                this.priceToY(candlestick.closePrice, priceRange);

            this.ctx.beginPath();
            this.ctx.moveTo(centerX, highY);
            this.ctx.lineTo(centerX, lowY);
            this.ctx.stroke();

            const bodyTop = Math.min(openY, closeY);
            const bodyHeight =
                Math.max(Math.abs(closeY - openY), 1);
            const bodyLeft = centerX - bodyWidth / 2;
            const isBullish =
                candlestick.closePrice >= candlestick.openPrice;

            this.ctx.fillStyle =
                isBullish ? "#ffffff" : "#000000";

            this.ctx.fillRect(
                bodyLeft,
                bodyTop,
                bodyWidth,
                bodyHeight
            );

            this.ctx.strokeRect(
                bodyLeft,
                bodyTop,
                bodyWidth,
                bodyHeight
            );
        });
    }

    drawPriceAxis() {
        const priceRange = this.getPriceRange();

        if (!priceRange) return;

        const plotArea = this.getPlotArea();
        const tickCount = 5;
        const labelInset = 10;
        const labelAreaHeight =
            plotArea.height - labelInset * 2;

        this.ctx.strokeStyle = "#000000";
        this.ctx.fillStyle = "#000000";
        this.ctx.lineWidth = 1;
        this.ctx.font = `12px ${this.fontFamily}`;
        this.ctx.textAlign = "left";
        this.ctx.textBaseline = "middle";

        this.ctx.beginPath();
        this.ctx.moveTo(plotArea.right, plotArea.top);
        this.ctx.lineTo(plotArea.right, plotArea.bottom);
        this.ctx.stroke();

        for (let index = 0; index <= tickCount; index += 1) {
            const position = index / tickCount;
            const y =
                plotArea.top +
                labelInset +
                labelAreaHeight * position;
            const rawPrice = this.yToPrice(y, priceRange);
            const price = Math.round(rawPrice * 4) / 4;

            this.ctx.beginPath();
            this.ctx.moveTo(plotArea.right, y);
            this.ctx.lineTo(plotArea.right + 5, y);
            this.ctx.stroke();

            this.ctx.fillText(
                price.toFixed(2),
                plotArea.right + 8,
                y
            );
        }
    }

    drawTimeAxis() {
        if (this.candlesticks.length === 0) return;

        const plotArea = this.getPlotArea();
        const labelCount =
            Math.min(6, this.candlesticks.length);

        this.ctx.strokeStyle = "#000000";
        this.ctx.fillStyle = "#000000";
        this.ctx.lineWidth = 1;
        this.ctx.font = `12px ${this.fontFamily}`;
        this.ctx.textAlign = "center";
        this.ctx.textBaseline = "top";

        this.ctx.beginPath();
        this.ctx.moveTo(plotArea.left, plotArea.bottom);
        this.ctx.lineTo(plotArea.right, plotArea.bottom);
        this.ctx.stroke();

        for (let index = 0; index < labelCount; index += 1) {
            const candleIndex =
                labelCount === 1
                ? 0
                : Math.round(
                    index *
                    (this.candlesticks.length - 1) /
                    (labelCount - 1)
                );

            const candlestick =
                this.candlesticks[candleIndex];
            const { centerX } =
                this.getCandleGeometry(candleIndex);
            const label = this.timeFormatter.format(
                new Date(candlestick.openTime)
            );
            const labelHalfWidth =
                this.ctx.measureText(label).width / 2;
            const labelX = Math.min(
                plotArea.right - labelHalfWidth,
                Math.max(
                    plotArea.left + labelHalfWidth,
                    centerX
                )
            );

            this.ctx.beginPath();
            this.ctx.moveTo(centerX, plotArea.bottom);
            this.ctx.lineTo(centerX, plotArea.bottom + 5);
            this.ctx.stroke();

            this.ctx.fillText(
                label,
                labelX,
                plotArea.bottom + 8
            );
        }
    }

    yToPrice(y, priceRange) {
        const plotArea = this.getPlotArea();
        const position =
            (y - plotArea.top) / plotArea.height;

        return (
            priceRange.maximum -
            position *
            (priceRange.maximum - priceRange.minimum)
        );
    }

    getCandleIndexAtX(x) {
        const plotArea = this.getPlotArea();
        const rightPadding = 10;
        const candlestickAreaRight =
            plotArea.right - rightPadding;

        if (
            x < plotArea.left ||
            x > candlestickAreaRight
        ) {
            return null;
        }

        const slotWidth =
            (plotArea.width - rightPadding) /
            this.candlesticks.length;
        const index = Math.floor(
            (x - plotArea.left) / slotWidth
        );

        return Math.min(
            this.candlesticks.length - 1,
            index
        );
    }

    updateCrosshair(event) {
        if (this.candlesticks.length === 0) return;

        const bounds =
            this.canvas.getBoundingClientRect();
        const x = event.clientX - bounds.left;
        const y = event.clientY - bounds.top;
        const plotArea = this.getPlotArea();

        if (
            x < plotArea.left ||
            x > plotArea.right ||
            y < plotArea.top ||
            y > plotArea.bottom
        ) {
            this.clearCrosshair();
            return;
        }

        const priceRange = this.getPriceRange();
        const candleIndex = this.getCandleIndexAtX(x);

        if (candleIndex === null) {
            this.clearCrosshair();
            return;
        }

        const rawPrice =
            this.yToPrice(y, priceRange);
        const minimumTick =
            Math.ceil(priceRange.minimum * 4) / 4;
        const maximumTick =
            Math.floor(priceRange.maximum * 4) / 4;
        const snappedPrice = Math.min(
            maximumTick,
            Math.max(
                minimumTick,
                Math.round(rawPrice * 4) / 4
            )
        );

        this.crosshair = {
            x,
            y: this.priceToY(snappedPrice, priceRange),
            price: snappedPrice,
            candleIndex
        };

        this.render();
    }

    clearCrosshair() {
        if (!this.crosshair) return;

        this.crosshair = null;
        this.render();
    }

    drawCrosshair() {
        if (!this.crosshair) return;

        const plotArea = this.getPlotArea();
        const candlestick =
            this.candlesticks[this.crosshair.candleIndex];
        const timeLabel = this.timeFormatter.format(
            new Date(candlestick.openTime)
        );

        this.ctx.save();

        this.ctx.strokeStyle = "rgba(0, 0, 0, 0.55)";
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([4, 4]);

        this.ctx.beginPath();
        this.ctx.moveTo(this.crosshair.x, plotArea.top);
        this.ctx.lineTo(this.crosshair.x, plotArea.bottom);
        this.ctx.moveTo(plotArea.left, this.crosshair.y);
        this.ctx.lineTo(plotArea.right, this.crosshair.y);
        this.ctx.stroke();

        this.ctx.setLineDash([]);
        this.ctx.fillStyle = "#000000";

        const priceLabelWidth =
            this.width - plotArea.right;

        this.ctx.fillRect(
            plotArea.right,
            this.crosshair.y - 10,
            priceLabelWidth,
            20
        );

        this.ctx.fillStyle = "#ffffff";
        this.ctx.font = `12px ${this.fontFamily}`;
        this.ctx.textAlign = "center";
        this.ctx.textBaseline = "middle";

        this.ctx.fillText(
            this.crosshair.price.toFixed(2),
            plotArea.right + priceLabelWidth / 2,
            this.crosshair.y
        );

        const timeLabelWidth =
            this.ctx.measureText(timeLabel).width + 12;
        const timeLabelLeft = Math.min(
            plotArea.right - timeLabelWidth,
            Math.max(
                plotArea.left,
                this.crosshair.x - timeLabelWidth / 2
            )
        );

        this.ctx.fillStyle = "#000000";
        this.ctx.fillRect(
            timeLabelLeft,
            plotArea.bottom,
            timeLabelWidth,
            22
        );

        this.ctx.fillStyle = "#ffffff";
        this.ctx.fillText(
            timeLabel,
            timeLabelLeft + timeLabelWidth / 2,
            plotArea.bottom + 11
        );

        this.ctx.restore();
    }

    getCrosshairSelection() {
        if (!this.crosshair) return null;

        const candlestick =
            this.candlesticks[this.crosshair.candleIndex];
        const isWithinCandleRange =
            this.crosshair.price >= candlestick.lowPrice &&
            this.crosshair.price <= candlestick.highPrice;

        return {
            time: candlestick.openTime,
            price: this.crosshair.price,
            isWithinCandleRange
        };
    }

    setOrderMarkers(orderMarkers) {
        if (!Array.isArray(orderMarkers)) {
            throw new TypeError(
                "Order markers must be provided as an array."
            );
        }

        this.orderMarkers = orderMarkers.map(
            (orderMarker) => ({
                ...orderMarker
            })
        );

        this.render();
    }

    getGroupedOrderMarkers() {
        const groupedMarkers = new Map();

        this.orderMarkers.forEach((orderMarker) => {
            const markerKey = JSON.stringify([
                orderMarker.orderSide,
                orderMarker.time
            ]);

            const existingMarker =
                groupedMarkers.get(markerKey);

            if (existingMarker) {
                existingMarker.orderEvents.push({
                    price: orderMarker.price,
                    contractCount: orderMarker.contractCount
                });
            } else {
                groupedMarkers.set(
                    markerKey,
                    {
                        orderSide: orderMarker.orderSide,
                        time: orderMarker.time,
                        orderEvents: [
                            {
                                price: orderMarker.price,
                                contractCount: orderMarker.contractCount
                            }
                        ]
                    }
                );
            }
        });

        return [...groupedMarkers.values()];
    }

    getOrderMarkerLabelHeight(orderEventCount) {
        const labelLineCount = orderEventCount * 2 - 1;

        return labelLineCount * 12 + 6;
    }

    getCandleIndexForTime(time) {
        const markerTime = Date.parse(time);

        return this.candlesticks.findIndex(
            (candlestick) =>
                Date.parse(candlestick.openTime) === markerTime
        );
    }

    getOrderMarkerLabelY({
        labelCenterX,
        labelWidth,
        labelHeight,
        isBuy,
        priceRange,
        plotArea
    }) {
        const labelLeft = labelCenterX - labelWidth / 2;
        const labelRight = labelCenterX + labelWidth / 2;
        const overlappingCandles = this.candlesticks.filter(
            (candlestick, index) => {
                const { centerX, bodyWidth } =
                    this.getCandleGeometry(index);

                return (
                    centerX + bodyWidth / 2 >= labelLeft &&
                    centerX - bodyWidth / 2 <= labelRight
                );
            }
        );
        const highestY = Math.min(
            ...overlappingCandles.map(
                (candlestick) =>
                    this.priceToY(
                        candlestick.highPrice,
                        priceRange
                    )
            )
        );
        const lowestY = Math.max(
            ...overlappingCandles.map(
                (candlestick) =>
                    this.priceToY(
                        candlestick.lowPrice,
                        priceRange
                    )
            )
        );
        const labelGap = 4;
        const aboveCenterY =
            highestY - labelGap - labelHeight / 2;
        const belowCenterY =
            lowestY + labelGap + labelHeight / 2;
        const preferredCenterY =
            isBuy ? belowCenterY : aboveCenterY;
        const alternateCenterY =
            isBuy ? aboveCenterY : belowCenterY;
        const labelFits = (centerY) => (
            centerY - labelHeight / 2 >= plotArea.top &&
            centerY + labelHeight / 2 <= plotArea.bottom
        );

        if (labelFits(preferredCenterY)) {
            return preferredCenterY;
        }

        if (labelFits(alternateCenterY)) {
            return alternateCenterY;
        }

        return Math.min(
            plotArea.bottom - labelHeight / 2,
            Math.max(
                plotArea.top + labelHeight / 2,
                preferredCenterY
            )
        );
    }

    drawOrderMarkers() {
        if (this.orderMarkers.length === 0) return;

        const priceRange = this.getPriceRange();
        const plotArea = this.getPlotArea();
        const orderMarkers =
            this.getGroupedOrderMarkers();

        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(
            plotArea.left,
            plotArea.top,
            plotArea.width,
            plotArea.height
        );
        this.ctx.clip();

        this.ctx.font = `12px ${this.fontFamily}`;
        this.ctx.textAlign = "center";
        this.ctx.textBaseline = "middle";
        this.ctx.lineWidth = 1;

        orderMarkers.forEach((orderMarker) => {
            const candleIndex =
                this.getCandleIndexForTime(orderMarker.time);

            if (candleIndex === -1) return;

            const { centerX, bodyWidth } =
                this.getCandleGeometry(candleIndex);
            const isBuy =
                orderMarker.orderSide === "buy";
            const labelLines = orderMarker.orderEvents.flatMap(
                (orderEvent, index) => {
                    const orderLabel =
                        `${isBuy ? "B" : "S"}` +
                        `${orderEvent.contractCount}`;

                    return index < orderMarker.orderEvents.length - 1
                        ? [orderLabel, "+"]
                        : [orderLabel];
                }
            );
            const labelLineHeight = 12;
            const labelWidth = Math.max(
                ...labelLines.map(
                    (labelLine) =>
                        this.ctx.measureText(labelLine).width
                )
            ) + 8;
            const labelHeight =
                this.getOrderMarkerLabelHeight(
                    orderMarker.orderEvents.length
                );
            const labelCenterX = Math.min(
                plotArea.right - labelWidth / 2,
                Math.max(
                    plotArea.left + labelWidth / 2,
                    centerX
                )
            );
            const labelCenterY = this.getOrderMarkerLabelY({
                labelCenterX,
                labelWidth,
                labelHeight,
                isBuy,
                priceRange,
                plotArea
            });
            const markerHalfWidth = bodyWidth / 2 + 3;
            const markerPrices = [
                ...new Set(
                    orderMarker.orderEvents.map(
                        (orderEvent) => orderEvent.price
                    )
                )
            ];

            markerPrices.forEach((markerPrice) => {
                const priceY =
                    this.priceToY(markerPrice, priceRange);

                this.ctx.strokeStyle = "#ffffff";
                this.ctx.lineWidth = 3;
                this.ctx.beginPath();
                this.ctx.moveTo(centerX - markerHalfWidth, priceY);
                this.ctx.lineTo(centerX + markerHalfWidth, priceY);
                this.ctx.stroke();

                this.ctx.strokeStyle = "#000000";
                this.ctx.lineWidth = 1;
                this.ctx.beginPath();
                this.ctx.moveTo(centerX - markerHalfWidth, priceY);
                this.ctx.lineTo(centerX + markerHalfWidth, priceY);
                this.ctx.stroke();
            });

            this.ctx.fillStyle = "#ffffff";
            this.ctx.fillRect(
                labelCenterX - labelWidth / 2,
                labelCenterY - labelHeight / 2,
                labelWidth,
                labelHeight
            );

            this.ctx.strokeRect(
                labelCenterX - labelWidth / 2,
                labelCenterY - labelHeight / 2,
                labelWidth,
                labelHeight
            );

            this.ctx.fillStyle = "#000000";
            labelLines.forEach((labelLine, index) => {
                const labelY =
                    labelCenterY - labelHeight / 2 + 3 +
                    labelLineHeight * (index + 0.5);

                this.ctx.fillText(
                    labelLine,
                    labelCenterX,
                    labelY
                );
            });
        });

        this.ctx.restore();
    }
}

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
