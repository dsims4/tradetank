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
    const tradeSummaries = document.querySelector(
        "[data-trade-summaries]"
    );
    const deleteButton = document.querySelector(
        "[data-delete-trading-day]"
    );

    if (
        !canvas ||
        !chartContainer ||
        !controls ||
        !dateInput ||
        !status ||
        !tradeSummaries ||
        !deleteButton
    ) {
        return;
    }

    const chart = new CandlestickChart(canvas);

    const resizeObserver =
        new ResizeObserver(() => chart.resize());

    resizeObserver.observe(chartContainer);
    chart.resize();

    async function loadChart(tradingDate = "") {
        const searchParameters = new URLSearchParams();

        if (tradingDate) {
            searchParameters.set("date", tradingDate);
        }

        const query = searchParameters.toString();
        const requestURL =
            `/api/trades-chart${query ? `?${query}` : ""}`;

        status.textContent = "Loading chart...";
        tradeSummaries.replaceChildren();
        deleteButton.hidden = true;

        try {
            const response = await fetch(requestURL);
            const responseIsJSON =
                response.headers
                    .get("content-type")
                    ?.includes("application/json");
            const responseData = responseIsJSON
                ? await response.json()
                : {};

            if (!response.ok) {
                throw new Error(
                    responseData.error ||
                    "The chart request failed."
                );
            }

            chart.setCandlesticks(
                responseData.candlesticks
            );
            chart.setOrderMarkers([]);

            if (responseData.tradingDate) {
                dateInput.value = responseData.tradingDate;
            }

            deleteButton.hidden = !responseData.hasTrades;

            status.textContent = responseData.hasTrades
                ? `Loaded ${responseData.trades.length} trades.`
                : "No submitted trades were found.";
        } catch (error) {
            chart.setCandlesticks([]);
            chart.setOrderMarkers([]);
            status.textContent = error.message;
        }
    }

    controls.addEventListener("submit", (event) => {
        event.preventDefault();

        dateInput.value = dateInput.value.trim();

        if (!controls.reportValidity()) return;

        loadChart(dateInput.value);
    });

    loadChart();    
}

runTradesChart();