const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to connect to Postgres.");
}

const isProduction = process.env.NODE_ENV === "production";

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: isProduction ? { rejectUnauthorized: false } : false
});

async function query(text, params) {
    return pool.query(text, params);
}

async function getClient() {
    return pool.connect();
}

async function runTransaction(operation, db = { getClient }) {
    if (typeof operation !== "function") {
        throw new TypeError("A transaction operation is required.");
    }

    const client = await db.getClient();

    try {
        await client.query("BEGIN");
        const result = await operation(client);
        await client.query("COMMIT");
        return result;
    } catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch (rollbackError) {
            console.error("Database rollback failed:", rollbackError);
        }

        throw error;
    } finally {
        client.release();
    }
}

async function closePool() {
    await pool.end();
}

module.exports = {
    query,
    runTransaction,
    closePool
};
