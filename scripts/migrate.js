#!/usr/bin/env node
// Apply supabase/schema.sql to the configured Supabase Postgres database.
//
// Usage:
//   1. Copy the Postgres connection string from Supabase:
//      Dashboard → Project Settings → Database → Connection string → "URI"
//      Pick the "Transaction pooler" or "Session pooler" option so it works
//      from any network. Paste it into .env as SUPABASE_DB_URL.
//   2. Run `npm run migrate`.
//
// Idempotent — schema.sql uses `create ... if not exists` and `drop policy
// if exists`, so running it twice is harmless.

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

const DB_URL = process.env.SUPABASE_DB_URL;
if (!DB_URL) {
    console.error(
        "\n[migrate] Missing SUPABASE_DB_URL in .env.\n\n" +
        "Get it from: Supabase dashboard → Project Settings → Database →\n" +
        "  Connection string → URI (choose the pooler option).\n\n" +
        "Example:\n" +
        "  SUPABASE_DB_URL=postgresql://postgres.abcdefgh:YOUR-DB-PASSWORD@aws-0-ap-south-1.pooler.supabase.com:6543/postgres\n"
    );
    process.exit(1);
}

const SCHEMA_PATH = path.join(__dirname, "..", "supabase", "schema.sql");
if (!fs.existsSync(SCHEMA_PATH)) {
    console.error(`[migrate] schema file not found at ${SCHEMA_PATH}`);
    process.exit(1);
}

const sql = fs.readFileSync(SCHEMA_PATH, "utf8");

(async () => {
    const client = new Client({
        connectionString: DB_URL,
        // Supabase requires TLS. rejectUnauthorized=false lets us avoid
        // shipping their CA bundle; the connection is still encrypted.
        ssl: { rejectUnauthorized: false },
    });

    try {
        console.log("[migrate] connecting...");
        await client.connect();
        console.log("[migrate] running schema.sql...");
        await client.query(sql);
        console.log("[migrate] done.\n");

        // Sanity check: list the tables we expect.
        const { rows } = await client.query(`
            select table_name
            from information_schema.tables
            where table_schema = 'public'
              and table_name in ('profiles','leaderboards')
            order by table_name;
        `);
        console.log("[migrate] public tables now present:");
        for (const r of rows) console.log("  -", r.table_name);
        if (rows.length !== 2) {
            console.warn("[migrate] WARNING: expected 2 tables, found", rows.length);
            process.exit(2);
        }
    } catch (err) {
        console.error("\n[migrate] FAILED:");
        console.error(err.message || err);
        process.exit(1);
    } finally {
        await client.end().catch(() => {});
    }
})();
