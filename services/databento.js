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

function parseDataBentoCandlesticks(responseText) {
    if (typeof responseText !== "string") {
        throw new TypeError("The DataBento response must be a string.");
    }

    return responseText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => JSON.parse(line))
        .map((record) => formatDataBentoCandlestick(record));
}

async function fetchDataBentoCandlesticks(startTime, endTime) {
    const apiKey = process.env.DATABENTO_API_KEY;

    if (!apiKey) {
        throw new Error("DATABENTO_API_KEY is required.");
    }

    const requestBody = new URLSearchParams({
        dataset: "GLBX.MDP3",
        symbols: "ES.v.0",
        stype_in: "continuous",
        schema: "ohlcv-1m",
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

    const responseText = await response.text();
    return parseDataBentoCandlesticks(responseText);
}

module.exports = {
    formatDataBentoCandlestick,
    parseDataBentoCandlesticks,
    fetchDataBentoCandlesticks
};