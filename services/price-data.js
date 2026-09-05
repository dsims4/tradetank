/** Checks, combines, reads, and saves candlestick price data. */
const { query } = require("./db");

const FIVE_MINUTE_DURATION = 1000 * 60 * 5;

/*
 * This function reads saved one-minute candles from the requested period.
 *
 * The starting time is included and the ending time is excluded. Excluding the
 * ending time prevents the first candle of the next session from being included.
 *
 * Returns an array ordered from earliest to latest. Each candle has an ISO time
 * string and numeric open, high, low, and close prices.
 */
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

/*
 * This function checks one candle's time and prices.
 *
 * Every price must be a real number, not Infinity or NaN. The high cannot be below the open
 * or close, and the low cannot be above them.
 *
 * Returns true when every field is valid. Returns false otherwise.
 */
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

/*
 * This function combines groups of five one-minute candles into five-minute
 * candles.
 *
 * Each new candle uses the first opening price, highest high, lowest low, and
 * final closing price from its five source candles.
 *
 * Returns the new five-minute candle array.
 * Throws an error if a source candle is invalid or is not in time order.
 */
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

/*
 * This function checks that a response contains every minute of the requested
 * market session, including shortened sessions. The start is included and the
 * end is excluded. Both boundaries must fall on exact minutes.
 *
 * Returns true only when every expected minute has one valid candle in order.
 * Returns false for missing, extra, duplicate, unordered, or invalid candles.
 */
function areCandlesticksValidForRange(candlesticks, startTime, endTime) {
    const minuteDuration = 1000 * 60;
    const rangeIsValid =
        startTime instanceof Date &&
        !Number.isNaN(startTime.getTime()) &&
        endTime instanceof Date &&
        !Number.isNaN(endTime.getTime()) &&
        startTime < endTime &&
        startTime.getTime() % minuteDuration === 0 &&
        endTime.getTime() % minuteDuration === 0;

    if (!Array.isArray(candlesticks) || !rangeIsValid) {
        return false;
    }

    const expectedCount =
        (endTime.getTime() - startTime.getTime()) / minuteDuration;

    if (candlesticks.length !== expectedCount) return false;

    // Check each position explicitly so an empty array slot cannot hide a missing minute.
    for (let index = 0; index < expectedCount; index += 1) {
        const candlestick = candlesticks[index];
        const expectedTime = startTime.getTime() + index * minuteDuration;

        if (
            !isValidCandlestick(candlestick) ||
            candlestick.openTime.getTime() !== expectedTime
        ) {
            return false;
        }
    }

    return true;
}

/*
 * This function saves many valid candles with one PostgreSQL query.
 *
 * UNNEST turns the supplied JavaScript arrays into rows inside PostgreSQL. This
 * avoids sending one query per candle. If a candle time already exists, that
 * candle is skipped and its saved prices are not changed.
 *
 * Returns the number of new candle rows saved.
 * Throws an error before saving when any candle is invalid.
 */
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
