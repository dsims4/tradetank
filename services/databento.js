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
    const apiKey = process.env.DATABENTO_API_KEY;

    if (!apiKey) {
        throw new Error("DATABENTO_API_KEY is required.");
    }

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

    const credentials = Buffer.from(`${apiKey}:`).toString("base64");

    const response = await fetch(
        "https://hist.databento.com/v0/timeseries.get_range",
        {
            method: "POST",
            headers: {
                Authorization: `Basic ${credentials}`
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

module.exports = {
    formatDataBentoCandlestick,
    parseDataBentoCandlesticks,
    fetchDataBentoCandlesticks,
    formatDataBentoStatus,
    parseDataBentoStatuses,
    fetchDataBentoStatuses,
    getScheduledDataBentoStatuses
};