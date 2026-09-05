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

/*
 * await waits for a promise to finish. assert.rejects checks that it fails instead
 * of succeeding; an error predicate returning true identifies the expected failure.
 * Awaiting that assertion makes the test wait for its result as well.
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
const environment = {
    SMTP_HOST: "smtp.example.test",
    SMTP_USER: "sender@example.test",
    SMTP_PASSWORD: "unit-test-only-password"
};

/*
 * Missing configuration fails before transport construction or any delivery attempt.
 */
test("email rejects incomplete configuration and invalid ports before creating a sender", () => {
    // Build missing-setting cases and bad-port cases from the same valid baseline.
    // Object spread copies settings so deleting one field does not damage later cases.
    const cases = [{}, ...["SMTP_HOST", "SMTP_USER", "SMTP_PASSWORD"].map((name) => {
        const settings = { ...environment };
        delete settings[name];
        return settings;
    }), ...["0", "65536", "invalid"].map((port) => ({ ...environment, SMTP_PORT: port }))];
    for (const settings of cases) {
        const result = runIsolated(async () => {
            // Fail immediately if invalid configuration gets far enough to construct a mail client.
            require("nodemailer").createTransport = () => assert.fail("Unexpected transport.");
            const { sendPasswordChangedEmail } = require("./services/email");
            await assert.rejects(sendPasswordChangedEmail("recipient@example.test"),
                /SMTP configuration is incomplete/);
        }, settings);
        assert.strictEqual(result.status, 0, result.stderr);
    }
});

/*
 * Capture mail at sendMail and reject it; no recipient or SMTP connection is contacted.
 */
test("email configures TLS and constructs notifications up to the delivery boundary", () => {
    for (const port of ["465", "587"]) {
        const result = runIsolated(async () => {
            const boundary = new Error("Email delivery boundary reached.");
            // Collect prepared messages here instead of delivering them to an address.
            const messages = [];
            let options;
            let constructions = 0;
            // Capture client settings and return only the sendMail method used by the service.
            // That method records the message and rejects, stopping before any SMTP activity.
            require("nodemailer").createTransport = (configuration) => {
                constructions++;
                options = configuration;
                return { async sendMail(message) { messages.push(message); throw boundary; } };
            };
            const email = require("./services/email");
            const url = "https://tradetank.example/reset-password?token=test-token";
            await assert.rejects(email.sendResetPasswordEmail("recipient@example.test", url),
                (error) => error === boundary);
            assert.strictEqual(options.port, Number(process.env.SMTP_PORT));
            // Port 465 starts with TLS; port 587 requires upgrading the connection with STARTTLS.
            assert.strictEqual(options.secure, process.env.SMTP_PORT === "465");
            assert.strictEqual(options.requireTLS, process.env.SMTP_PORT === "587");
            assert.strictEqual(messages[0].from, "Trade Tank <sender@example.test>");
            assert.strictEqual(messages[0].to, "recipient@example.test");
            assert.ok(messages[0].text.includes(url));
            assert.ok(messages[0].html.includes(url));
            assert.match(messages[0].text, /15 minutes/);
            await assert.rejects(email.sendEmailChangeNotifications(
                "old@example.test", "new@example.test"
            ), (error) => error === boundary);
            // Skip the reset email with slice(1), then map the remaining messages to their
            // recipients.
            assert.deepStrictEqual(messages.slice(1).map((message) => message.to), [
                "new@example.test", "old@example.test"
            ]);
            await assert.rejects(email.sendPasswordChangedEmail("recipient@example.test"),
                (error) => error === boundary);
            assert.match(messages[3].subject, /password was changed/);
            // All notifications should reuse the same constructed transport within this child.
            assert.strictEqual(constructions, 1);
        }, { ...environment, SMTP_PORT: port });
        assert.strictEqual(result.status, 0, result.stderr);
    }
});

/*
 * Leave the port unset and provide a custom sender. Inspect the transport options
 * and outgoing message, then deliberately stop before sending it.
 */
test("email uses the default SMTP port and explicit sender override", () => {
    const result = runIsolated(async () => {
        const boundary = new Error("Delivery boundary.");
        require("nodemailer").createTransport = (options) => {
            // No SMTP_PORT was supplied, so the service should choose its default.
            assert.strictEqual(options.port, 465);
            return { async sendMail(message) {
                // Check the explicit sender override on the prepared message, then stop delivery.
                assert.strictEqual(message.from, "Trade Tank <custom@example.test>");
                throw boundary;
            } };
        };
        await assert.rejects(
            require("./services/email").sendPasswordChangedEmail("recipient@example.test"),
            (error) => error === boundary
        );
    }, { ...environment, SMTP_FROM: "custom@example.test" });
    assert.strictEqual(result.status, 0, result.stderr);
});
