require("dotenv").config();

const { query, closePool } = require("../services/db");

async function main() {
    const result = await query("SELECT NOW() AS connected_at");
    console.log("Postgres connected at:", result.rows[0].connected_at.toISOString());
}

main()
    .catch((error) => {
        console.error("Postgres connection failed.");
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await closePool();
    });
