/** Draws the candlestick chart, labels, pointer crosshair, and trade-order boxes. */
class CandlestickChart {
    /*
     * This constructor prepares one candlestick chart.
     *
     * It stores the drawing surface and candles, creates the New York time
     * formatter, and listens for pointer movement and pointer exit.
     *
     * Returns the new chart object created by `new CandlestickChart(...)`.
     */
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

    /*
     * This method replaces every candle currently displayed.
     * The old crosshair and order markers are cleared because they refer to the
     * previous candle list.
     *
     * It redraws the chart and does not return a value.
     * It throws a TypeError when the supplied value is not an array.
     */
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

    /*
     * This method makes the canvas drawing resolution match its visible CSS size.
     *
     * High-density screens use several physical pixels for one CSS pixel. Scaling
     * by the device pixel ratio keeps lines and text sharp while the rest of the
     * chart can continue measuring ordinary CSS pixels.
     *
     * It redraws only when width, height, or screen density changed.
     * It does not return a value.
     */
    resize() {
        const boundingClientRect = this.canvas.getBoundingClientRect();
        const devicePixelRatio = window.devicePixelRatio || 1;
        const width = boundingClientRect.width;
        const height = boundingClientRect.height;
        const pixelWidth = Math.round(
            width * devicePixelRatio
        );
        const pixelHeight = Math.round(
            height * devicePixelRatio
        );

        if (
            this.width === width &&
            this.height === height &&
            this.canvas.width === pixelWidth &&
            this.canvas.height === pixelHeight
        ) {
            return;
        }

        this.width = width;
        this.height = height;

        this.canvas.width = pixelWidth;
        this.canvas.height = pixelHeight;

        this.ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);

        this.render();
    }

    /*
     * This method erases and redraws the complete chart from back to front.
     *
     * Drawing in a fixed order controls which items appear on top. With no
     * candles, it shows one centered unavailable message instead of empty axes.
     *
     * It changes the canvas drawing and does not return a value.
     */
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

    /*
     * This method finds the lowest and highest prices the chart must display.
     *
     * It begins with candle lows and highs, then leaves enough extra price space
     * for order boxes. A buy box needs space below candles and a sell box needs
     * space above them, so only the needed side is enlarged.
     *
     * Returns an object containing minimum and maximum prices.
     * Returns null when there are no candles.
     */
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
        // Marker labels extend the range only on the side where their labels are drawn.
        const groupedOrderMarkers =
            this.getGroupedOrderMarkers();
        const plotHeight = Math.max(
            this.getPlotArea().height,
            1
        );
        const baselinePaddingPixels = plotHeight / 12;
        this.ctx.save();
        this.ctx.font = `12px ${this.fontFamily}`;

        let upperPaddingPixels = this.getOrderMarkerPaddingPixels(
            "sell",
            groupedOrderMarkers,
            baselinePaddingPixels
        );
        let lowerPaddingPixels = this.getOrderMarkerPaddingPixels(
            "buy",
            groupedOrderMarkers,
            baselinePaddingPixels
        );

        this.ctx.restore();
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

    /*
     * This method separates the canvas into the candle area and margins for the
     * bottom time labels and right-side price labels.
     *
     * Returns the candle area's left, right, top, bottom, width, and height in CSS pixels.
     */
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

    /*
     * This method converts a market price into a vertical canvas position.
     * Canvas y positions increase downward, so higher prices need smaller y values.
     *
     * Returns the matching vertical position inside the candle area.
     */
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

    /*
     * This method calculates where one candle belongs horizontally.
     * It also chooses a body width that fits inside that candle's share of the chart.
     *
     * Returns the candle's horizontal center and body width in CSS pixels.
     */
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
            Math.max(2, Math.min(slotWidth * 0.7, 12));

        return {
            centerX,
            bodyWidth
        };
    }

    /*
     * This method draws every candle's thin high-to-low wick and open-to-close body.
     * Rising candles use white bodies and falling candles use black bodies.
     *
     * It changes the canvas drawing and does not return a value.
     */
    drawCandlesticks() {
        const priceRange = this.getPriceRange();

        if (!priceRange) return;

        this.ctx.lineWidth = 1.5;
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
                Math.max(Math.abs(closeY - openY), 2);
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

    /*
     * This method draws six price labels along the chart's right side.
     * Each displayed price is rounded to an ES quarter-point increment of 0.25.
     *
     * It changes the canvas drawing and does not return a value.
     */
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

    /*
     * This method draws at most six New York time labels along the bottom.
     *
     * Labels are spread across the session. The first and final labels are moved
     * inward when needed so their text is not cut off by the chart edges.
     *
     * It changes the canvas drawing and does not return a value.
     */
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

    /*
     * This method converts a vertical canvas position back into a market price.
     *
     * Returns the exact unrounded price represented by that position.
     */
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

    /*
     * This method finds which candle is underneath a horizontal pointer position.
     *
     * Returns the candle's array position, kept inside the valid range.
     * Returns null when the pointer is outside the candle area.
     */
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

    /*
     * This method updates the crosshair from pointer movement.
     *
     * The horizontal position chooses a candle. The vertical position becomes a
     * price rounded to 0.25. Moving outside the candle area removes the crosshair
     * instead of leaving it stuck on an edge.
     *
     * It updates chart state, redraws the canvas, and returns no value.
     */
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

    /*
     * This method removes the active crosshair and redraws the chart underneath it.
     *
     * It returns no value and performs no redraw when the crosshair is already absent.
     */
    clearCrosshair() {
        if (!this.crosshair) return;

        this.crosshair = null;
        this.render();
    }

    /*
     * This method draws the crosshair's horizontal and vertical lines, plus boxes
     * that display its selected time and price.
     *
     * It changes the canvas drawing and does nothing when no crosshair is active.
     */
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

    /*
     * This method gives the Input page the crosshair's selected candle and price.
     * It also checks whether the price is between that candle's trusted low and high.
     *
     * Returns an object containing time, price, and the candle-range check.
     * Returns null when no crosshair is visible.
     */
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

    /*
     * This method replaces the order markers and redraws the chart.
     *
     * It creates a new outer array but keeps the marker objects themselves. This
     * prevents later changes to the caller's array, such as adding an item, from
     * silently changing the chart's list.
     *
     * It does not return a value.
     * It throws a TypeError when the markers are not supplied as an array.
     */
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

    /*
     * This method groups buy orders or sell orders placed on the same candle into
     * one chart box. Orders at the exact same price have their contract counts added.
     *
     * Returns a new array of grouped markers without changing the original markers.
     */
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
                const existingOrderEvent =
                    existingMarker.orderEvents.find(
                        (orderEvent) =>
                            Number(orderEvent.price) ===
                            Number(orderMarker.price)
                    );

                if (existingOrderEvent) {
                    existingOrderEvent.contractCount +=
                        Number(orderMarker.contractCount);
                } else {
                    existingMarker.orderEvents.push({
                        price: orderMarker.price,
                        contractCount: Number(
                            orderMarker.contractCount
                        )
                    });
                }
            } else {
                groupedMarkers.set(
                    markerKey,
                    {
                        orderSide: orderMarker.orderSide,
                        time: orderMarker.time,
                        orderEvents: [
                            {
                                price: orderMarker.price,
                                contractCount: Number(
                                    orderMarker.contractCount
                                )
                            }
                        ]
                    }
                );
            }
        });

        return [...groupedMarkers.values()];
    }

    /*
     * This method calculates how tall an order box must be for all its text lines.
     *
     * Returns the required box height in CSS pixels.
     */
    getOrderMarkerLabelHeight(orderEventCount) {
        const labelLineCount = orderEventCount * 2 - 1;

        return labelLineCount * 12 + 6;
    }

    /*
     * This method creates the text lines inside one order box.
     *
     * A buy of one contract becomes B1 and a sell of two becomes S2. Higher-price
     * orders appear first. A separate plus-sign line appears between orders.
     *
     * Returns the complete array of lines to draw.
     */
    getOrderMarkerLabelLines(orderMarker) {
        const prefix = orderMarker.orderSide === "buy" ? "B" : "S";
        const sortedOrderEvents = [...orderMarker.orderEvents].sort(
            (first, second) =>
                Number(second.price) - Number(first.price)
        );

        return sortedOrderEvents.flatMap(
            (orderEvent, index) => {
                const orderLabel =
                    `${prefix}${orderEvent.contractCount}`;

                return index < sortedOrderEvents.length - 1
                    ? [orderLabel, "+"]
                    : [orderLabel];
            }
        );
    }

    /*
     * This method measures the text in every order-box line and adds empty space
     * on both sides.
     *
     * Returns the smallest box width that can hold every line, in CSS pixels.
     */
    getOrderMarkerLabelWidth(labelLines) {
        return Math.max(
            ...labelLines.map(
                (labelLine) =>
                    this.ctx.measureText(labelLine).width
            )
        ) + 8;
    }

    /*
     * This method finds the candle whose opening time exactly matches an order's time.
     *
     * Returns the candle's array position.
     * Returns -1 when the order does not belong to the displayed candle list.
     */
    getCandleIndexForTime(time) {
        return this.candlesticks.findIndex(
            (candlestick) => candlestick.openTime === time
        );
    }

    /*
     * This method estimates how much extra price space is needed for order boxes.
     *
     * Boxes that overlap horizontally must use separate rows, called lanes. Boxes
     * that do not overlap may share a lane. Counting these lanes avoids adding
     * much more empty chart space than the labels actually need.
     *
     * Returns either the normal minimum padding or the space needed by every
     * label lane, whichever is larger.
     */
    getOrderMarkerPaddingPixels(
        orderSide,
        groupedOrderMarkers,
        baselinePaddingPixels
    ) {
        const plotArea = this.getPlotArea();
        const labelPadding = 5;
        const labelIntervals = groupedOrderMarkers
            .filter(
                (orderMarker) =>
                    orderMarker.orderSide === orderSide
            )
            .map((orderMarker) => {
                const candleIndex = this.getCandleIndexForTime(
                    orderMarker.time
                );

                if (candleIndex === -1) return null;

                const { centerX } =
                    this.getCandleGeometry(candleIndex);
                const labelLines =
                    this.getOrderMarkerLabelLines(orderMarker);
                const width =
                    this.getOrderMarkerLabelWidth(labelLines);
                const labelCenterX = Math.min(
                    plotArea.right - width / 2,
                    Math.max(
                        plotArea.left + width / 2,
                        centerX
                    )
                );

                return {
                    left: labelCenterX - width / 2,
                    right: labelCenterX + width / 2,
                    height: this.getOrderMarkerLabelHeight(
                        orderMarker.orderEvents.length
                    )
                };
            })
            .filter(Boolean)
            .sort((first, second) => first.left - second.left);
        const lanes = [];

        for (const interval of labelIntervals) {
            let lane = lanes.find(
                (candidate) =>
                    candidate.right + labelPadding <= interval.left
            );

            if (!lane) {
                lane = { right: interval.right, height: 0 };
                lanes.push(lane);
            }

            lane.right = interval.right;
            lane.height = Math.max(lane.height, interval.height);
        }

        if (lanes.length === 0) {
            return baselinePaddingPixels;
        }

        const labelsHeight = lanes.reduce(
            (total, lane) => total + lane.height,
            0
        );

        return Math.max(
            baselinePaddingPixels,
            labelsHeight + labelPadding * (lanes.length + 1)
        );
    }

    /*
     * This method chooses the first preferred vertical position for an order box.
     *
     * It looks at every candle underneath the box's horizontal width. Buy boxes
     * start below the lowest of those candles, while sell boxes start above the highest.
     *
     * Returns the preferred vertical center of the box in CSS pixels.
     */
    getOrderMarkerLabelY({
        labelCenterX,
        labelWidth,
        labelHeight,
        isBuy,
        priceRange
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
        const labelGap = 5;
        const aboveCenterY =
            highestY - labelGap - labelHeight / 2;
        const belowCenterY =
            lowestY + labelGap + labelHeight / 2;
        return isBuy ? belowCenterY : aboveCenterY;
    }

    /*
     * This method finds candles that would be covered by a proposed order box,
     * including the required empty space around the box.
     *
     * Returns an array containing the rectangle around every overlapping candle.
     */
    getOverlappingCandlestickBounds(
        bounds,
        priceRange,
        padding
    ) {
        return this.candlesticks
            .map((candlestick, index) => {
                const { centerX, bodyWidth } =
                    this.getCandleGeometry(index);

                return {
                    left: centerX - bodyWidth / 2,
                    right: centerX + bodyWidth / 2,
                    top: this.priceToY(
                        candlestick.highPrice,
                        priceRange
                    ),
                    bottom: this.priceToY(
                        candlestick.lowPrice,
                        priceRange
                    )
                };
            })
            .filter((candlestickBounds) => (
                bounds.left < candlestickBounds.right + padding &&
                bounds.right > candlestickBounds.left - padding &&
                bounds.top < candlestickBounds.bottom + padding &&
                bounds.bottom > candlestickBounds.top - padding
            ));
    }

    /*
     * This method moves an order box until it no longer covers candles or an
     * order box that was already placed.
     *
     * Buy boxes move downward and sell boxes move upward so each stays on the
     * expected side of its candle. The search stops if no valid location remains.
     *
     * Returns the accepted center and rectangle.
     * Returns null when the box cannot fit inside the chart without an overlap.
     */
    getAvailableOrderMarkerLabel({
        preferredCenterY,
        labelCenterX,
        labelWidth,
        labelHeight,
        isBuy,
        priceRange,
        plotArea,
        occupiedLabels
    }) {
        const labelPadding = 5;
        let centerY = preferredCenterY;
        const maximumAttempts =
            this.candlesticks.length + occupiedLabels.length + 1;

        for (
            let attempt = 0;
            attempt < maximumAttempts;
            attempt += 1
        ) {
            const bounds = {
                left: labelCenterX - labelWidth / 2,
                right: labelCenterX + labelWidth / 2,
                top: centerY - labelHeight / 2,
                bottom: centerY + labelHeight / 2
            };
            const labelFits =
                bounds.top >= plotArea.top &&
                bounds.bottom <= plotArea.bottom;
            const overlappingLabels = occupiedLabels.filter(
                (occupiedLabel) => (
                    bounds.left <
                        occupiedLabel.right + labelPadding &&
                    bounds.right >
                        occupiedLabel.left - labelPadding &&
                    bounds.top <
                        occupiedLabel.bottom + labelPadding &&
                    bounds.bottom >
                        occupiedLabel.top - labelPadding
                    )
            );
            const overlappingCandlesticks =
                this.getOverlappingCandlestickBounds(
                    bounds,
                    priceRange,
                    labelPadding
                );
            const obstacles = [
                ...overlappingLabels,
                ...overlappingCandlesticks
            ];

            if (labelFits && obstacles.length === 0) {
                return {
                    centerY,
                    bounds
                };
            }

            if (!labelFits) return null;

            if (isBuy) {
                const nextTop = Math.max(
                    ...obstacles.map((obstacle) => obstacle.bottom)
                ) + labelPadding;

                centerY = nextTop + labelHeight / 2;
            } else {
                const nextBottom = Math.min(
                    ...obstacles.map((obstacle) => obstacle.top)
                ) - labelPadding;

                centerY = nextBottom - labelHeight / 2;
            }
        }

        return null;
    }

    /*
     * This method draws a short horizontal line at an order's exact price.
     *
     * It first draws a slightly wider white line, then a black line on top. The
     * white edge keeps the black price line visible over a black candle body.
     *
     * It changes the canvas drawing and does not return a value.
     */
    drawOrderPriceLine(centerX, halfWidth, priceY) {
        this.ctx.strokeStyle = "#ffffff";
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.moveTo(centerX - halfWidth, priceY);
        this.ctx.lineTo(centerX + halfWidth, priceY);
        this.ctx.stroke();

        this.ctx.strokeStyle = "#000000";
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.moveTo(centerX - halfWidth, priceY);
        this.ctx.lineTo(centerX + halfWidth, priceY);
        this.ctx.stroke();
    }

    /*
     * This method draws one white order box with a black border and centered text
     * that may use several lines.
     *
     * It changes the canvas drawing and does not return a value.
     */
    drawOrderMarkerLabel(
        labelLines,
        centerX,
        centerY,
        width,
        height
    ) {
        const lineHeight = 12;

        this.ctx.fillStyle = "#ffffff";
        this.ctx.fillRect(
            centerX - width / 2,
            centerY - height / 2,
            width,
            height
        );
        this.ctx.strokeRect(
            centerX - width / 2,
            centerY - height / 2,
            width,
            height
        );

        this.ctx.fillStyle = "#000000";

        labelLines.forEach((labelLine, index) => {
            const labelY =
                centerY - height / 2 + 3 +
                lineHeight * (index + 0.5);

            this.ctx.fillText(labelLine, centerX, labelY);
        });
    }

    /*
     * This method groups all order markers, chooses non-overlapping box positions,
     * and draws their price lines and boxes.
     *
     * Drawing is restricted to the candle area. Nothing can paint over the chart
     * border, and markers do not change the canvas element's actual size.
     *
     * It changes the canvas drawing and does not return a value.
     */
    drawOrderMarkers() {
        if (this.orderMarkers.length === 0) return;

        const priceRange = this.getPriceRange();
        const plotArea = this.getPlotArea();
        const groupedOrderMarkers =
            this.getGroupedOrderMarkers();
        const occupiedLabels = [];

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

        groupedOrderMarkers.forEach((orderMarker) => {
            const candleIndex =
                this.getCandleIndexForTime(orderMarker.time);

            if (candleIndex === -1) return;

            const { centerX, bodyWidth } =
                this.getCandleGeometry(candleIndex);
            const isBuy = orderMarker.orderSide === "buy";
            const labelLines =
                this.getOrderMarkerLabelLines(orderMarker);
            const labelWidth =
                this.getOrderMarkerLabelWidth(labelLines);
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
            const preferredCenterY = this.getOrderMarkerLabelY({
                labelCenterX,
                labelWidth,
                labelHeight,
                isBuy,
                priceRange
            });
            const availableLabel =
                this.getAvailableOrderMarkerLabel({
                    preferredCenterY,
                    labelCenterX,
                    labelWidth,
                    labelHeight,
                    isBuy,
                    priceRange,
                    plotArea,
                    occupiedLabels
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

                this.drawOrderPriceLine(
                    centerX,
                    markerHalfWidth,
                    priceY
                );
            });

            if (availableLabel) {
                occupiedLabels.push(availableLabel.bounds);
                this.drawOrderMarkerLabel(
                    labelLines,
                    labelCenterX,
                    availableLabel.centerY,
                    labelWidth,
                    labelHeight
                );
            }
        });

        this.ctx.restore();
    }
}
