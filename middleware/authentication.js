/** Finds logged-in users and blocks pages or APIs that require an account. */
const { query } = require("../services/db");
const {
    getSessionUserID,
    clearSessionCookie
} = require("../services/session");

/*
 * This function tells browsers and other network caches not to save a private
 * logged-in response.
 *
 * It changes the response headers and does not return a value.
 */
function setNoStoreHeaders(res) {
    res.set({
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
        Pragma: "no-cache",
        Expires: "0"
    });
}

/*
 * This function gets the account and display settings for one user ID.
 *
 * Returns a Promise whose value is the database row.
 * Returns null when the user does not exist.
 */
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

/*
 * This middleware runs before a protected page route.
 *
 * Middleware is a function that examines or changes a request before the final
 * route handles it. This one requires a valid login, loads the user's account,
 * and makes it available to page templates. Missing sessions and sessions whose
 * account was deleted are redirected to Login. Private pages are not cached.
 *
 * Returns the redirect response when login fails.
 * Otherwise, returns the result of calling the next middleware or route.
 */
async function loadUser(req, res, next) {
    try {
        const userID = await getSessionUserID(req);

        if (!userID) return res.redirect("/login");

        setNoStoreHeaders(res);

        const user = await findUser(userID);

        if (!user) {
            clearSessionCookie(res);
            return res.redirect("/login");
        }

        req.user = {
            id: user.id,
            colorScheme: user.color_scheme || "tank"
        };

        return next();
    } catch (error) {
        return next(error);
    }
}

/*
 * This middleware loads the account when a visitor is logged in, but it also
 * allows visitors without an account to continue.
 *
 * Sets req.user to the account or null, then returns the result of the next
 * middleware or route.
 */
async function loadUserOptional(req, res, next) {
    try {
        const userID = await getSessionUserID(req);

        if (!userID) {
            req.user = null;
            return next();
        }

        const user = await findUser(userID);

        if (!user) {
            clearSessionCookie(res);
            req.user = null;
            return next();
        }

        req.user = {
            id: user.id,
            colorScheme: user.color_scheme || "tank"
        };

        return next();
    } catch (error) {
        return next(error);
    }
}

/*
 * This middleware prevents logged-in users from opening pages intended only for
 * visitors, such as Login and Signup.
 *
 * Returns a Home redirect when the user is logged in.
 * Otherwise, returns the result of continuing the request.
 */
async function redirectAuthenticated(req, res, next) {
    try {
        const userID = await getSessionUserID(req);

        if (userID) return res.redirect("/home");

        return next();
    } catch (error) {
        return next(error);
    }
}

/*
 * This middleware requires a valid login without loading the full account again.
 *
 * Returns a Login redirect when no valid session exists.
 * Otherwise, prevents caching and continues the request.
 */
async function redirectUnauthenticated(req, res, next) {
    try {
        const userID = await getSessionUserID(req);

        if (!userID) return res.redirect("/login");

        setNoStoreHeaders(res);
        return next();
    } catch (error) {
        return next(error);
    }
}

/*
 * This middleware requires a valid login for an API route.
 *
 * Returns a JSON response with HTTP status 401 when no valid login exists.
 * Otherwise, prevents caching and continues the request.
 */
async function requireAPIAuthentication(req, res, next) {
    try {
        const userID = await getSessionUserID(req);

        if (!userID) {
            return res.status(401).json({
                error: "Authentication is required."
            });
        }

        setNoStoreHeaders(res);
        return next();
    } catch (error) {
        return next(error);
    }
}

module.exports = {
    loadUser,
    loadUserOptional,
    redirectAuthenticated,
    redirectUnauthenticated,
    requireAPIAuthentication
};
