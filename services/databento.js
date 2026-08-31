function isValidDataBentoCondition(value) {
    return [
        "available",
        "degraded",
        "pending",
        "missing"
    ].includes(value);
}

function getDataBentoAuthorization() {
    const apiKey = process.env.DATABENTO_API_KEY;

    if (!apiKey) {
        throw new Error("DATABENTO_API_KEY is required.");
    }

    const credentials =
        Buffer.from(`${apiKey}:`).toString("base64");

    return `Basic ${credentials}`;
}

function formatDataBentoPrice(value) {
    const valueIsNumeric =
        (typeof value === "string" && value !== "") ||
        typeof value === "number";

    return valueIsNumeric ? Number(value) : Number.NaN;
}

function formatDataBentoCandlestick(record) {
    return {
        openTime: new Date(record?.hd?.ts_event),
        openPrice: formatDataBentoPrice(record?.open),
        highPrice: formatDataBentoPrice(record?.high),
        lowPrice: formatDataBentoPrice(record?.low),
        closePrice: formatDataBentoPrice(record?.close)
    };
}

function parseDataBentoRecords(responseText) {
    if (typeof responseText !== "string") {
        throw new TypeError("The DataBento response must be a string.");
    }

    return responseText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line));
}

function parseDataBentoCandlesticks(responseText) {
    return parseDataBentoRecords(responseText)
        .map((record) => formatDataBentoCandlestick(record));
}

function formatDataBentoStatus(record) {
    return {
        eventTime: new Date(record?.hd?.ts_event),
        reason: Number(record?.reason),
        tradingEvent: Number(record?.trading_event),
        isTrading: record?.is_trading
    };
}

function parseDataBentoStatuses(responseText) {
    return parseDataBentoRecords(responseText)
        .map((record) => formatDataBentoStatus(record));
}

async function fetchDataBentoResponse(schema, startTime, endTime) {
    const requestBody = new URLSearchParams({
        dataset: "GLBX.MDP3",
        symbols: "ES.v.0",
        stype_in: "continuous",
        schema,
        start: startTime.toISOString(),
        end: endTime.toISOString(),
        encoding: "json",
        pretty_px: "true",
        pretty_ts: "true",
        map_symbols: "true"
    });

    const response = await fetch(
        "https://hist.databento.com/v0/timeseries.get_range",
        {
            method: "POST",
            headers: {
                Authorization: getDataBentoAuthorization()
            },
            body: requestBody
        }
    );

    if (!response.ok) {
        throw new Error(
            `The DataBento request failed with status ${response.status}.`
        );
    }

    return response.text();
}

async function fetchDataBentoCandlesticks(startTime, endTime) {
    const responseText = await fetchDataBentoResponse(
        "ohlcv-1m",
        startTime,
        endTime
    );

    return parseDataBentoCandlesticks(responseText);
}

async function fetchDataBentoStatuses(startTime, endTime) {
    const responseText = await fetchDataBentoResponse(
        "status",
        startTime,
        endTime
    );

    return parseDataBentoStatuses(responseText);
}

function getScheduledDataBentoStatuses(statuses) {
    if (!Array.isArray(statuses)) {
        throw new TypeError("The DataBento statuses must be in an array.");
    }

    const uniqueStatuses = new Map();

    for (const status of statuses) {
        const eventTimeIsValid =
            status?.eventTime instanceof Date &&
            !Number.isNaN(status.eventTime.getTime());

        const statusIsRelevant =
            eventTimeIsValid &&
            status.reason === 1 &&
            status.tradingEvent === 0 &&
            ["Y", "N"].includes(status.isTrading);

        if (!statusIsRelevant) continue;

        const statusKey =
            `${status.eventTime.toISOString()}:${status.isTrading}`;

        if (!uniqueStatuses.has(statusKey)) uniqueStatuses.set(statusKey, status);
    }

    return [...uniqueStatuses.values()]
        .sort((first, second) => first.eventTime - second.eventTime);
}

function formatDataBentoTimeRange(range) {
    return {
        startTime: new Date(range?.start),
        endTime: new Date(range?.end)
    };
}

function isValidDate(value) {
    return (
        value instanceof Date &&
        !Number.isNaN(value.getTime())
    );
}

async function fetchDataBentoAvailableRanges() {
    const parameters = new URLSearchParams({
        dataset: "GLBX.MDP3"
    });

    const response = await fetch(
        `https://hist.databento.com/v0/` +
        `metadata.get_dataset_range?${parameters}`,
        {
            headers: {
                Authorization: getDataBentoAuthorization()
            }
        }
    );

    if (!response.ok) {
        throw new Error(
            `The DataBento metadata request failed with ` +
            `status ${response.status}.`
        );
    }

    const responseData = await response.json();

    return {
        candlesticks: formatDataBentoTimeRange(
            responseData?.schema?.["ohlcv-1m"]
        ),
        statuses: formatDataBentoTimeRange(
            responseData?.schema?.status
        )
    };
}

async function fetchDataBentoCondition(tradingDate) {
    if (
        typeof tradingDate !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(tradingDate)
    ) {
        throw new TypeError(
            "The trading date must use YYYY-MM-DD format."
        );
    }

    const parameters = new URLSearchParams({
        dataset: "GLBX.MDP3",
        start_date: tradingDate,
        end_date: tradingDate
    });

    const response = await fetch(
        `https://hist.databento.com/v0/` +
        `metadata.get_dataset_condition?${parameters}`,
        {
            headers: {
                Authorization: getDataBentoAuthorization()
            }
        }
    );

    if (!response.ok) {
        throw new Error(
            `The DataBento condition request failed with ` +
            `status ${response.status}.`
        );
    }

    const responseData = await response.json();

    const condition = responseData.find(
        (record) => record?.date === tradingDate
    )?.condition;

    if (!isValidDataBentoCondition(condition)) {
        throw new Error(
            "DataBento did not return a valid data condition."
        );
    }

    return condition;
}

async function isDataBentoRangeAvailable(schema, startTime, endTime) {
    const rangeNames = {
        "ohlcv-1m": "candlesticks",
        status: "statuses"
    };

    const rangeName = rangeNames[schema];

    if (
        !rangeName ||
        !isValidDate(startTime) ||
        !isValidDate(endTime) ||
        startTime >= endTime
    ) {
        throw new TypeError(
            "A valid DataBento schema and time range are required."
        );
    }

    const availableRanges =
        await fetchDataBentoAvailableRanges();

    const availableRange = availableRanges[rangeName];

    if (
        !isValidDate(availableRange.startTime) ||
        !isValidDate(availableRange.endTime)
    ) {
        return false;
    }

    return (
        startTime >= availableRange.startTime &&
        endTime <= availableRange.endTime
    );
}

module.exports = {
    isValidDataBentoCondition,
    formatDataBentoCandlestick,
    parseDataBentoCandlesticks,
    fetchDataBentoCandlesticks,
    formatDataBentoStatus,
    parseDataBentoStatuses,
    fetchDataBentoStatuses,
    getScheduledDataBentoStatuses,
    isDataBentoRangeAvailable,
    fetchDataBentoCondition
};