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
const rateLimitLibrary = require("express-rate-limit");

/*
 * Record limiter construction so these checks exercise Trade Tank's configuration,
 * keys, and responses without starting library timers or simulating HTTP traffic.
 * The real library's counting behavior belongs in application integration tests.
 */
test("rate limit configuration and handlers", async (context) => {
    const resetKeys = [];
    // Replace this method only for this test; Node restores it when the test ends.
    // Return the supplied options for inspection instead of creating a real rate limiter.
    // resetKey records which counter the application would clear.
    context.mock.method(rateLimitLibrary, "rateLimit", (options) => ({
        options,
        async resetKey(key) { resetKeys.push(key); }
    }));
    // Import after replacing the factory so all limiters are constructed using our recorder.
    const limiters = require("../../middleware/rate-limits");

    /*
     * Each row names a limiter, its window in minutes, and its allowed request count.
     * Compare the captured options, converting minutes to milliseconds for windowMs.
     */
    await context.test("sensitive operations receive their intended limits", () => {
        const cases = [
            ["loginIPRateLimit", 15, 32],
            ["accountIPRateLimit", 15, 8],
            ["signupIPRateLimit", 60, 8],
            ["signupAvailabilityIPRateLimit", 15, 32],
            ["forgotPasswordIPRateLimit", 60, 8],
            ["resetPasswordIPRateLimit", 15, 8],
            ["changeEmailUserRateLimit", 60, 4],
            ["changePasswordUserRateLimit", 60, 4]
        ];
        // Unpack each row into its limiter name, window length, and request allowance.
        for (const [name, minutes, limit] of cases) {
            const options = limiters[name].options;
            assert.strictEqual(options.windowMs, minutes * 60000, name);
            assert.strictEqual(options.limit, limit, name);
            assert.strictEqual(options.standardHeaders, "draft-8");
            assert.strictEqual(options.legacyHeaders, false);
        }
    });

    /*
     * Vary the IP address and username separately to check how accounts are counted.
     * The reset operation must use the same normalized key as the limiter.
     */
    await context.test("account keys distinguish users and reset consistently", async () => {
        const request = { ip: "192.0.2.1", body: { username: " trader " } };
        // Save the actual key-building function so we can call it directly with small requests.
        const keyFor = limiters.accountIPRateLimit.options.keyGenerator;
        assert.strictEqual(keyFor(request), "192.0.2.1:trader");
        // Copy the request and change only its IP; that must produce a different counter key.
        assert.notStrictEqual(keyFor(request), keyFor({ ...request, ip: "192.0.2.2" }));
        assert.notStrictEqual(keyFor(request), keyFor({
            ...request, body: { username: "another" }
        }));
        assert.strictEqual(keyFor({ ip: request.ip, body: {} }), "192.0.2.1:");
        // Ask the application to clear the account limit, then inspect the key it passed along.
        await limiters.clearAccountIPRateLimit(request);
        assert.deepStrictEqual(resetKeys, [keyFor(request)]);
        for (const name of ["changeEmailUserRateLimit", "changePasswordUserRateLimit"]) {
            assert.strictEqual(
                limiters[name].options.keyGenerator({ authenticatedUserID: 42 }),
                "42"
            );
        }
    });

    /*
     * Call the rejection handler with valid and invalid usernames. Inspect the saved
     * response fields to check the status, form, and username shown to the user.
     */
    await context.test("login rejection retains only a valid username", () => {
        // The pairs specify input and expected retained username: trim valid text, discard invalid
        // text.
        const cases = [[" trader ", "trader"], ["a".repeat(33), ""], [5, ""]];
        for (const [username, expected] of cases) {
            const response = createResponseRecorder();
            limiters.loginIPRateLimit.options.handler({ body: { username } }, response);
            // 429 means too many requests. These fields were saved by our response recorder.
            assert.strictEqual(response.statusCode, 429);
            assert.strictEqual(response.template, "login.njk");
            assert.strictEqual(response.data.username, expected);
            assert.strictEqual(response.data.successMessage, "");
            assert.ok(response.data.errorMessage);
        }
    });

    /*
     * Call each form handler directly and inspect the response recorder. Reset links
     * keep their token, while the validity flag follows the token validation result.
     */
    await context.test("signup and reset request limits render their forms", () => {
        for (const [name, template] of [
            ["signupIPRateLimit", "signup.njk"],
            ["forgotPasswordIPRateLimit", "forgot-password.njk"]
        ]) {
            const response = createResponseRecorder();
            limiters[name].options.handler({}, response);
            assert.strictEqual(response.statusCode, 429);
            assert.strictEqual(response.template, template);
            assert.ok(response.data.errorMessage);
        }
        for (const token of ["a".repeat(64), "invalid", ""]) {
            const response = createResponseRecorder();
            limiters.resetPasswordIPRateLimit.options.handler({ body: { token } }, response);
            assert.strictEqual(response.statusCode, 429);
            assert.strictEqual(response.template, "reset-password.njk");
            assert.strictEqual(response.data.token, token);
            // Only the 64-character valid token in this table should keep the reset link usable.
            assert.strictEqual(response.data.linkIsValid, token.length === 64);
        }
    });

    /*
     * Inspect the availability error as JSON, then check each profile redirect URL.
     * These recorders capture responses without starting an HTTP server.
     */
    await context.test("availability limits return JSON and profile limits redirect", () => {
        const response = createResponseRecorder();
        limiters.signupAvailabilityIPRateLimit.options.handler({}, response);
        assert.strictEqual(response.statusCode, 429);
        assert.match(response.data.error, /Too many signup availability requests/);
        for (const [name, parameter, error] of [
            ["changeEmailUserRateLimit", "emailError", "change-email-rate-limit"],
            ["changePasswordUserRateLimit", "passwordError", "change-password-rate-limit"]
        ]) {
            const response = createResponseRecorder();
            limiters[name].options.handler({}, response);
            // Template interpolation inserts the expected query parameter and error key into the
            // URL.
            assert.strictEqual(response.destination, `/profile?${parameter}=${error}`);
        }
    });
});

/*
 * Return a response object that saves what each handler would send to a browser.
 * Returning this allows calls such as response.status(429).render(...) to work.
 * The saved fields let assertions inspect the response without an Express server.
 */
function createResponseRecorder() {
    return {
        status(code) { this.statusCode = code; return this; },
        render(template, data) { this.template = template; this.data = data; return this; },
        json(data) { this.data = data; return this; },
        redirect(destination) { this.destination = destination; return this; }
    };
}
