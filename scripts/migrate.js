#!/usr/bin/env node
// Apply supabase/schema.sql to the configured Supabase Postgres database.
//
// Usage:
//   1. Copy the Postgres connection string from Supabase:
//      Dashboard → Project Settings → Database → Connection string → "URI"
//      Pick the "Session pooler" (port 5432) or "Transaction pooler" (port
//      6543) option — the direct "db.<ref>.supabase.co" host is IPv6-only
//      on the free tier and won't resolve from most networks.
//      Paste it into .env as SUPABASE_DB_URL.
//   2. Run `npm run migrate`.
//
// Idempotent — schema.sql uses `create ... if not exists` and `drop policy
// if exists`, so running it twice is harmless.
//
// ---------------------------------------------------------------
// If this script keeps timing out no matter what you try, use the
// Supabase dashboard SQL editor as a one-time fallback:
//   1. Open Supabase → SQL Editor → New query
//   2. Paste the contents of supabase/schema.sql
//   3. Click "Run"
// That runs the same migration on the DB directly. After that, this
// migrate script is optional.
// ---------------------------------------------------------------

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

let DB_URL = process.env.SUPABASE_DB_URL;
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

// Auto-fix one very common user mistake: a DB password containing an '@'
// will break URL parsing because the parser thinks the '@' starts the host.
// We URL-encode any '@' characters that appear inside the password section.
DB_URL = fixPasswordAtSign(DB_URL);

function fixPasswordAtSign(url) {
    // Expect: postgresql://<user>:<password>@<host>:<port>/<db>
    const m = url.match(/^(postgres(?:ql)?:\/\/)([^:/?#@]+):([^]*?)@([^@/]+)(.*)$/);
    if (!m) return url;
    const [, proto, user, pw, host, rest] = m;
    if (!pw.includes("@")) return url;
    const encoded = pw.replace(/@/g, "%40");
    console.log("[migrate] password contained '@' — auto URL-encoded it");
    return `${proto}${user}:${encoded}@${host}${rest}`;
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
        ssl: { rejectUnauthorized: false },
        connectionTimeoutMillis: 15000,
    });

    try {
        console.log("[migrate] connecting to", redact(DB_URL));
        await client.connect();
        console.log("[migrate] running schema.sql...");
        await client.query(sql);
        console.log("[migrate] done.\n");

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
        if (/ETIMEDOUT|ENOTFOUND|ENETUNREACH/.test(String(err.code || err))) {
            console.error(
                "\n[migrate] Hint: the direct db.<ref>.supabase.co host is IPv6-only.\n" +
                "         Use the 'Session pooler' or 'Transaction pooler' URL from\n" +
                "         Supabase → Project Settings → Database → Connection pooling.\n" +
                "\n         Or run supabase/schema.sql in the Supabase SQL editor directly.\n"
            );
        }
        process.exit(1);
    } finally {
        await client.end().catch(() => {});
    }
})();

function redact(url) {
    return url.replace(/:[^:@/]+@/, ":****@");
}
