/*
 * Node's test function registers each named check and runs its callback.
 * Assertions compare actual results with expected values and throw if they differ.
 * strictEqual checks values without converting their types; deepStrictEqual also
 * compares the contents of arrays and objects. A passing assertion stays silent.
 */

/*
 * A for...of loop runs the same check for each listed case. Each value exercises a
 * different input without copying the whole test. An assertion message, when given,
 * identifies the case that failed; it does not change the expected result.
 */
const test = require("node:test");

const assert = require("node:assert/strict");
/*
 * runIsolated starts a fresh Node process with only the settings supplied here.
 * Its callback cannot use variables from this file unless it defines them itself.
 * Network connections are blocked. status is the process exit code: zero means
 * success. Passing stderr to strictEqual shows the child error if that check fails.
 */
const { runIsolated } = require("../support/isolated-process");

/*
 * Use small request and response objects to exercise guest handling. For paths
 * that need user data, stop at the query and check that next receives that error.
 */
test("authentication handles guests and forwards database boundary failures", () => {
    const result = runIsolated(async () => {
        const db = require("./services/db");
        // Create one recognizable error so we can check that this exact error reaches next.
        const boundary = new Error("Authentication database boundary.");
        let queries = 0;
        // Count each attempted query, then stop immediately without contacting PostgreSQL.
        // Install this replacement before importing middleware that may save a reference to it.
        db.query = async () => { queries++; throw boundary; };
        const auth = require("./middleware/authentication");
        // Each call creates a fresh response recorder. Its methods save values for us to inspect.
        // The empty set methods accept header calls; status returns this to allow chained calls.
        const response = () => ({
            set() {}, setHeader() {},
            redirect(location) { this.location = location; },
            status(code) { this.code = code; return this; },
            json(data) { this.data = data; }
        });
        // Run both middleware functions with no cookie headers, representing a guest.
        // The last argument stands in for Express next; calling it here must fail the test.
        for (const operation of [auth.loadUser, auth.redirectUnauthenticated]) {
            const res = response();
            await operation({ headers: {} }, res, () => assert.fail("Guest must redirect."));
            assert.strictEqual(res.location, "/login");
        }
        const res = response();
        // API guests should receive an error response instead of continuing to the API handler.
        await auth.requireAPIAuthentication({ headers: {} }, res,
            () => assert.fail("Guest must receive 401."));
        assert.strictEqual(res.code, 401);
        assert.match(res.data.error, /Authentication is required/);
        // For pages that allow guests, count calls to next instead of treating them as failures.
        let continued = 0;
        const guest = { headers: {} };
        await auth.loadUserOptional(guest, response(), () => continued++);
        assert.strictEqual(guest.user, null);
        await auth.redirectAuthenticated({ headers: {} }, response(), () => continued++);
        // Both guest-friendly paths should continue, and neither should need a database query.
        assert.strictEqual(continued, 2);
        assert.strictEqual(queries, 0);
        // A cached user ID skips session lookup, but these paths still need to load user data.
        const guardedOperations = [
            auth.loadUser, auth.loadUserOptional, auth.requireMarketDataAccess
        ];
        for (const operation of guardedOperations) {
            // Save the argument passed to next(error), then compare its identity with our error.
            let forwarded;
            await operation({ authenticatedUserID: 7 }, response(), (error) => {
                forwarded = error;
            });
            assert.strictEqual(forwarded, boundary);
        }
        // Each of the three user-data paths should have attempted exactly one query.
        assert.strictEqual(queries, 3);
    }, {
        DATABASE_URL: "postgresql://unused:unused@127.0.0.1:1/unused",
        SESSION_SECRET: "unit-test-only-secret"
    });
    assert.strictEqual(result.status, 0, result.stderr);
});
