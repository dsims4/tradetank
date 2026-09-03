const { query } = require("./db");

const FIVE_MINUTE_DURATION = 1000 * 60 * 5;

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

function aggregateFiveMinuteCandlesticks(candlesticks) {
    if (!Array.isArray(candlesticks)) {
        throw new TypeError(
            "The candlesticks must be in an array."
        );
    }

    const aggregatedCandlesticks = [];
    let previousOpenTime = null;

    for (const candlestick of candlesticks) {
        const openTime = new Date(candlestick?.openTime);
        const normalizedCandlestick = {
            ...candlestick,
            openTime
        };

        if (
            !isValidCandlestick(normalizedCandlestick) ||
            (
                previousOpenTime &&
                openTime <= previousOpenTime
            )
        ) {
            throw new TypeError(
                "Ordered valid candlesticks are required."
            );
        }

        const intervalOpenTime = new Date(
            Math.floor(
                openTime.getTime() / FIVE_MINUTE_DURATION
            ) * FIVE_MINUTE_DURATION
        ).toISOString();

        const currentCandlestick =
            aggregatedCandlesticks[
                aggregatedCandlesticks.length - 1
            ];

        if (
            !currentCandlestick ||
            currentCandlestick.openTime !== intervalOpenTime
        ) {
            aggregatedCandlesticks.push({
                openTime: intervalOpenTime,
                openPrice: candlestick.openPrice,
                highPrice: candlestick.highPrice,
                lowPrice: candlestick.lowPrice,
                closePrice: candlestick.closePrice
            });
        } else {
            currentCandlestick.highPrice = Math.max(
                currentCandlestick.highPrice,
                candlestick.highPrice
            );
            currentCandlestick.lowPrice = Math.min(
                currentCandlestick.lowPrice,
                candlestick.lowPrice
            );
            currentCandlestick.closePrice =
                candlestick.closePrice;
        }

        previousOpenTime = openTime;
    }

    return aggregatedCandlesticks;
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

module.exports = {
    getCandlesticks,
    aggregateFiveMinuteCandlesticks,
    areCandlesticksValidForRange,
    saveCandlesticks
};
