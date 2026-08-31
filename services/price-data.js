const { query } = require("./db");

async function getCandlesticks(startTime, endTime, db = { query }) {
    const result = await db.query(
        `SELECT
            open_time,
            open_price,
            high_price,
            low_price,
            close_price
         FROM
            candlesticks
         WHERE
            open_time >= $1
         AND
            open_time < $2
         ORDER BY
            open_time ASC`,
        [startTime, endTime]
    );

    return result.rows.map((row) => ({
        openTime: row.open_time.toISOString(),
        openPrice: Number(row.open_price),
        highPrice: Number(row.high_price),
        lowPrice: Number(row.low_price),
        closePrice: Number(row.close_price)
    }));
}

function isValidCandlestick(candlestick) {
    if (!candlestick || typeof candlestick !== "object") return false;

    const prices = [
        candlestick.openPrice,
        candlestick.highPrice,
        candlestick.lowPrice,
        candlestick.closePrice
    ];

    return (
        candlestick.openTime instanceof Date &&
        !Number.isNaN(candlestick.openTime.getTime()) &&
        prices.every(Number.isFinite) &&
        candlestick.highPrice >= Math.max(
            candlestick.openPrice,
            candlestick.lowPrice,
            candlestick.closePrice
        ) &&
        candlestick.lowPrice <= Math.min(
            candlestick.openPrice,
            candlestick.highPrice,
            candlestick.closePrice
        )
    );
}

function areCandlesticksValidForRange(candlesticks, startTime, endTime) {
    const rangeIsValid =
        startTime instanceof Date &&
        !Number.isNaN(startTime.getTime()) &&
        endTime instanceof Date &&
        !Number.isNaN(endTime.getTime()) &&
        startTime < endTime;

    if (
        !Array.isArray(candlesticks) ||
        candlesticks.length === 0 ||
        !rangeIsValid
    ) {
        return false;
    }

    return candlesticks.every((candlestick, index) => {
        if (!isValidCandlestick(candlestick)) return false;

        const openTime = candlestick.openTime;
        const previousCandlestick = candlesticks[index - 1];

        const beginsOnExactMinute =
            openTime.getUTCSeconds() === 0 &&
            openTime.getUTCMilliseconds() === 0;

        const isInsideRange =
            openTime >= startTime &&
            openTime < endTime;

        const isStrictlyIncreasing =
            !previousCandlestick ||
            openTime > previousCandlestick.openTime;

        return (
            beginsOnExactMinute &&
            isInsideRange &&
            isStrictlyIncreasing
        );
    });
}

async function saveCandlesticks(candlesticks, db = { query }) {
    if (!Array.isArray(candlesticks)) {
        throw new TypeError("The candlesticks must be in an array.");
    }

    if (!candlesticks.every(isValidCandlestick)) {
        throw new TypeError("At least one candlestick is invalid.");
    }

    if (candlesticks.length === 0) return 0;

    const result = await db.query(
        `INSERT INTO
            candlesticks
            (
                open_time,
                open_price,
                high_price,
                low_price,
                close_price
            )
         SELECT
            *
         FROM
            UNNEST(
                $1::TIMESTAMPTZ[],
                $2::NUMERIC[],
                $3::NUMERIC[],
                $4::NUMERIC[],
                $5::NUMERIC[]
            )
         ON CONFLICT
            (open_time)
         DO NOTHING`,
        [
            candlesticks.map((candlestick) => candlestick.openTime),
            candlesticks.map((candlestick) => candlestick.openPrice),
            candlesticks.map((candlestick) => candlestick.highPrice),
            candlesticks.map((candlestick) => candlestick.lowPrice),
            candlesticks.map((candlestick) => candlestick.closePrice)
        ]
    );

    return result.rowCount;
}

async function getCandlestickTimeRange(db = { query }) {
    const result = await db.query(
        `SELECT
            MIN(open_time) AS oldest_time,
            MAX(open_time) AS newest_time
         FROM candlesticks`
    );

    return {
        oldestTime: result.rows[0].oldest_time,
        newestTime: result.rows[0].newest_time
    };
}

module.exports = {
    getCandlesticks,
    saveCandlesticks,
    getCandlestickTimeRange,
    areCandlesticksValidForRange
};
