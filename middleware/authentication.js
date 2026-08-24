const { query } = require("../services/db");
const {
    getSessionUserID,
    clearSessionCookie
} = require("../services/session");

function setNoStoreHeaders(res) {
    res.set({
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
        Pragma: "no-cache",
        Expires: "0"
    });
}

async function findUser(userID) {
    const userResult = await query(
        `SELECT
            users.id,
            user_preferences.color_scheme
        FROM
            users
        LEFT JOIN
            user_preferences
        ON
            user_preferences.user_id = users.id
        WHERE
            users.id = $1
        LIMIT 1`,
        [userID]
    );

    return userResult.rows[0] || null;
}

async function loadUser(req, res, next) {
    const userID = await getSessionUserID(req);

    if (!userID) return res.redirect("/login");

    setNoStoreHeaders(res);

    try {
        const user = await findUser(userID);

        if (!user) {
            clearSessionCookie(res);
            return res.redirect("/login");
        }

        req.user = {
            id: user.id,
            colorScheme: user.color_scheme || "light"
        };

        return next();
    } catch (error) {
        return next(error);
    }
}

async function loadUserOptional(req, res, next) {
    const userID = await getSessionUserID(req);

    if (!userID) {
        req.user = null;
        return next();
    }

    try {
        const user = await findUser(userID);

        if (!user) {
            clearSessionCookie(res);
            req.user = null;
            return next();
        }

        req.user = {
            id: user.id,
            colorScheme: user.color_scheme || "light"
        };

        return next();
    } catch (error) {
        return next(error);
    }
}

async function redirectAuthenticated(req, res, next) {
    const userID = await getSessionUserID(req);

    if (userID) return res.redirect("/home");

    return next();
}

async function redirectUnauthenticated(req, res, next) {
    const userID = await getSessionUserID(req);

    if (!userID) return res.redirect("/login");

    setNoStoreHeaders(res);
    return next();
}

module.exports = {
    loadUser,
    loadUserOptional,
    redirectAuthenticated,
    redirectUnauthenticated
};
