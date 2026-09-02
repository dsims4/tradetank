const { query } = require("./db");
const {
    isValidDatabentoCondition,
    fetchDatabentoStatuses,
    getScheduledDatabentoStatuses,
    isDatabentoRangeAvailable
} = require("./databento");

const STATUS_LOOKBACK_DURATION = 1000 * 60 * 60 * 24;
const TRADING_SESSION_INCEPTION_DATE = "2026-08-28";
const NEW_YORK_DATE_FORMATTER = new Intl.DateTimeFormat(
    "en-US",
    {
        timeZone: "America/New_York",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }
);

const pendingTradingSessionResolutions = new Map();

function isValidDate(value) {
    return (
        value instanceof Date &&
        !Number.isNaN(value.getTime())
    );
}

function getNewYorkDate(date = new Date()) {
    if (!isValidDate(date)) {
        throw new TypeError("A valid date is required.");
    }

    const dateParts = Object.fromEntries(
        NEW_YORK_DATE_FORMATTER
            .formatToParts(date)
            .filter((part) => part.type !== "literal")
            .map((part) => [part.type, part.value])
    );

    return (
        `${dateParts.year}-` +
        `${dateParts.month}-` +
        `${dateParts.day}`
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

    const scheduledStatuses = getScheduledDatabentoStatuses(statuses);

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
    if (!isValidTradingDate(tradingDate)) {
        throw new TypeError("The trading date must use YYYY-MM-DD format.");
    }

    const result = await db.query(
        `SELECT
            TO_CHAR($1::DATE, 'YYYY-MM-DD') AS trading_date,
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

async function resolveTradingSession(tradingDate) {
    const plannedSession =
        await getPlannedTradingSession(tradingDate);

    if (
        plannedSession.tradingDate <
        TRADING_SESSION_INCEPTION_DATE
    ) {
        return {
            tradingDate: plannedSession.tradingDate,
            state: "unsupported"
        };
    }

    const statusStartTime = new Date(
        plannedSession.openTime.getTime() -
        STATUS_LOOKBACK_DURATION
    );

    const statusRangeIsAvailable =
        await isDatabentoRangeAvailable(
            "status",
            statusStartTime,
            plannedSession.closeTime
        );

    if (!statusRangeIsAvailable) {
        return {
            tradingDate: plannedSession.tradingDate,
            state: "unavailable"
        };
    }

    const statuses = await fetchDatabentoStatuses(
        statusStartTime,
        plannedSession.closeTime
    );

    const resolvedSession = getTradingSession(
        statuses,
        plannedSession.openTime,
        plannedSession.closeTime
    );

    return {
        tradingDate: plannedSession.tradingDate,
        ...resolvedSession
    };
}

function isValidTradingDate(value) {
    if (
        typeof value !== "string" ||
        !/^\d{4}-\d{2}-\d{2}$/.test(value)
    ) {
        return false;
    }

    const [year, month, day] =
        value.split("-").map(Number);

    const date = new Date(
        Date.UTC(year, month - 1, day)
    );

    const dateExists =
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day;

    const dayOfWeek = date.getUTCDay();
    const isWeekday =
        dayOfWeek !== 0 &&
        dayOfWeek !== 6;

    return dateExists && isWeekday;
}

async function getStoredTradingSession(tradingDate, db = { query }) {
    if (!isValidTradingDate(tradingDate)) {
        throw new TypeError(
            "The trading date must use YYYY-MM-DD format."
        );
    }

    const result = await db.query(
        `SELECT
            TO_CHAR(trading_date, 'YYYY-MM-DD') AS trading_date,
            state,
            open_time,
            close_time,
            candlesticks_synced_time,
            candlesticks_retry_time,
            data_condition,
            data_condition_checked_time
         FROM
            trading_sessions
         WHERE
            trading_date = $1`,
        [tradingDate]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];

    return {
        tradingDate: row.trading_date,
        state: row.state,
        openTime: row.open_time,
        closeTime: row.close_time,
        candlesticksSyncedTime: row.candlesticks_synced_time,
        candlesticksRetryTime: row.candlesticks_retry_time,
        dataCondition: row.data_condition,
        dataConditionCheckedTime: row.data_condition_checked_time
    };
}

async function saveTradingSession(session, db = { query }) {
    const tradingDate = session?.tradingDate;
    const state = session?.state;
    const openTime = session?.openTime ?? null;
    const closeTime = session?.closeTime ?? null;

    const stateIsValid =
        ["normal", "shortened", "closed"].includes(state);

    const boundariesAreValid =
        state === "closed"
            ? openTime === null && closeTime === null
            : (
                isValidDate(openTime) &&
                isValidDate(closeTime) &&
                openTime < closeTime
            );

    if (
        !isValidTradingDate(tradingDate) ||
        !stateIsValid ||
        !boundariesAreValid
    ) {
        throw new TypeError(
            "A valid resolved trading session is required."
        );
    }

    await db.query(
        `INSERT INTO
            trading_sessions
            (
                trading_date,
                state,
                open_time,
                close_time
            )
         VALUES
            ($1, $2, $3, $4)
         ON CONFLICT
            (trading_date)
         DO NOTHING`,
        [
            tradingDate,
            state,
            openTime,
            closeTime
        ]
    );

    return getStoredTradingSession(tradingDate, db);
}

async function markTradingSessionCandlesticksSynced(tradingDate, db = { query }) {
    if (!isValidTradingDate(tradingDate)) {
        throw new TypeError(
            "The trading date must use YYYY-MM-DD format."
        );
    }

    const result = await db.query(
        `UPDATE
            trading_sessions
         SET
            candlesticks_synced_time = NOW(),
            candlesticks_retry_time = NULL
         WHERE
            trading_date = $1
         AND
            state IN ('normal', 'shortened')
         RETURNING
            candlesticks_synced_time`,
        [tradingDate]
    );

    if (result.rows.length === 0) {
        throw new Error(
            "A resolved open trading session is required."
        );
    }

    return result.rows[0].candlesticks_synced_time;
}

async function delayTradingSessionCandlestickRetry(tradingDate, db = { query }) {
    if (!isValidTradingDate(tradingDate)) {
        throw new TypeError(
            "The trading date must use YYYY-MM-DD format."
        );
    }

    const result = await db.query(
        `UPDATE
            trading_sessions
         SET
            candlesticks_retry_time =
                NOW() + INTERVAL '24 hours'
         WHERE
            trading_date = $1
         AND
            state IN ('normal', 'shortened')
         RETURNING
            candlesticks_retry_time`,
        [tradingDate]
    );

    if (result.rows.length === 0) {
        throw new Error(
            "A resolved open trading session is required."
        );
    }

    return result.rows[0].candlesticks_retry_time;
}

async function updateTradingSessionDataCondition(
    tradingDate, dataCondition, db = { query }) {

    const conditionIsValid = isValidDatabentoCondition(dataCondition);

    if (
        !isValidTradingDate(tradingDate) ||
        !conditionIsValid
    ) {
        throw new TypeError(
            "A valid trading date and data condition are required."
        );
    }

    const result = await db.query(
        `UPDATE
            trading_sessions
         SET
            data_condition = $2,
            data_condition_checked_time = NOW()
         WHERE
            trading_date = $1
         AND
            state IN ('normal', 'shortened')
         RETURNING
            data_condition,
            data_condition_checked_time`,
        [tradingDate, dataCondition]
    );

    if (result.rows.length === 0) {
        throw new Error(
            "A resolved open trading session is required."
        );
    }

    return {
        dataCondition: result.rows[0].data_condition,
        dataConditionCheckedTime:
            result.rows[0].data_condition_checked_time
    };
}

async function getOrResolveTradingSession(tradingDate) {
    const storedSession =
        await getStoredTradingSession(tradingDate);

    if (storedSession) return storedSession;

    let pendingResolution =
        pendingTradingSessionResolutions.get(tradingDate);

    if (!pendingResolution) {
        pendingResolution = (async () => {
            const resolvedSession =
                await resolveTradingSession(tradingDate);

            if (
                resolvedSession.state === "unavailable" ||
                resolvedSession.state === "unsupported"
            ) {
                return resolvedSession;
            }

            return saveTradingSession(resolvedSession);
        })();

        pendingTradingSessionResolutions.set(
            tradingDate,
            pendingResolution
        );
    }

    try {
        return await pendingResolution;
    } finally {
        if (
            pendingTradingSessionResolutions.get(tradingDate) === pendingResolution
        ) {
            pendingTradingSessionResolutions.delete(tradingDate);
        }
    }
}

module.exports = {
    getNewYorkDate,
    getOrResolveTradingSession,
    markTradingSessionCandlesticksSynced,
    updateTradingSessionDataCondition,
    delayTradingSessionCandlestickRetry,
    isValidTradingDate
};
