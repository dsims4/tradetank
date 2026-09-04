const TRADE_Y_AXES = [
    "cumulativePoints",
    "cumulativePointsPerContract",
    "cumulativePointsPerTrade",
    "cumulativePointsPerDay",
    "cumulativeTrades",
    "cumulativeProcessDeviationTrades",
    "cumulativeProcessFollowingTrades",
    "cumulativeProfitableTrades",
    "positiveEVTradeRate",
    "negativeEVTradeRate",
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

function createVisualizationSVGElement(name) {
    return document.createElementNS(
        "http://www.w3.org/2000/svg",
        name
    );
}

function formatVisualizationNumber(value) {
    if (!Number.isFinite(value)) return "—";

    return Number(value.toFixed(3)).toString();
}

function renderVisualizationChart(chart, responseData) {
    const series = chart.querySelector("[data-visualize-series]");
    const lastPoint = chart.querySelector(
        "[data-visualize-last-point]"
    );
    const emptyMessage = chart.querySelector(
        ".visualize-chart-empty-message"
    );
    const xTicks = chart.querySelector("[data-visualize-x-ticks]");
    const yTicks = chart.querySelector("[data-visualize-y-ticks]");
    const points = responseData.points;

    xTicks.replaceChildren();
    yTicks.replaceChildren();

    if (points.length === 0) {
        series.hidden = true;
        lastPoint.hidden = true;
        emptyMessage.hidden = false;
        emptyMessage.textContent = "No trades in this range";
        return;
    }

    const plot = {
        left: 50,
        right: 900,
        top: 40,
        bottom: 465
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

    series.setAttribute("d", path);
    series.hidden = false;
    lastPoint.setAttribute("cx", scaleX(finalPoint.x));
    lastPoint.setAttribute("cy", scaleY(finalPoint.y));
    lastPoint.hidden = false;
    emptyMessage.hidden = true;

    for (let index = 0; index <= 4; index += 1) {
        const portion = index / 4;
        const xValue = xMinimum + (xMaximum - xMinimum) * portion;
        const yValue = yMinimum + (yMaximum - yMinimum) * portion;
        const xLabel = createVisualizationSVGElement("text");
        const yLabel = createVisualizationSVGElement("text");

        xLabel.setAttribute("x", scaleX(xValue));
        xLabel.setAttribute("y", "490");
        xLabel.setAttribute("text-anchor", "middle");
        xLabel.textContent = responseData.xIsTime
            ? new Date(xValue).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "2-digit"
            })
            : formatVisualizationNumber(xValue);

        yLabel.setAttribute("x", "890");
        yLabel.setAttribute("y", scaleY(yValue) + 5);
        yLabel.setAttribute("text-anchor", "end");
        yLabel.textContent = responseData.yIsRate
            ? `${formatVisualizationNumber(yValue * 100)}%`
            : formatVisualizationNumber(yValue);

        xTicks.append(xLabel);
        yTicks.append(yLabel);
    }
}

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

        function closeOptions() {
            options.hidden = true;
            toggle.setAttribute("aria-expanded", "false");
        }

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
        ".visualize-chart-axis-label:not([transform])"
    );
    const yAxisLabel = document.querySelector(
        ".visualize-chart-axis-label[transform]"
    );
    const chart = document.querySelector(".visualize-chart");
    const emptyMessage = chart.querySelector(
        ".visualize-chart-empty-message"
    );
    const slope = document.querySelector("[data-visualize-slope]");
    const maximumDrawdown = document.querySelector(
        "[data-visualize-drawdown]"
    );
    let visualizationRequestID = 0;
    let dateRangeIsInitialized = false;

    function getSelectedLabel(select) {
        return select.options[select.selectedIndex].text.trim();
    }

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

        emptyMessage.hidden = false;
        emptyMessage.textContent = "Loading visualization...";

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

            renderVisualizationChart(chart, responseData);
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

            chart.querySelector("[data-visualize-series]").hidden = true;
            chart.querySelector(
                "[data-visualize-last-point]"
            ).hidden = true;
            emptyMessage.hidden = false;
            emptyMessage.textContent = error.message;
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
