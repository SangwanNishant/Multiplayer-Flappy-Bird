require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = 3050;

app.use(bodyParser.json());
app.use(cors());
app.use(express.static("public"));

// ================================================================
// SUPABASE CLIENTS
// ================================================================
// Two clients:
//   - supabaseAdmin: uses the service_role key. Server-only. Bypasses RLS,
//     can create/update any row, and can verify access tokens via
//     supabaseAdmin.auth.getUser(token).
//   - supabaseAnon: uses the anon public key. We use it to sign users in
//     with password (it returns an access token we hand to the browser).

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AUTH_EMAIL_DOMAIN = process.env.AUTH_EMAIL_DOMAIN || "flappy.local";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
        "[supabase] Missing env vars. Set SUPABASE_URL, SUPABASE_ANON_KEY, " +
        "SUPABASE_SERVICE_ROLE_KEY in your .env file. See .env.example."
    );
    process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
});
const supabaseAnon = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
});

// Username → internal email mapping. Users never see this address; it just
// lets Supabase Auth (which is email-based) store a username-only account.
const usernameToEmail = (username) =>
    `${String(username).toLowerCase()}@${AUTH_EMAIL_DOMAIN}`;

const MODES = ["SOLO", "MULTIPLAYER"];
function normalizeMode(m) {
    const v = typeof m === "string" ? m.toUpperCase() : "";
    return MODES.includes(v) ? v : "SOLO";
}

// Optional middleware: validate a bearer token and attach req.user.
// Not attached to any route right now (tokens are used client-side for UX),
// but kept here so you can protect future endpoints with one line.
// eslint-disable-next-line no-unused-vars
async function verifyToken(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ message: "Authorization header missing" });
    const token = authHeader.split(" ")[1];
    if (!token) return res.status(401).json({ message: "Authorization header malformed" });
    try {
        const { data, error } = await supabaseAdmin.auth.getUser(token);
        if (error || !data?.user) {
            return res.status(401).json({ message: "Invalid or expired token" });
        }
        req.user = data.user;
        next();
    } catch (err) {
        return res.status(401).json({ message: "Invalid or expired token" });
    }
}

// ================================================================
// STATIC PAGE ROUTES
// ================================================================

app.get("/", (req, res) => {
    res.sendFile(__dirname + "/public/main-menu.html");
});

app.get("/guest", (req, res) => {
    try {
        // Guests don't have a Supabase account; we just mint an opaque token
        // so the client has something to stick in sessionStorage. No endpoint
        // currently validates guest tokens — they're purely a UX marker.
        const token = crypto.randomBytes(24).toString("hex");
        res.json({
            message: "Guest login successful",
            token,
            username: "GUEST",
            mode: "GUEST",
        });
    } catch (error) {
        console.error("Error in /guest route:", error);
        res.status(500).json({ message: "Internal Server Error", error: error.message });
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

    // We normalize usernames to lowercase so that "Alice" and "alice" map to
    // the same account. This also keeps our username→email mapping 1:1.
    const normalized = username.toLowerCase();

    try {
        // Pre-check for a nicer error than the trigger/PK violation.
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
            email_confirm: true, // skip the confirmation email — no inbox exists
            user_metadata: { username: normalized },
        });
        if (error) {
            // Common cases: "User already registered", weak password, etc.
            if (/already/i.test(error.message)) {
                return res.status(409).json({ message: "That username is already taken." });
            }
            console.error("[signup] createUser error:", error);
            return res.status(400).json({ message: error.message || "Signup failed." });
        }

        // Sign the new user in right away so we can return an access token
        // (matches the old flow, which handed a JWT back to the client).
        const { data: session, error: signInErr } = await supabaseAnon.auth.signInWithPassword({
            email,
            password,
        });
        if (signInErr || !session?.session) {
            // Account was created but auto-login failed — client can hit /login.
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
        // Quick profile lookup so we can say "no such account" vs. "wrong password"
        // without leaking timing info from Supabase itself.
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
        // ---- Guest branch: one-off row, tagged with the mode, kept only if
        // it makes the top 10 to avoid flooding the table. ----
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

        // ---- Logged-in user branch ----
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
            const { error: updProfErr } = await supabaseAdmin
                .from("profiles")
                .update({ [bestField]: newBest })
                .eq("id", profile.id);
            if (updProfErr) throw updProfErr;
        }

        // Upsert a single row per (username, mode) that always carries the best
        // score for that user in that mode.
        const { error: upsertErr } = await supabaseAdmin
            .from("leaderboards")
            .upsert(
                { username: profile.username, score: newBest, mode },
                { onConflict: "username,mode" }
            );
        if (upsertErr) throw upsertErr;

        // If the just-inserted row is lower than an existing stored one, the
        // upsert might overwrite. Re-read the row to make sure we didn't demote
        // a better score on a worse attempt.
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

        const { data: updated, error: lbErr } = await supabaseAdmin
            .from("leaderboards")
            .select("username, score, mode")
            .eq("mode", mode)
            .order("score", { ascending: false })
            .limit(10);
        if (lbErr) throw lbErr;

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

// Read-only top-10 fetch — used by the leaderboard page when toggling mode
// without needing to re-submit a score.
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
// SOCKET.IO — SPLIT-SCREEN MULTIPLAYER
// ================================================================
// Design:
//   - Authoritative server: owns bird positions, pipes, scores, collisions.
//   - Matchmaking: FIFO queue — first waiting player is paired with the next.
//   - Tick: 60 Hz physics + state broadcast.
//   - Pipes: deterministic per-room (same for both players) — server spawns them.
//   - When both players are dead, game ends and winner is broadcast.
// ================================================================

// Physics constants — multiplayer is tuned a notch faster than singleplayer
// for a more competitive pace. Gravity and lift are bumped slightly together
// so the flap arc still lands inside a pipe gap cleanly.
const WORLD = {
    width: 800,
    height: 600,
    birdX: 100,
    birdSize: 30,
    gravity: 0.42,
    lift: -6.2,
    terminalVelocity: 14,
    pipeWidth: 75,
    pipeSpeed: 4.8,
    gapHeight: 160,
    pipeSpacing: 300,
    scorePerPipe: 50,
    tickMs: 1000 / 60,
};

function makeRoom(id) {
    return {
        id,
        players: {},
        pipes: [],
        nextPipeId: 1,
        started: false,
        countdown: 0,
        gameOver: false,
        winner: null,
        tickHandle: null,
        tickCount: 0,
    };
}

const rooms = new Map();
let waitingRoomId = null;

function broadcastLobby(room) {
    const lobby = Object.entries(room.players).map(([sid, p]) => ({
        sid,
        side: p.side,
        name: p.name,
        ready: p.ready,
    }));
    io.to(room.id).emit("lobby", {
        roomId: room.id,
        players: lobby,
        needed: 2,
    });
}

function startGameLoop(room) {
    if (room.tickHandle) return;
    room.tickHandle = setInterval(() => stepRoom(room), WORLD.tickMs);
}

function stopGameLoop(room) {
    if (room.tickHandle) {
        clearInterval(room.tickHandle);
        room.tickHandle = null;
    }
}

function resetRoom(room) {
    for (const sid of Object.keys(room.players)) {
        const p = room.players[sid];
        p.y = WORLD.height / 2;
        p.vy = 0;
        p.alive = true;
        p.score = 0;
        p.ready = false;
    }
    room.pipes = [];
    room.nextPipeId = 1;
    room.started = false;
    room.gameOver = false;
    room.winner = null;
    room.tickCount = 0;
}

function stepRoom(room) {
    room.tickCount++;

    for (const sid in room.players) {
        const p = room.players[sid];
        if (!p.alive) continue;
        p.vy += WORLD.gravity;
        if (p.vy > WORLD.terminalVelocity) p.vy = WORLD.terminalVelocity;
        p.y += p.vy;

        if (p.y < 0 || p.y + WORLD.birdSize > WORLD.height) {
            p.alive = false;
        }
    }

    for (const pipe of room.pipes) pipe.x -= WORLD.pipeSpeed;
    room.pipes = room.pipes.filter((p) => p.x + WORLD.pipeWidth > 0);

    const last = room.pipes[room.pipes.length - 1];
    if (!last || last.x < WORLD.width - WORLD.pipeSpacing) {
        const minTop = 100;
        const maxTop = WORLD.height - WORLD.gapHeight - 100;
        const gapY = minTop + Math.random() * Math.max(1, maxTop - minTop);
        room.pipes.push({
            id: room.nextPipeId++,
            x: WORLD.width,
            gapY,
            passedLeft: false,
            passedRight: false,
        });
    }

    for (const sid in room.players) {
        const p = room.players[sid];
        if (!p.alive) continue;
        const flag = p.side === "left" ? "passedLeft" : "passedRight";
        for (const pipe of room.pipes) {
            if (!pipe[flag] && pipe.x + WORLD.pipeWidth < WORLD.birdX) {
                pipe[flag] = true;
                p.score += WORLD.scorePerPipe;
            }
            const overlapX =
                WORLD.birdX + WORLD.birdSize > pipe.x &&
                WORLD.birdX < pipe.x + WORLD.pipeWidth;
            if (overlapX) {
                const gapTop = pipe.gapY;
                const gapBottom = pipe.gapY + WORLD.gapHeight;
                if (p.y < gapTop || p.y + WORLD.birdSize > gapBottom) {
                    p.alive = false;
                }
            }
        }
    }

    const playerList = Object.values(room.players);
    const allDead = playerList.length >= 2 && playerList.every((p) => !p.alive);
    if (allDead && !room.gameOver) {
        room.gameOver = true;
        let winner = null;
        const [a, b] = playerList;
        if (a.score > b.score) winner = a.side;
        else if (b.score > a.score) winner = b.side;
        else winner = "tie";
        room.winner = winner;

        io.to(room.id).emit("gameOver", {
            winner,
            scores: Object.fromEntries(
                Object.entries(room.players).map(([sid, p]) => [p.side, p.score])
            ),
        });
        stopGameLoop(room);
        return;
    }

    io.to(room.id).emit("state", {
        tick: room.tickCount,
        players: Object.fromEntries(
            Object.entries(room.players).map(([sid, p]) => [
                p.side,
                { y: p.y, alive: p.alive, score: p.score, name: p.name },
            ])
        ),
        pipes: room.pipes.map((p) => ({ id: p.id, x: p.x, gapY: p.gapY })),
    });
}

function startCountdownThenGame(room) {
    room.countdown = 3;
    io.to(room.id).emit("countdown", room.countdown);
    const interval = setInterval(() => {
        room.countdown--;
        io.to(room.id).emit("countdown", room.countdown);
        if (room.countdown <= 0) {
            clearInterval(interval);
            room.started = true;
            io.to(room.id).emit("gameStart", { world: WORLD });
            startGameLoop(room);
        }
    }, 1000);
}

io.on("connection", (socket) => {
    console.log(`[socket] connected ${socket.id}`);

    socket.on("findMatch", ({ name } = {}) => {
        const playerName = (name && String(name).slice(0, 20)) || `P-${socket.id.slice(0, 4)}`;
        console.log(`[match] ${socket.id} (${playerName}) looking for match`);

        let room;
        if (waitingRoomId && rooms.has(waitingRoomId)) {
            room = rooms.get(waitingRoomId);
            room.players[socket.id] = {
                side: "right",
                name: playerName,
                y: WORLD.height / 2,
                vy: 0,
                alive: true,
                score: 0,
                ready: false,
            };
            waitingRoomId = null;
        } else {
            const roomId = `room_${crypto.randomBytes(4).toString("hex")}`;
            room = makeRoom(roomId);
            room.players[socket.id] = {
                side: "left",
                name: playerName,
                y: WORLD.height / 2,
                vy: 0,
                alive: true,
                score: 0,
                ready: false,
            };
            rooms.set(roomId, room);
            waitingRoomId = roomId;
        }

        socket.join(room.id);
        socket.data.roomId = room.id;
        socket.data.side = room.players[socket.id].side;

        socket.emit("matched", {
            roomId: room.id,
            side: room.players[socket.id].side,
            world: WORLD,
        });
        broadcastLobby(room);
        console.log(
            `[match] ${socket.id} joined ${room.id} as ${room.players[socket.id].side} (${Object.keys(room.players).length}/2)`
        );
    });

    socket.on("ready", () => {
        const room = rooms.get(socket.data.roomId);
        if (!room) return;
        const me = room.players[socket.id];
        if (!me) return;
        me.ready = !me.ready;
        broadcastLobby(room);

        const all = Object.values(room.players);
        console.log(
            `[match] ${socket.id} ready=${me.ready} in ${room.id}; readyCount=${all.filter((p) => p.ready).length}/${all.length}`
        );
        if (all.length === 2 && all.every((p) => p.ready) && !room.started && !room.gameOver) {
            console.log(`[match] starting countdown for ${room.id}`);
            startCountdownThenGame(room);
        }
    });

    socket.on("flap", () => {
        const room = rooms.get(socket.data.roomId);
        if (!room || !room.started || room.gameOver) return;
        const me = room.players[socket.id];
        if (!me || !me.alive) return;
        me.vy = WORLD.lift;
    });

    socket.on("doubleFlap", () => {
        const room = rooms.get(socket.data.roomId);
        if (!room || !room.started || room.gameOver) return;
        const me = room.players[socket.id];
        if (!me || !me.alive) return;
        me.vy = WORLD.lift * 2;
    });

    socket.on("playAgain", () => {
        const room = rooms.get(socket.data.roomId);
        if (!room) return;
        if (!room.gameOver) return;
        resetRoom(room);
        broadcastLobby(room);
    });

    socket.on("disconnect", () => {
        console.log(`[socket] disconnected ${socket.id}`);
        const roomId = socket.data.roomId;
        if (!roomId) return;
        const room = rooms.get(roomId);
        if (!room) return;

        delete room.players[socket.id];
        if (waitingRoomId === roomId && Object.keys(room.players).length === 0) {
            waitingRoomId = null;
        }

        if (Object.keys(room.players).length === 0) {
            stopGameLoop(room);
            rooms.delete(roomId);
            return;
        }

        io.to(roomId).emit("opponentLeft");
        stopGameLoop(room);
        room.started = false;
        room.gameOver = true;
    });
});

server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`[supabase] connected to ${SUPABASE_URL}`);
});
