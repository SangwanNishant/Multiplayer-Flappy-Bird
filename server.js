require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const app = express();

// Most hosts (Render, Railway, Fly, Heroku) inject a PORT env var — honor it
// if present, otherwise default to 3050 for local dev.
const PORT = process.env.PORT || 3050;

app.use(bodyParser.json());
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));

// ================================================================
// SUPABASE CLIENTS
// ================================================================
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AUTH_EMAIL_DOMAIN = process.env.AUTH_EMAIL_DOMAIN || "flappy.local";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
        "[supabase] Missing env vars. Set SUPABASE_URL, SUPABASE_ANON_KEY, " +
        "SUPABASE_SERVICE_ROLE_KEY in your .env file. See .env.example."
    );
    // On Vercel, process.exit() will make the function fail-loud so the
    // error surfaces in the deploy logs instead of silently 500ing.
    if (require.main === module) process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
});
const supabaseAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
});

const usernameToEmail = (username) =>
    `${String(username).toLowerCase()}@${AUTH_EMAIL_DOMAIN}`;

const MODES = ["SOLO", "MULTIPLAYER"];
function normalizeMode(m) {
    const v = typeof m === "string" ? m.toUpperCase() : "";
    return MODES.includes(v) ? v : "SOLO";
}

// ================================================================
// STATIC PAGE ROUTES
// ================================================================

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "main-menu.html"));
});

app.get("/guest", (req, res) => {
    try {
        const token = crypto.randomBytes(24).toString("hex");
        res.json({
            message: "Guest login successful",
            token,
            username: "GUEST",
            mode: "GUEST",
        });
    } catch (error) {
        console.error("Error in /guest route:", error);
        res.status(500).json({ message: "Internal Server Error" });
    }
});

app.get("/guest-game", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "game-guest.html"));
});

app.get("/user", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "user-menu.html"));
});

app.get("/user-game", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "user-game.html"));
});

app.get("/start", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "start.html"));
});

app.get("/option-mode-guest", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "game_mode.html"));
});

app.get("/multiplayer", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "multiplayer.html"));
});

app.get("/split-screen-game", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "split_screen.html"));
});

app.get("/leaderboard", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "leaderboard.html"));
});

// ================================================================
// /config — exposes the SUPABASE_URL and public anon key to the browser
// so split_screen.js can boot a Realtime client. These values are safe
// to ship to the client; RLS policies in the DB keep writes locked down.
// ================================================================

app.get("/config", (req, res) => {
    res.json({
        supabaseUrl: SUPABASE_URL,
        supabaseAnonKey: SUPABASE_ANON_KEY,
    });
});

// ================================================================
// AUTH — backed by Supabase Auth
// ================================================================

app.post("/signup", async (req, res) => {
    let { username, password } = req.body || {};
    username = typeof username === "string" ? username.trim() : "";
    password = typeof password === "string" ? password : "";

    if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required." });
    }
    if (username.length < 3 || username.length > 20) {
        return res.status(400).json({ message: "Username must be 3-20 characters." });
    }
    if (!/^[A-Za-z0-9_]+$/.test(username)) {
        return res.status(400).json({ message: "Only letters, numbers and underscores are allowed in username." });
    }
    if (password.length < 6) {
        return res.status(400).json({ message: "Password must be at least 6 characters." });
    }

    const normalized = username.toLowerCase();

    try {
        const { data: existing, error: existingErr } = await supabaseAdmin
            .from("profiles")
            .select("id")
            .eq("username", normalized)
            .maybeSingle();
        if (existingErr) throw existingErr;
        if (existing) {
            return res.status(409).json({ message: "That username is already taken." });
        }

        const email = usernameToEmail(normalized);
        const { data, error } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { username: normalized },
        });
        if (error) {
            if (/already/i.test(error.message)) {
                return res.status(409).json({ message: "That username is already taken." });
            }
            console.error("[signup] createUser error:", error);
            return res.status(400).json({ message: error.message || "Signup failed." });
        }

        const { data: session, error: signInErr } = await supabaseAnon.auth.signInWithPassword({
            email,
            password,
        });
        if (signInErr || !session?.session) {
            return res.status(201).json({
                message: "User created. Please log in.",
                username: normalized,
            });
        }

        return res.status(201).json({
            message: "User created successfully",
            username: normalized,
            token: session.session.access_token,
            refreshToken: session.session.refresh_token,
            mode: "USER",
        });
    } catch (error) {
        console.error("Error during signup:", error);
        return res.status(500).json({ message: "Server error. Please try again." });
    }
});

app.post("/login", async (req, res) => {
    let { username, password } = req.body || {};
    username = typeof username === "string" ? username.trim() : "";
    password = typeof password === "string" ? password : "";

    if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required." });
    }

    const normalized = username.toLowerCase();
    const email = usernameToEmail(normalized);

    try {
        const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("id, username")
            .eq("username", normalized)
            .maybeSingle();
        if (!profile) {
            return res.status(404).json({ message: "No account with that username." });
        }

        const { data, error } = await supabaseAnon.auth.signInWithPassword({ email, password });
        if (error || !data?.session) {
            return res.status(401).json({ message: "Wrong username or password." });
        }

        return res.status(200).json({
            message: "Login successful",
            token: data.session.access_token,
            refreshToken: data.session.refresh_token,
            username: profile.username,
            mode: "USER",
        });
    } catch (error) {
        console.error("Error during login:", error);
        return res.status(500).json({ message: "Server error. Please try again." });
    }
});

// ================================================================
// Note on matchmaking: there is none on the server. Two browsers pair
// up via a Supabase Realtime Presence channel (`lobby:mp`) and then
// play the match over a Broadcast channel (`match:<matchId>`). See
// public/split_screen.js for the protocol. No server, no DB, no
// persistent connection — perfect for Vercel's serverless model.
// ================================================================

// ================================================================
// SCORES & LEADERBOARDS
// ================================================================

app.post("/submit-score", async (req, res) => {
    let { username, score, mode } = req.body || {};
    mode = normalizeMode(mode);
    score = Number(score);
    if (!Number.isFinite(score) || score < 0) {
        return res.status(400).json({ message: "Invalid score." });
    }

    try {
        if (username === "GUEST" || !username) {
            const guestName = `GUEST_${Math.random().toString(36).substring(2, 10)}`;

            const { data: top, error: topErr } = await supabaseAdmin
                .from("leaderboards")
                .select("score")
                .eq("mode", mode)
                .order("score", { ascending: false })
                .limit(10);
            if (topErr) throw topErr;

            const room = !top || top.length < 10 || score > top[top.length - 1].score;
            if (room) {
                const { error: insErr } = await supabaseAdmin
                    .from("leaderboards")
                    .insert({ username: guestName, score, mode });
                if (insErr) throw insErr;
            }

            const { data: updated, error: updErr } = await supabaseAdmin
                .from("leaderboards")
                .select("username, score, mode")
                .eq("mode", mode)
                .order("score", { ascending: false })
                .limit(10);
            if (updErr) throw updErr;

            return res.status(200).json({
                leaderboard: updated || [],
                username: guestName,
                score,
                mode,
            });
        }

        const normalized = String(username).toLowerCase();

        const { data: profile, error: profileErr } = await supabaseAdmin
            .from("profiles")
            .select("id, username, highest_solo, highest_multiplayer")
            .eq("username", normalized)
            .maybeSingle();
        if (profileErr) throw profileErr;
        if (!profile) return res.status(404).json({ message: "User not found" });

        const bestField = mode === "MULTIPLAYER" ? "highest_multiplayer" : "highest_solo";
        const currentBest = profile[bestField] || 0;
        const newBest = Math.max(currentBest, score);

        if (newBest > currentBest) {
            await supabaseAdmin
                .from("profiles")
                .update({ [bestField]: newBest })
                .eq("id", profile.id);
        }

        await supabaseAdmin
            .from("leaderboards")
            .upsert(
                { username: profile.username, score: newBest, mode },
                { onConflict: "username,mode" }
            );

        const { data: row } = await supabaseAdmin
            .from("leaderboards")
            .select("score")
            .eq("username", profile.username)
            .eq("mode", mode)
            .maybeSingle();
        if (row && row.score < newBest) {
            await supabaseAdmin
                .from("leaderboards")
                .update({ score: newBest })
                .eq("username", profile.username)
                .eq("mode", mode);
        }

        const { data: updated } = await supabaseAdmin
            .from("leaderboards")
            .select("username, score, mode")
            .eq("mode", mode)
            .order("score", { ascending: false })
            .limit(10);

        return res.status(200).json({
            leaderboard: updated || [],
            username: profile.username,
            score,
            mode,
        });
    } catch (error) {
        console.error("Error in /submit-score:", error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
});

app.get("/leaderboard-data", async (req, res) => {
    const mode = normalizeMode(req.query.mode);
    try {
        const { data, error } = await supabaseAdmin
            .from("leaderboards")
            .select("username, score, mode")
            .eq("mode", mode)
            .order("score", { ascending: false })
            .limit(10);
        if (error) throw error;
        return res.status(200).json({ leaderboard: data || [], mode });
    } catch (error) {
        console.error("Error in /leaderboard-data:", error);
        return res.status(500).json({ message: "Internal Server Error" });
    }
});

// ================================================================
// LOCAL DEV ENTRY POINT
// ================================================================
// Only call app.listen() when running directly (`node server.js` /
// `npm start` / `npm run dev`). On Vercel, `api/[...path].js` requires
// this file and hands the Express app off as a serverless function.

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
        console.log(`[supabase] connected to ${SUPABASE_URL}`);
    });
}

module.exports = app;
