const { spawnSync } = require("node:child_process");
const path = require("node:path");

/*
 * Run an assertion function in a fresh process with only explicitly supplied settings.
 * No .env file or inherited credentials are loaded. Network entry points throw before
 * connecting; individual tests may replace a boundary with a local recorder.
 * Returns the child result, including its status and assertion failure output.
 */
function runIsolated(operation, environment = {}) {
    // This string becomes a small program executed by a separate copy of Node.
    // toString copies the callback's code, but not variables from its surrounding scope.
    const script = `
        const assert = require("node:assert/strict");
        const net = require("node:net");
        const tls = require("node:tls");
        const denyNetwork = () => { throw new Error("Unexpected network access in unit test."); };
        // Fail before a real connection can start, including through database or mail clients.
        net.Socket.prototype.connect = denyNetwork;
        tls.connect = denyNetwork;
        globalThis.fetch = denyNetwork;
        // Starting in then lets catch handle both thrown errors and rejected promises.
        Promise.resolve().then(${operation.toString()}).catch((error) => {
            console.error(error);
            process.exitCode = 1;
        });
    `;
    // spawnSync waits for the child to finish. -e tells Node to execute the supplied code.
    // Use the project root so relative require paths inside the callback resolve correctly.
    // Replace the environment entirely: do not inherit real database or mail credentials.
    // Return text output for assertion messages, and stop a hung child after ten seconds.
    return spawnSync(process.execPath, ["-e", script], {
        cwd: path.resolve(__dirname, "../.."),
        env: environment,
        encoding: "utf8",
        timeout: 10000
    });
}

module.exports = { runIsolated };
