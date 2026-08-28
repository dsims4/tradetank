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

module.exports = {
    getCandles
};
