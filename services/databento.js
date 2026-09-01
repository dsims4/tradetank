const DATABENTO_REQUEST_TIMEOUT = 1000 * 30;

function isValidDatabentoCondition(value) {
    return [
        "available",
        "degraded",
        "pending",
        "missing"
    ].includes(value);
}

function getDatabentoAuthorization() {
    const apiKey = process.env.DATABENTO_API_KEY;

    if (!apiKey) {
        throw new Error("DATABENTO_API_KEY is required.");
    }

    const credentials =
        Buffer.from(`${apiKey}:`).toString("base64");

    return `Basic ${credentials}`;
}

function formatDatabentoPrice(value) {
    const valueIsNumeric =
        (typeof value === "string" && value !== "") ||
        typeof value === "number";

    return valueIsNumeric ? Number(value) : Number.NaN;
}

function formatDatabentoCandlestick(record) {
    return {
        openTime: new Date(record?.hd?.ts_event),
        openPrice: formatDatabentoPrice(record?.open),
        highPrice: formatDatabentoPrice(record?.high),
        lowPrice: formatDatabentoPrice(record?.low),
        closePrice: formatDatabentoPrice(record?.close)
    };
}

function parseDatabentoRecords(responseText) {
    if (typeof responseText !== "string") {
        throw new TypeError("The Databento response must be a string.");
    }

    return responseText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line));
}

function parseDatabentoCandlesticks(responseText) {
    return parseDatabentoRecords(responseText)
        .map((record) => formatDatabentoCandlestick(record));
}

function formatDatabentoStatus(record) {
    return {
        eventTime: new Date(record?.hd?.ts_event),
        reason: Number(record?.reason),
        tradingEvent: Number(record?.trading_event),
        isTrading: record?.is_trading
    };
}

function parseDatabentoStatuses(responseText) {
    return parseDatabentoRecords(responseText)
        .map((record) => formatDatabentoStatus(record));
}

async function fetchDatabentoResponse(schema, startTime, endTime) {
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
                Authorization: getDatabentoAuthorization()
            },
            body: requestBody,
            signal: AbortSignal.timeout(DATABENTO_REQUEST_TIMEOUT)
        }
    );

    if (!response.ok) {
        throw new Error(
            `The Databento request failed with status ${response.status}.`
        );
    }

    return response.text();
}

async function fetchDatabentoCandlesticks(startTime, endTime) {
    const responseText = await fetchDatabentoResponse(
        "ohlcv-1m",
        startTime,
        endTime
    );

    return parseDatabentoCandlesticks(responseText);
}

async function fetchDatabentoStatuses(startTime, endTime) {
    const responseText = await fetchDatabentoResponse(
        "status",
        startTime,
        endTime
    );

    return parseDatabentoStatuses(responseText);
}

function getScheduledDatabentoStatuses(statuses) {
    if (!Array.isArray(statuses)) {
        throw new TypeError("The Databento statuses must be in an array.");
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

function formatDatabentoTimeRange(range) {
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

async function fetchDatabentoAvailableRanges() {
    const parameters = new URLSearchParams({
        dataset: "GLBX.MDP3"
    });

    const response = await fetch(
        `https://hist.databento.com/v0/` +
        `metadata.get_dataset_range?${parameters}`,
        {
            headers: {
                Authorization: getDatabentoAuthorization()
            },
            signal: AbortSignal.timeout(DATABENTO_REQUEST_TIMEOUT)
        }
    );

    if (!response.ok) {
        throw new Error(
            `The Databento metadata request failed with ` +
            `status ${response.status}.`
        );
    }

    const responseData = await response.json();

    return {
        candlesticks: formatDatabentoTimeRange(
            responseData?.schema?.["ohlcv-1m"]
        ),
        statuses: formatDatabentoTimeRange(
            responseData?.schema?.status
        )
    };
}

async function fetchDatabentoCondition(tradingDate) {
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
                Authorization: getDatabentoAuthorization()
            },
            signal: AbortSignal.timeout(DATABENTO_REQUEST_TIMEOUT)
        }
    );

    if (!response.ok) {
        throw new Error(
            `The Databento condition request failed with ` +
            `status ${response.status}.`
        );
    }

    const responseData = await response.json();

    const condition = responseData.find(
        (record) => record?.date === tradingDate
    )?.condition;

    if (!isValidDatabentoCondition(condition)) {
        throw new Error(
            "Databento did not return a valid data condition."
        );
    }

    return condition;
}

async function isDatabentoRangeAvailable(schema, startTime, endTime) {
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
            "A valid Databento schema and time range are required."
        );
    }

    const availableRanges =
        await fetchDatabentoAvailableRanges();

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
    isValidDatabentoCondition,
    formatDatabentoCandlestick,
    parseDatabentoCandlesticks,
    fetchDatabentoCandlesticks,
    formatDatabentoStatus,
    parseDatabentoStatuses,
    fetchDatabentoStatuses,
    getScheduledDatabentoStatuses,
    isDatabentoRangeAvailable,
    fetchDatabentoCondition
};
