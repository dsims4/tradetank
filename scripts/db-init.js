/** Applies Trade Tank's official table definitions to PostgreSQL. */
require("dotenv").config();

const fs = require("fs/promises");
const path = require("path");

const { query, closePool } = require("../services/db");

/*
 * This function reads db/schema.sql and sends its table definitions to PostgreSQL.
 *
 * Returns a Promise that finishes after PostgreSQL accepts the complete schema.
 * It throws the file-reading or database error when initialization fails.
 */
async function main() {
    const schemaPath = path.join(__dirname, "..", "db", "schema.sql");
    const schemaSql = await fs.readFile(schemaPath, "utf8");

    await query(schemaSql);
    console.log("Database schema applied successfully.");
}

/*
 * A command-line failure sets a nonzero exit status, which tells the terminal
 * and automated tools that the command failed. Database connections close after
 * success or failure so Node can exit cleanly.
 */
main()
    .catch((error) => {
        console.error("Database schema apply failed.");
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await closePool();
    });
