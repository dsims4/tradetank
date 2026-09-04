/** Requests Databento market data and changes its responses into app objects. */
const DATABENTO_REQUEST_TIMEOUT = 1000 * 30;

/*
 * This function checks whether a value is one of the four Databento data
 * statuses understood by Trade Tank.
 *
 * Returns true for "available," "degraded," "pending," or "missing."
 * Returns false for every other value.
 */
function isValidDatabentoCondition(value) {
    return [
        "available",
        "degraded",
        "pending",
        "missing"
    ].includes(value);
}

/*
 * This function creates the login header required by Databento.
 *
 * Databento expects the API key in the username position and an empty password.
 * The resulting text is Base64 encoded because HTTP Basic authentication
 * requires that format. Base64 is formatting, not encryption; HTTPS protects
 * the request while it travels over the network.
 *
 * Returns the complete Authorization-header value.
 * Throws an error when the API key has not been configured.
 */
function getDatabentoAuthorization() {
    const apiKey = process.env.DATABENTO_API_KEY;

    if (!apiKey) {
        throw new Error("DATABENTO_API_KEY is required.");
    }

    const credentials =
        Buffer.from(`${apiKey}:`).toString("base64");

    return `Basic ${credentials}`;
}

/*
 * This function converts one Databento price into a JavaScript number.
 *
 * Returns the converted number. Returns NaN, meaning "not a number," when the
 * value is missing or cannot be read as a number.
 */
function formatDatabentoPrice(value) {
    const valueIsNumeric =
        (typeof value === "string" && value !== "") ||
        typeof value === "number";

    return valueIsNumeric ? Number(value) : Number.NaN;
}

/*
 * This function copies the candle fields Trade Tank needs from one Databento
 * record. OHLC means open, high, low, and close prices.
 *
 * Returns a new candlestick object. Another service checks whether its values
 * are valid before saving it.
 */
function formatDatabentoCandlestick(record) {
    return {
        openTime: new Date(record?.hd?.ts_event),
        openPrice: formatDatabentoPrice(record?.open),
        highPrice: formatDatabentoPrice(record?.high),
        lowPrice: formatDatabentoPrice(record?.low),
        closePrice: formatDatabentoPrice(record?.close)
    };
}

/*
 * This function reads a Databento NDJSON response.
 *
 * NDJSON is JSON with one separate object on each line. Blank lines are
 * ignored. If any nonblank line contains broken JSON, the entire response is
 * rejected so partial data is never mistaken for complete data.
 *
 * Returns an array containing one JavaScript object for each line.
 * Throws an error when the response is not text or contains invalid JSON.
 */
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

/*
 * This function reads every NDJSON line and converts it into a candlestick.
 *
 * Returns an array of candlestick objects using Trade Tank's property names.
 */
function parseDatabentoCandlesticks(responseText) {
    return parseDatabentoRecords(responseText)
        .map((record) => formatDatabentoCandlestick(record));
}

/*
 * This function copies the market-status fields Trade Tank needs from one
 * Databento record.
 *
 * Returns a new status object using Trade Tank's property names.
 */
function formatDatabentoStatus(record) {
    return {
        eventTime: new Date(record?.hd?.ts_event),
        reason: Number(record?.reason),
        tradingEvent: Number(record?.trading_event),
        isTrading: record?.is_trading
    };
}

/*
 * This function reads every NDJSON line and converts it into a market status.
 *
 * Returns an array of status objects using Trade Tank's property names.
 */
function parseDatabentoStatuses(responseText) {
    return parseDatabentoRecords(responseText)
        .map((record) => formatDatabentoStatus(record));
}

/*
 * This function requests one type of historical data for one period of time.
 *
 * A Databento "schema" names the type of records requested, such as candles or
 * market-status changes. The request uses the continuous front-month ES futures
 * symbol and is cancelled if Databento takes longer than 30 seconds.
 *
 * Returns Databento's response as NDJSON text.
 * Throws an error for a failed HTTP response or a timeout.
 */
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

/*
 * This function downloads and reads one-minute OHLCV records for a period.
 * OHLCV means open, high, low, close, and volume.
 *
 * Returns an array of candlesticks using Trade Tank's property names.
 */
async function fetchDatabentoCandlesticks(startTime, endTime) {
    const responseText = await fetchDatabentoResponse(
        "ohlcv-1m",
        startTime,
        endTime
    );

    return parseDatabentoCandlesticks(responseText);
}

/*
 * This function downloads and reads exchange status changes for a period.
 *
 * Returns an array of status objects using Trade Tank's property names.
 */
async function fetchDatabentoStatuses(startTime, endTime) {
    const responseText = await fetchDatabentoResponse(
        "status",
        startTime,
        endTime
    );

    return parseDatabentoStatuses(responseText);
}

/*
 * This function keeps only scheduled market-status changes that can affect the
 * trading session.
 *
 * Repeated copies of the same status at the same time are removed. The remaining
 * statuses are placed from earliest to latest.
 *
 * Returns the cleaned status array.
 * Throws an error when the supplied value is not an array.
 */
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

/*
 * This function converts a Databento availability range into JavaScript Dates.
 *
 * Returns an object containing the starting and ending Date values. They may
 * still be invalid and must be checked by the caller.
 */
function formatDatabentoTimeRange(range) {
    return {
        startTime: new Date(range?.start),
        endTime: new Date(range?.end)
    };
}

/*
 * This function checks whether a value is a real, usable JavaScript Date.
 *
 * Returns true for a valid Date and false for every other value.
 */
function isValidDate(value) {
    return (
        value instanceof Date &&
        !Number.isNaN(value.getTime())
    );
}

/*
 * This function asks Databento which dates are available for candles and
 * market-status records.
 *
 * Returns one object containing the available period for each record type.
 * Throws an error if the request fails or Databento returns unusable data.
 */
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

/*
 * This function asks Databento about the quality and availability of one
 * trading day's published data.
 *
 * Returns a checked status name such as "available" or "pending."
 * Throws an error for an invalid date or an unexpected response.
 */
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

/*
 * This function checks whether Databento says a requested period is available
 * before Trade Tank tries to download the records themselves.
 *
 * Returns true only when the requested start and end are both inside the
 * available period. Returns false otherwise.
 * Throws an error when the record type or requested Dates are invalid.
 */
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
    fetchDatabentoCandlesticks,
    fetchDatabentoStatuses,
    getScheduledDatabentoStatuses,
    fetchDatabentoCondition,
    isDatabentoRangeAvailable
};
