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
    context.mock.method(rateLimitLibrary, "rateLimit", (options) => ({
        options,
        async resetKey(key) { resetKeys.push(key); }
    }));
    const limiters = require("../../middleware/rate-limits");

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
        for (const [name, minutes, limit] of cases) {
            const options = limiters[name].options;
            assert.strictEqual(options.windowMs, minutes * 60000, name);
            assert.strictEqual(options.limit, limit, name);
            assert.strictEqual(options.standardHeaders, "draft-8");
            assert.strictEqual(options.legacyHeaders, false);
        }
    });

    await context.test("account keys distinguish users and reset the same normalized key", async () => {
        const request = { ip: "192.0.2.1", body: { username: " trader " } };
        const keyFor = limiters.accountIPRateLimit.options.keyGenerator;
        assert.strictEqual(keyFor(request), "192.0.2.1:trader");
        assert.notStrictEqual(keyFor(request), keyFor({ ...request, ip: "192.0.2.2" }));
        assert.notStrictEqual(keyFor(request), keyFor({
            ...request, body: { username: "another" }
        }));
        assert.strictEqual(keyFor({ ip: request.ip, body: {} }), "192.0.2.1:");
        await limiters.clearAccountIPRateLimit(request);
        assert.deepStrictEqual(resetKeys, [keyFor(request)]);
        for (const name of ["changeEmailUserRateLimit", "changePasswordUserRateLimit"]) {
            assert.strictEqual(
                limiters[name].options.keyGenerator({ authenticatedUserID: 42 }),
                "42"
            );
        }
    });

    await context.test("login rejection retains only a valid username", () => {
        for (const [username, expected] of [[" trader ", "trader"], ["a".repeat(33), ""], [5, ""]]) {
            const response = createResponseRecorder();
            limiters.loginIPRateLimit.options.handler({ body: { username } }, response);
            assert.strictEqual(response.statusCode, 429);
            assert.strictEqual(response.template, "login.njk");
            assert.strictEqual(response.data.username, expected);
            assert.strictEqual(response.data.successMessage, "");
            assert.ok(response.data.errorMessage);
        }
    });

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
            assert.strictEqual(response.data.linkIsValid, token.length === 64);
        }
    });

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
            assert.strictEqual(response.destination, `/profile?${parameter}=${error}`);
        }
    });
});

/* Return a chainable response recorder containing only the methods these handlers use. */
function createResponseRecorder() {
    return {
        status(code) { this.statusCode = code; return this; },
        render(template, data) { this.template = template; this.data = data; return this; },
        json(data) { this.data = data; return this; },
        redirect(destination) { this.destination = destination; return this; }
    };
}
