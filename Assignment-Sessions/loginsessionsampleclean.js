const express = require("express");
const crypt = require("node:crypto");
const path = require("node:path");
const { promisify } = require("node:util");
const mysql = require("mysql2/promise");
const session = require("express-session");

const app = express();
const hashPassword = promisify(crypt.pbkdf2);
const hashRounds = 210000;
const hashLength = 64;
const port = process.env.PORT || 3000;
const pool = mysql.createPool({
    host: process.env.DB_HOST || "localhost",
    user: process.env.DB_USER || "root",
    password: process.env.ROOTPASS || "",
    database: process.env.DB_NAME || "paws",
    port: Number(process.env.DB_PORT || 3306)
});

app.use(express.urlencoded({ extended: false, limit: "16kb" }));

// Store user data on the server; the browser receives only a signed session ID.
// Set SESSION_SECRET to a long, private value that stays the same across restarts.
if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
    throw new Error("Set SESSION_SECRET before running in production.");
}
const sessionCookie = {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 1000 // One hour.
};
app.use(session({
    name: "assignment.sid",
    secret: process.env.SESSION_SECRET || crypt.randomBytes(32).toString("hex"),
    resave: false,
    saveUninitialized: false,
    cookie: sessionCookie
}));

// Prevent a cached profile from being displayed after logout.
app.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
});

// Serve only the public pages, keeping server code and setup files private.
app.get("/", (req, res) => res.redirect("/register.html"));
app.get("/register.html", (req, res) => res.sendFile(path.join(__dirname, "register.html")));
app.get("/login.html", (req, res) => res.sendFile(path.join(__dirname, "login.html")));
app.get("/signup.html", (req, res) => res.redirect("/register.html"));

function reply(res, status, message, link, label) {
    return res.status(status).send(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Account status</title></head>
<body><main><p>${message}</p><a href="${link}">${label}</a></main></body>
</html>`);
}

// Escape database/session text before inserting it into an HTML response.
function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
}

app.get("/profile", (req, res) => {
    // A profile is available only when login has created this session variable.
    if (!req.session.user) return res.redirect("/login.html");
    return reply(res, 200,
        `Welcome, ${escapeHtml(req.session.user.username)}! This is your profile.`,
        "/logout", "Log out");
});

// The assignment requires a link to /logout, so this route handles GET.
app.get("/logout", (req, res, next) => {
    req.session.destroy(err => {
        if (err) return next(err);
        // Remove the browser's session cookie after destroying server-side data.
        res.clearCookie("assignment.sid", {
            path: "/",
            httpOnly: sessionCookie.httpOnly,
            sameSite: sessionCookie.sameSite,
            secure: sessionCookie.secure
        });
        return reply(res, 200, "You have logged out successfully.", "/login.html", "Back to login");
    });
});

app.post("/register", async (req, res) => {
    const username = typeof req.body.username === "string" ? req.body.username.trim() : "";
    const email = typeof req.body.email === "string" ? req.body.email.trim() : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";

    if (!username || username.length > 50 || email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length > 1024) {
        return reply(res, 400, "Enter a username, a valid e-mail address, and a password.", "/register.html", "Back to registration");
    }

    try {
        const salt = crypt.randomBytes(16).toString("hex");
        const passwordHash = (await hashPassword(password, salt, hashRounds, hashLength, "sha512")).toString("hex");
        await pool.execute(
            "INSERT INTO users (username, email, password_hash, salt) VALUES (?, ?, ?, ?)",
            [username, email, passwordHash, salt]
        );
        return reply(res, 201, "You have successfully registered", "/login.html", "Go to login");
    } catch (err) {
        if (err.code === "ER_DUP_ENTRY") {
            return reply(res, 409, "That username or e-mail address is already registered.", "/login.html", "Go to login");
        }
        console.error("Registration failed:", err.message);
        return reply(res, 500, "Registration could not be completed. Please try again later.", "/register.html", "Back to registration");
    }
});

app.post("/login", async (req, res) => {
    const username = typeof req.body.username === "string" ? req.body.username.trim() : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";
    const failedLogin = () => reply(res, 401, "The login credentials were incorrect", "/login.html", "Back to login");

    if (!username || username.length > 50 || !password || password.length > 1024) {
        return failedLogin();
    }

    try {
        const [users] = await pool.execute("SELECT id, username, password_hash, salt FROM users WHERE username = ?", [username]);
        if (users.length === 0) return failedLogin();

        const suppliedHash = await hashPassword(password, users[0].salt, hashRounds, hashLength, "sha512");
        const savedHash = Buffer.from(users[0].password_hash, "hex");
        if (savedHash.length !== suppliedHash.length || !crypt.timingSafeEqual(savedHash, suppliedHash)) {
            return failedLogin();
        }
        // Replace any old session ID after authentication to prevent session fixation.
        await new Promise((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
        // Save only the user data needed on other pages, never the password or hash.
        req.session.user = { id: users[0].id, username: users[0].username };
        // Finish saving before redirecting, so /profile can immediately read the user.
        await new Promise((resolve, reject) => req.session.save(err => err ? reject(err) : resolve()));
        return res.redirect(303, "/profile");
    } catch (err) {
        console.error("Login failed:", err.message);
        return reply(res, 500, "Login is temporarily unavailable. Please try again later.", "/login.html", "Back to login");
    }
});

app.use((err, req, res, next) => {
    console.error("Request failed:", err.message);
    return reply(res, 500, "Your request could not be completed. Please try again.", "/login.html", "Back to login");
});

async function start() {
    try {
        await pool.query("SELECT username, email, password_hash, salt FROM users LIMIT 0");
        app.listen(port, () => console.log(`Open http://localhost:${port}/register.html`));
    } catch (err) {
        console.error("Could not start. Check MySQL, your database settings, and setup.sql:", err.message);
        await pool.end();
        process.exitCode = 1;
    }
}

if (require.main === module) start();
module.exports = { app, pool };
