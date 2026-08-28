const { query } = require("./db");

async function getCandles(startTime, endTime, db = { query }) {
    const result = await db.query(
        `SELECT
            open_time,
            open_price,
            high_price,
            low_price,
            close_price
         FROM
            price_data
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

function isValidCandle(candle) {
    if (!candle || typeof candle !== "object") return false;

    const prices = [
        candle.openPrice,
        candle.highPrice,
        candle.lowPrice,
        candle.closePrice
    ];

    return (
        candle.openTime instanceof Date &&
        !Number.isNaN(candle.openTime.getTime()) &&
        prices.every(Number.isFinite) &&
        candle.highPrice >= Math.max(
            candle.openPrice,
            candle.lowPrice,
            candle.closePrice
        ) &&
        candle.lowPrice <= Math.min(
            candle.openPrice,
            candle.highPrice,
            candle.closePrice
        )
    );
}

async function saveCandles(candles, db = { query }) {
    if (!Array.isArray(candles)) {
        throw new TypeError("The candles must be in an array.");
    }

    if (!candles.every(isValidCandle)) {
        throw new TypeError("At least one candle is invalid.");
    }

    if (candles.length === 0) return 0;

    const result = await db.query(
        `INSERT INTO
            price_data
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
            candles.map((candle) => candle.openTime),
            candles.map((candle) => candle.openPrice),
            candles.map((candle) => candle.highPrice),
            candles.map((candle) => candle.lowPrice),
            candles.map((candle) => candle.closePrice)
         ]
    );

    return result.rowCount;
}

module.exports = {
    getCandles,
    saveCandles
};
