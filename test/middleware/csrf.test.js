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
 * Exercise the real middleware using request/response recorders, without an HTTP server.
 */
test("same-origin middleware accepts safe requests and blocks foreign mutations", () => {
    const result = runIsolated(() => {
        const { verifySameOrigin } = require("./middleware/csrf");
        const origin = "https://tradetank.example";
        // Each row contains a method, request headers, and whether next should be called.
        // map builds one trusted-origin row per modifying method; ... inserts those rows here.
        const cases = [
            ["GET", {}, true], ["HEAD", {}, true], ["OPTIONS", {}, true],
            ...["POST", "PUT", "PATCH", "DELETE"].map((method) => [
                method, { origin }, true
            ]),
            // Missing or foreign origins must fail, including lookalike hosts and different ports.
            ["POST", {}, false],
            ["POST", { origin: "https://other.example", referer: `${origin}/profile` }, false],
            ["POST", { origin: "http://tradetank.example" }, false],
            ["POST", { origin: `${origin}:444` }, false],
            ["POST", { origin: `${origin}.attacker.example` }, false],
            // Without a usable Origin header, the middleware checks the Referer address instead.
            ["POST", { referer: `${origin}/profile?tab=email` }, true],
            ["POST", { referer: "invalid" }, false],
            ["POST", { referer: "https://other.example/profile" }, false],
            ["POST", { origin: "null" }, false],
            ["POST", { origin: "null", referer: `${origin}/profile` }, true]
        ];
        // Destructuring gives names to the three values in each row.
        for (const [method, headers, allowed] of cases) {
            let nextCalls = 0;
            // Save the status and body on this object instead of sending an HTTP response.
            const response = {
                status(code) { this.code = code; return this; },
                send(body) { this.body = body; return this; }
            };
            // get reads a header from our object. The callback counts how often next is called.
            verifySameOrigin({ method, get: (name) => headers[name] }, response, () => nextCalls++);
            // The conditional expression chooses one expected value when allowed is true, another
            // when false. Accepted requests leave the response untouched; rejected ones send 403.
            assert.strictEqual(nextCalls, allowed ? 1 : 0, JSON.stringify(headers));
            assert.strictEqual(response.code, allowed ? undefined : 403);
            assert.strictEqual(response.body, allowed ? undefined : "Forbidden");
        }
    }, { APP_ORIGIN: "https://tradetank.example/path" });
    assert.strictEqual(result.status, 0, result.stderr);
});
