const { query } = require("./db");
const {
    getScheduledDataBentoStatuses
} = require("./databento");

function isValidDate(value) {
    return (
        value instanceof Date &&
        !Number.isNaN(value.getTime())
    );
}

function getTradingSession(statuses, plannedOpenTime, plannedCloseTime) {
    if (
        !isValidDate(plannedOpenTime) ||
        !isValidDate(plannedCloseTime) ||
        plannedOpenTime >= plannedCloseTime
    ) {
        throw new TypeError("Valid ordered session boundaries are required.");
    }

    const scheduledStatuses = getScheduledDataBentoStatuses(statuses);

    let stateAtOpen;

    for (const status of scheduledStatuses) {
        if (status.eventTime > plannedOpenTime) break;
        stateAtOpen = status.isTrading;
    }

    if (!stateAtOpen) return { state: "unavailable" };

    if (stateAtOpen === "N") return { state: "closed" };

    const earlyClose = scheduledStatuses.find((status) => (
        status.isTrading === "N" &&
        status.eventTime > plannedOpenTime &&
        status.eventTime < plannedCloseTime
    ));

    return {
        state: earlyClose ? "shortened" : "normal",
        openTime: plannedOpenTime,
        closeTime: earlyClose?.eventTime ?? plannedCloseTime
    };
}

async function getPlannedTradingSession(tradingDate, db = { query }) {
    const dateHasValidFormat =
        typeof tradingDate === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(tradingDate);

    if (!dateHasValidFormat) {
        throw new TypeError("The trading date must use YYYY-MM-DD format.");
    }

    const result = await db.query(
        `SELECT
            $1::DATE AS trading_date,
            ($1::DATE + TIME '09:30')
                AT TIME ZONE 'America/New_York' AS open_time,
            ($1::DATE + TIME '16:15')
                AT TIME ZONE 'America/New_York' AS close_time`,
        [tradingDate]
    );

    return {
        tradingDate: result.rows[0].trading_date,
        openTime: result.rows[0].open_time,
        closeTime: result.rows[0].close_time
    };
}

module.exports = {
    getTradingSession,
    getPlannedTradingSession
};