/*
 * These lists define which measurements may appear on the Visualize chart.
 *
 * The browser and server use the same rules. This prevents the dropdown from
 * offering a combination that the server would reject.
 */
const TRADE_Y_AXES = [
    "cumulativePoints",
    "expectedValuePerContract",
    "expectedValuePerTrade",
    "expectedValuePerTradingDay",
    "cumulativeTrades",
    "cumulativeProcessDeviationTrades",
    "cumulativeProcessFollowingTrades",
    "cumulativeProfitableTrades",
    "profitableTradeRate",
    "losingTradeRate",
    "breakevenTradeRate",
    "processDeviationTradeRate",
    "processFollowingTradeRate",
    "longTradeRate",
    "shortTradeRate",
    "scalingTradeRate",
    "nonScalingTradeRate",
    "cumulativeLosingTrades",
    "cumulativeBreakevenTrades",
    "cumulativeLongTrades",
    "cumulativeShortTrades",
    "cumulativeScalingTrades",
    "cumulativeNonScalingTrades"
];
const DAY_Y_AXES = [
    ...TRADE_Y_AXES,
    "cumulativeProfitableDays",
    "cumulativeLosingDays",
    "cumulativeBreakevenDays",
    "profitableDayRate",
    "losingDayRate",
    "breakevenDayRate"
];
const MATCHING_Y_AXIS = new Map([
    ["trades", "cumulativeTrades"],
    ["tradingDays", "cumulativeTradingDays"],
    ["processDeviationTrades", "cumulativeProcessDeviationTrades"],
    ["processFollowingTrades", "cumulativeProcessFollowingTrades"],
    ["longTrades", "cumulativeLongTrades"],
    ["shortTrades", "cumulativeShortTrades"],
    ["scalingTrades", "cumulativeScalingTrades"],
    ["nonScalingTrades", "cumulativeNonScalingTrades"]
]);
const VISUALIZATION_CHART_STATES = new WeakMap();
const VISUALIZATION_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
});
const VISUALIZATION_TIME_FORMATTER = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit"
});

/*
 * This function finds every y-axis choice that makes sense with one x-axis choice.
 *
 * Returns a new Set of allowed names. A Set makes it easy to ask whether a
 * particular name is allowed and cannot change the original lists.
 */
function getValidYAxisValues(xAxis) {
    if (xAxis === "time") {
        return new Set([
            ...DAY_Y_AXES,
            "cumulativeTradingDays"
        ]);
    }

    if (xAxis === "tradingDays") {
        return new Set(DAY_Y_AXES);
    }

    const matchingYAxis = MATCHING_Y_AXIS.get(xAxis);

    return new Set(
        TRADE_Y_AXES.filter((yAxis) => yAxis !== matchingYAxis)
    );
}

/*
 * This function creates a shape or text element for the SVG chart.
 * SVG is the browser format used to draw the Visualize chart.
 *
 * Returns the new SVG element with the requested type, such as text or path.
 */
function createVisualizationSVGElement(name) {
    return document.createElementNS(
        "http://www.w3.org/2000/svg",
        name
    );
}

/*
 * This function shows or hides an SVG chart element.
 *
 * This function does not return a value.
 */
function setVisualizationElementHidden(element, shouldHide) {
    element.toggleAttribute("hidden", shouldHide);
}

/*
 * This function formats a normal chart number with at most three decimal places.
 *
 * Returns an em dash when the value is Infinity, negative Infinity, or NaN.
 * Otherwise, returns the number as compact text without unnecessary ending zeroes.
 */
function formatVisualizationNumber(value) {
    if (!Number.isFinite(value)) return "—";

    return Number(value.toFixed(3)).toString();
}

/*
 * This function converts an exact time into its New York calendar date.
 *
 * Returns a YYYY-MM-DD string, including leading zeroes for month and day.
 */
function formatVisualizationDate(value) {
    const parts = VISUALIZATION_DATE_FORMATTER.formatToParts(
        new Date(value)
    );
    const dateParts = Object.fromEntries(
        parts.map((part) => [part.type, part.value])
    );

    return `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
}

/*
 * This function forgets the number ranges used by a chart's crosshair and hides
 * both crosshair lines.
 *
 * This function does not return a value.
 */
function clearVisualizationCrosshair(chart) {
    VISUALIZATION_CHART_STATES.delete(chart);
    setVisualizationElementHidden(
        chart.querySelector("[data-visualize-crosshair]"),
        true
    );
}

/*
 * This function formats a crosshair x value for its axis type.
 *
 * A time value includes its New York date and time. Any other value uses the
 * normal chart-number formatter.
 *
 * Returns the complete text shown underneath the crosshair.
 */
function formatVisualizationCrosshairX(value, xIsTime) {
    if (!xIsTime) return formatVisualizationNumber(value);

    const time = VISUALIZATION_TIME_FORMATTER.format(new Date(value));

    return `${formatVisualizationDate(value)} ${time}`;
}

/*
 * This function formats a crosshair y value for its axis type.
 *
 * Returns a rate multiplied by 100 with a percent sign.
 * Returns every other value as a plain formatted number.
 */
function formatVisualizationCrosshairY(value, yIsRate) {
    return yIsRate
        ? `${formatVisualizationNumber(value * 100)}%`
        : formatVisualizationNumber(value);
}

/*
 * This function converts the pointer's screen position into a position inside
 * the SVG chart.
 *
 * Returns the converted point. Returns null when the browser cannot provide the
 * conversion information needed for this chart.
 */
function getVisualizationPointer(chart, event) {
    const point = chart.createSVGPoint();
    const screenMatrix = chart.getScreenCTM();

    if (!screenMatrix) return null;

    point.x = event.clientX;
    point.y = event.clientY;

    return point.matrixTransform(screenMatrix.inverse());
}

/*
 * This function moves and labels the visualization crosshair.
 *
 * The pointer position is rounded to one of 100 small steps across each axis.
 * This avoids needless tiny updates while still appearing smooth. The crosshair
 * is hidden outside the white plotting area. This function does not return a value.
 */
function updateVisualizationCrosshair(chart, event) {
    const state = VISUALIZATION_CHART_STATES.get(chart);
    const pointer = getVisualizationPointer(chart, event);

    if (!state || !pointer) return;

    const { plot } = state;
    const crosshair = chart.querySelector(
        "[data-visualize-crosshair]"
    );

    if (
        pointer.x < plot.left ||
        pointer.x > plot.right ||
        pointer.y < plot.top ||
        pointer.y > plot.bottom
    ) {
        setVisualizationElementHidden(crosshair, true);
        return;
    }

    /*
     * Round the horizontal and vertical positions to hundredths of the plot.
     * This keeps motion smooth without updating for every individual screen pixel.
     */
    const xPortion = Math.round(
        (pointer.x - plot.left) /
        (plot.right - plot.left) * 100
    ) / 100;
    const yPortion = Math.round(
        (pointer.y - plot.top) /
        (plot.bottom - plot.top) * 100
    ) / 100;
    const x = plot.left +
        xPortion * (plot.right - plot.left);
    const y = plot.top +
        yPortion * (plot.bottom - plot.top);
    const xValue = state.xMinimum +
        xPortion * (state.xMaximum - state.xMinimum);
    const yValue = state.yMaximum -
        yPortion * (state.yMaximum - state.yMinimum);
    const verticalLine = crosshair.querySelector(
        "[data-visualize-crosshair-vertical]"
    );
    const horizontalLine = crosshair.querySelector(
        "[data-visualize-crosshair-horizontal]"
    );
    const xLabel = crosshair.querySelector(
        "[data-visualize-crosshair-x-label]"
    );
    const yLabel = crosshair.querySelector(
        "[data-visualize-crosshair-y-label]"
    );
    const xLabelWidth = 160;
    const xLabelLeft = Math.min(
        plot.right - xLabelWidth,
        Math.max(plot.left, x - xLabelWidth / 2)
    );

    verticalLine.setAttribute("x1", x);
    verticalLine.setAttribute("x2", x);
    verticalLine.setAttribute("y1", plot.top);
    verticalLine.setAttribute("y2", plot.bottom);
    horizontalLine.setAttribute("x1", plot.left);
    horizontalLine.setAttribute("x2", plot.right);
    horizontalLine.setAttribute("y1", y);
    horizontalLine.setAttribute("y2", y);
    xLabel.setAttribute(
        "transform",
        `translate(${xLabelLeft} ${plot.bottom})`
    );
    yLabel.setAttribute(
        "transform",
        `translate(${plot.right} ${y - 13})`
    );
    xLabel.querySelector("text").textContent =
        formatVisualizationCrosshairX(xValue, state.xIsTime);
    yLabel.querySelector("text").textContent =
        formatVisualizationCrosshairY(yValue, state.yIsRate);
    setVisualizationElementHidden(crosshair, false);
}

/*
 * This function adds crosshair pointer behavior to one visualization chart.
 *
 * Moving inside updates the lines and values. Leaving the SVG hides them.
 * This function does not return a value.
 */
function runVisualizationCrosshair(chart) {
    chart.addEventListener("pointermove", (event) => {
        updateVisualizationCrosshair(chart, event);
    });
    chart.addEventListener("pointerleave", () => {
        setVisualizationElementHidden(
            chart.querySelector("[data-visualize-crosshair]"),
            true
        );
    });
}

/*
 * This function draws API visualization data inside the SVG chart.
 *
 * It finds useful lowest and highest axis values, draws the line and its final
 * point, creates five labels on each axis, and remembers the number ranges used
 * by the crosshair.
 *
 * Returns true when at least one point was drawn. Returns false for no points.
 */
function renderVisualizationChart(chart, responseData) {
    const series = chart.querySelector("[data-visualize-series]");
    const lastPoint = chart.querySelector(
        "[data-visualize-last-point]"
    );
    const xTicks = chart.querySelector("[data-visualize-x-ticks]");
    const yTicks = chart.querySelector("[data-visualize-y-ticks]");
    const points = responseData.points;

    xTicks.replaceChildren();
    yTicks.replaceChildren();

    if (points.length === 0) {
        setVisualizationElementHidden(series, true);
        setVisualizationElementHidden(lastPoint, true);
        clearVisualizationCrosshair(chart);
        return false;
    }

    const plot = {
        left: 30,
        right: 870,
        top: 25,
        bottom: 490
    };
    const xValues = points.map((point) => point.x);
    const yValues = points.map((point) => point.y);
    let xMinimum = xValues.reduce(
        (minimum, value) => Math.min(minimum, value),
        Infinity
    );
    let xMaximum = xValues.reduce(
        (maximum, value) => Math.max(maximum, value),
        -Infinity
    );

    if (!responseData.xIsTime) xMinimum = Math.min(0, xMinimum);
    let yMinimum = responseData.yIsRate
        ? 0
        : yValues.reduce(
            (minimum, value) => Math.min(minimum, value),
            0
        );
    let yMaximum = responseData.yIsRate
        ? 1
        : yValues.reduce(
            (maximum, value) => Math.max(maximum, value),
            0
        );

    if (xMinimum === xMaximum) {
        xMinimum -= 0.5;
        xMaximum += 0.5;
    }

    if (yMinimum === yMaximum) {
        yMinimum -= 1;
        yMaximum += 1;
    } else if (!responseData.yIsRate) {
        const padding = (yMaximum - yMinimum) * 0.08;

        yMinimum -= padding;
        yMaximum += padding;
    }

    /*
     * These two helpers convert real x and y data values into drawing positions
     * inside the chart's white plotting rectangle.
     */
    const scaleX = (value) =>
        plot.left +
        (value - xMinimum) /
            (xMaximum - xMinimum) *
            (plot.right - plot.left);
    const scaleY = (value) =>
        plot.bottom -
        (value - yMinimum) /
            (yMaximum - yMinimum) *
            (plot.bottom - plot.top);
    const path = points.map((point, index) =>
        `${index === 0 ? "M" : "L"} ` +
        `${scaleX(point.x)} ${scaleY(point.y)}`
    ).join(" ");
    const finalPoint = points[points.length - 1];

    VISUALIZATION_CHART_STATES.set(chart, {
        plot,
        xMinimum,
        xMaximum,
        yMinimum,
        yMaximum,
        xIsTime: responseData.xIsTime,
        yIsRate: responseData.yIsRate
    });

    series.setAttribute("d", path);
    setVisualizationElementHidden(series, false);
    lastPoint.setAttribute("cx", scaleX(finalPoint.x));
    lastPoint.setAttribute("cy", scaleY(finalPoint.y));
    setVisualizationElementHidden(lastPoint, false);

    for (let index = 0; index <= 4; index += 1) {
        const portion = index / 4;
        const xValue = xMinimum + (xMaximum - xMinimum) * portion;
        const yValue = yMinimum + (yMaximum - yMinimum) * portion;
        const xLabel = createVisualizationSVGElement("text");
        const yLabel = createVisualizationSVGElement("text");

        xLabel.setAttribute("x", scaleX(xValue));
        xLabel.setAttribute("y", plot.bottom + 38);
        xLabel.setAttribute(
            "text-anchor",
            index === 0
                ? "start"
                : index === 4
                    ? "end"
                    : "middle"
        );
        xLabel.textContent = responseData.xIsTime
            ? formatVisualizationDate(xValue)
            : formatVisualizationNumber(xValue);

        yLabel.setAttribute("x", plot.right + 20);
        yLabel.setAttribute("y", scaleY(yValue) + 5);
        yLabel.setAttribute("text-anchor", "start");
        yLabel.textContent = responseData.yIsRate
            ? `${formatVisualizationNumber(yValue * 100)}%`
            : formatVisualizationNumber(yValue);

        xTicks.append(xLabel);
        yTicks.append(yLabel);
    }

    return true;
}

/*
 * This function builds styled dropdown controls around the browser's normal
 * select elements.
 *
 * The original select remains the official value submitted to page logic. The
 * new buttons copy its groups, choices, and disabled states. They also send the
 * same change events and support both mouse and keyboard use.
 *
 * This function does not return a value.
 */
function runVisualizeSelects() {
    const visualizeSelects = document.querySelectorAll(
        "[data-visualize-select]"
    );

    visualizeSelects.forEach((visualizeSelect) => {
        const select = visualizeSelect.querySelector("select");
        const toggle = visualizeSelect.querySelector(
            "[data-visualize-select-toggle]"
        );
        const selectedValue = visualizeSelect.querySelector(
            "[data-visualize-select-value]"
        );
        const options = visualizeSelect.querySelector(
            "[data-visualize-select-options]"
        );

        /*
         * This function closes this custom select's option list.
         *
         * This function does not return a value.
         */
        function closeOptions() {
            options.hidden = true;
            toggle.setAttribute("aria-expanded", "false");
        }

        /*
         * This function closes every other styled dropdown and opens this one.
         *
         * Keyboard focus moves to the selected choice when possible.
         * This function does not return a value.
         */
        function openOptions() {
            document.querySelectorAll(
                "[data-visualize-select-options]"
            ).forEach((otherOptions) => {
                if (otherOptions !== options) otherOptions.hidden = true;
            });
            document.querySelectorAll(
                "[data-visualize-select-toggle]"
            ).forEach((otherToggle) => {
                if (otherToggle !== toggle) {
                    otherToggle.setAttribute("aria-expanded", "false");
                }
            });

            options.hidden = false;
            toggle.setAttribute("aria-expanded", "true");
            options.querySelector("[aria-selected='true']")?.focus();
        }

        let currentGroup = "";

        /*
         * Create one button for each normal select option. An optgroup is a
         * labeled group of related options; its label is added once at the start
         * of that group.
         */
        Array.from(select.options).forEach((option) => {
            const group = option.parentElement.tagName === "OPTGROUP"
                ? option.parentElement.label
                : "";
            const optionButton = document.createElement("button");

            if (group && group !== currentGroup) {
                const groupLabel = document.createElement("p");

                groupLabel.className = "visualize-select-group";
                groupLabel.setAttribute("role", "presentation");
                groupLabel.dataset.visualizeOptionGroup = group;
                groupLabel.textContent = group;
                options.append(groupLabel);
                currentGroup = group;
            }

            optionButton.type = "button";
            optionButton.className = "visualize-select-option";
            optionButton.setAttribute("role", "option");
            optionButton.setAttribute(
                "aria-selected",
                String(option.selected)
            );
            optionButton.dataset.group = group;
            optionButton.dataset.value = option.value;
            optionButton.textContent = option.text.trim();
            optionButton.addEventListener("click", () => {
                select.value = option.value;
                select.dispatchEvent(new Event("change", {
                    bubbles: true
                }));
                selectedValue.textContent = option.text.trim();
                options.querySelectorAll("[role='option']")
                    .forEach((otherOption) => {
                        otherOption.setAttribute(
                            "aria-selected",
                            String(otherOption === optionButton)
                        );
                    });
                closeOptions();
                toggle.focus();
            });
            options.append(optionButton);
        });

        /*
         * Clicking the custom select toggle opens or closes its options.
         */
        toggle.addEventListener("click", () => {
            if (options.hidden) {
                openOptions();
            } else {
                closeOptions();
            }
        });

        toggle.addEventListener("keydown", (event) => {
            if (event.key === "ArrowDown" && options.hidden) {
                event.preventDefault();
                openOptions();
            }
        });

        /*
         * Arrow, Home, and End keys move focus among visible enabled options.
         */
        options.addEventListener("keydown", (event) => {
            const optionButtons = Array.from(
                options.querySelectorAll("[role='option']")
            ).filter((option) => !option.hidden && !option.disabled);
            const currentIndex = optionButtons.indexOf(
                document.activeElement
            );
            let nextIndex = currentIndex;

            if (event.key === "ArrowDown") {
                nextIndex = Math.min(
                    currentIndex + 1,
                    optionButtons.length - 1
                );
            } else if (event.key === "ArrowUp") {
                nextIndex = Math.max(currentIndex - 1, 0);
            } else if (event.key === "Home") {
                nextIndex = 0;
            } else if (event.key === "End") {
                nextIndex = optionButtons.length - 1;
            } else {
                return;
            }

            event.preventDefault();
            optionButtons[nextIndex]?.focus();
        });

        visualizeSelect.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && !options.hidden) {
                closeOptions();
                toggle.focus();
            }
        });

        document.addEventListener("click", (event) => {
            if (!visualizeSelect.contains(event.target)) closeOptions();
        });
    });
}

/*
 * This function initializes the Visualize page's data workflow.
 *
 * It checks axis combinations, controls optional starting and ending dates,
 * requests chart data, and draws the chart and summary values. If either axis
 * dropdown is missing, it stops without changing the page.
 *
 * This function does not return a value.
 */
function runVisualizePage() {
    const xAxisSelect = document.querySelector(
        "[data-visualize-x-axis]"
    );
    const yAxisSelect = document.querySelector(
        "[data-visualize-y-axis]"
    );

    if (!xAxisSelect || !yAxisSelect) return;

    const relationship = document.querySelector(
        "[data-visualize-relationship]"
    );
    const datePickers = document.querySelectorAll(
        ".visualize-axis-sidebar [data-date-picker]"
    );
    const xAxisLabel = document.querySelector(
        "[data-visualize-x-axis-label]"
    );
    const yAxisLabel = document.querySelector(
        "[data-visualize-y-axis-label]"
    );
    const chart = document.querySelector(".visualize-chart");
    const slope = document.querySelector("[data-visualize-slope]");
    const maximumDrawdown = document.querySelector(
        "[data-visualize-drawdown]"
    );
    let visualizationRequestID = 0;
    let dateRangeIsInitialized = false;

    runVisualizationCrosshair(chart);

    /*
     * This function reads the visible words for a normal select's current choice.
     *
     * Returns the label text with extra outside spaces removed.
     */
    function getSelectedLabel(select) {
        return select.options[select.selectedIndex].text.trim();
    }

    /*
     * This function enables only y-axis choices that make sense with the current x-axis.
     *
     * If changing x makes the current y choice invalid, the first valid y choice
     * is selected. The normal and styled dropdowns are always updated together.
     *
     * This function does not return a value.
     */
    function updateYAxisOptions() {
        const validYAxisValues = getValidYAxisValues(
            xAxisSelect.value
        );
        const yAxisWrapper = yAxisSelect.closest(
            "[data-visualize-select]"
        );
        const customOptions = new Map(
            Array.from(yAxisWrapper.querySelectorAll(
                "[data-value]"
            )).map((option) => [option.dataset.value, option])
        );

        Array.from(yAxisSelect.options).forEach((option) => {
            const isValid = validYAxisValues.has(option.value);
            const customOption = customOptions.get(option.value);

            option.disabled = !isValid;
            option.hidden = !isValid;
            customOption.disabled = !isValid;
            customOption.hidden = !isValid;
        });

        if (!validYAxisValues.has(yAxisSelect.value)) {
            yAxisSelect.value = Array.from(yAxisSelect.options)
                .find((option) => !option.disabled).value;
        }

        const selectedValue = yAxisWrapper.querySelector(
            "[data-visualize-select-value]"
        );

        selectedValue.textContent = getSelectedLabel(yAxisSelect);
        customOptions.forEach((option, value) => {
            option.setAttribute(
                "aria-selected",
                String(value === yAxisSelect.value)
            );
        });
        yAxisWrapper.querySelectorAll(
            "[data-visualize-option-group]"
        ).forEach((groupLabel) => {
            groupLabel.hidden = !Array.from(customOptions.values())
                .some((option) =>
                    option.dataset.group ===
                        groupLabel.dataset.visualizeOptionGroup &&
                    !option.hidden
                );
        });
    }

    /*
     * This function updates the visible labels and date controls after an axis changes.
     *
     * Date inputs work only when time is the x-axis. The newly selected chart is
     * requested immediately.
     *
     * This function does not return a value.
     */
    function updateAxisControls() {
        updateYAxisOptions();

        const xAxisName = getSelectedLabel(xAxisSelect);
        const yAxisName = getSelectedLabel(yAxisSelect);
        const hasTimeAxis = xAxisSelect.value === "time";

        relationship.textContent =
            `${xAxisName} compared with ${yAxisName}.`;
        xAxisLabel.textContent = `X-axis: ${xAxisName}`;
        yAxisLabel.textContent = `Y-axis: ${yAxisName}`;

        datePickers.forEach((datePicker) => {
            const dateInput = datePicker.querySelector(
                "[data-visualize-date]"
            );
            const dateToggle = datePicker.querySelector(
                "[data-date-picker-toggle]"
            );
            const datePopup = datePicker.querySelector(
                "[data-date-picker-popup]"
            );

            dateInput.disabled = !hasTimeAxis;
            dateToggle.disabled = !hasTimeAxis;
            dateToggle.setAttribute("aria-expanded", "false");

            if (!hasTimeAxis) datePopup.hidden = true;
        });

        loadVisualization();
    }

    /*
     * This function requests and renders the selected visualization.
     *
     * Valid time-axis dates are added to the API address. Each request gets an
     * increasing number. If an older request finishes after a newer one, its
     * number reveals that it is old and its result is ignored.
     *
     * Returns a Promise that finishes after the response has been handled.
     */
    async function loadVisualization() {
        const requestID = ++visualizationRequestID;
        const searchParameters = new URLSearchParams({
            xAxis: xAxisSelect.value,
            yAxis: yAxisSelect.value
        });

        if (xAxisSelect.value === "time") {
            const [fromInput, toInput] = datePickers;
            const fromDate = fromInput.querySelector(
                "[data-visualize-date]"
            ).value;
            const toDate = toInput.querySelector(
                "[data-visualize-date]"
            ).value;

            if (/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) {
                searchParameters.set("from", fromDate);
            }

            if (/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
                searchParameters.set("to", toDate);
            }
        }

        const relationshipText =
            `${getSelectedLabel(xAxisSelect)} compared with ` +
            `${getSelectedLabel(yAxisSelect)}.`;

        relationship.textContent = "Loading visualization...";
        clearVisualizationCrosshair(chart);

        try {
            const response = await fetch(
                `/api/visualize?${searchParameters}`
            );
            const responseData = await readAPIResponse(
                response,
                "The visualization could not be loaded."
            );

            if (requestID !== visualizationRequestID) return;

            if (!dateRangeIsInitialized) {
                const [fromPicker, toPicker] = datePickers;

                fromPicker.querySelector(
                    "[data-visualize-date]"
                ).value = responseData.availableFrom || "";
                toPicker.querySelector(
                    "[data-visualize-date]"
                ).value = responseData.availableTo || "";
                dateRangeIsInitialized = true;
            }

            const chartHasPoints = renderVisualizationChart(
                chart,
                responseData
            );

            relationship.textContent = chartHasPoints
                ? relationshipText
                : "No trades were found in this range.";
            slope.textContent = responseData.slope === null
                ? "—"
                : formatVisualizationNumber(responseData.slope);
            if (responseData.points.length === 0) {
                maximumDrawdown.textContent = "—";
            } else {
                maximumDrawdown.textContent = responseData.yIsRate
                    ? `${formatVisualizationNumber(
                        responseData.maximumDrawdown * 100
                    )} percentage points`
                    : formatVisualizationNumber(
                        responseData.maximumDrawdown
                    );
            }
        } catch (error) {
            if (requestID !== visualizationRequestID) return;

            setVisualizationElementHidden(
                chart.querySelector("[data-visualize-series]"),
                true
            );
            setVisualizationElementHidden(
                chart.querySelector("[data-visualize-last-point]"),
                true
            );
            clearVisualizationCrosshair(chart);
            relationship.textContent = error.message;
            slope.textContent = "—";
            maximumDrawdown.textContent = "—";
        }
    }

    xAxisSelect.addEventListener("change", updateAxisControls);
    yAxisSelect.addEventListener("change", updateAxisControls);
    datePickers.forEach((datePicker) => {
        datePicker.querySelector("[data-visualize-date]")
            .addEventListener("change", loadVisualization);
    });
    updateAxisControls();
}

runVisualizeSelects();
runVisualizePage();
