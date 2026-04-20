require("dotenv").config();

const fs = require("fs/promises");
const path = require("path");

const { query, closePool } = require("../services/db");

async function main() {
    const schemaPath = path.join(__dirname, "..", "db", "schema.sql");
    const schemaSql = await fs.readFile(schemaPath, "utf8");

    await query(schemaSql);
    console.log("Database schema applied successfully.");
}

main()
    .catch((error) => {
        console.error("Database schema apply failed.");
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await closePool();
    });
