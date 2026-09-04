/** Checks that Trade Tank can connect to its configured PostgreSQL database. */
require("dotenv").config();

const { query, closePool } = require("../services/db");

/*
 * This function sends the simple SQL query SELECT NOW to PostgreSQL.
 * A returned database time proves that the connection and query both worked.
 *
 * Returns a Promise that finishes after printing the database time.
 * It throws the connection or query error when the check fails.
 */
async function main() {
    const result = await query("SELECT NOW() AS connected_at");
    console.log(
        "Postgres connected at:",
        result.rows[0].connected_at.toISOString()
    );
}

/*
 * A command-line failure sets a nonzero exit status, which tells the terminal
 * and automated tools that the command failed. Database connections close after
 * success or failure so Node can exit cleanly.
 */
main()
    .catch((error) => {
        console.error("Postgres connection failed.");
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await closePool();
    });
