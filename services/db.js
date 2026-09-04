/** Opens shared PostgreSQL connections and safely runs grouped database work. */
const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required to connect to Postgres.");
}

const isProduction = process.env.NODE_ENV === "production";

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: isProduction ? { rejectUnauthorized: false } : false
});

/*
 * This function sends one SQL query through the shared group of database
 * connections.
 *
 * Returns a Promise. When it finishes, its value contains the rows and other
 * result information returned by PostgreSQL.
 */
async function query(text, params) {
    return pool.query(text, params);
}

/*
 * This function borrows one database connection for a transaction.
 *
 * Returns a Promise whose value is the borrowed connection. The caller must
 * release that connection when finished.
 */
async function getClient() {
    return pool.connect();
}

/*
 * This function runs several database changes as one all-or-nothing operation.
 *
 * BEGIN starts the group. COMMIT permanently saves every change. If any step
 * fails, ROLLBACK cancels the whole group. The borrowed connection is returned
 * whether the operation succeeds or fails. A fake database may be passed in
 * during tests, so tests do not need a real PostgreSQL server.
 *
 * Returns the value produced by the supplied operation after every database
 * change is saved. If saving fails, it throws the original error after trying
 * to cancel the changes.
 */
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
            // Preserve the operation error because it explains the transaction failure.
            console.error("Database rollback failed:", rollbackError);
        }

        throw error;
    } finally {
        client.release();
    }
}

/*
 * This function closes every connection in the shared connection group.
 *
 * Returns a Promise that finishes after every connection has closed.
 */
async function closePool() {
    await pool.end();
}

module.exports = {
    query,
    runTransaction,
    closePool
};
