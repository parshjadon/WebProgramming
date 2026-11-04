const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const { pbkdf2Sync } = require("node:crypto");
const { app, pool } = require("./loginsessionsampleclean");

// Exercise the real HTTP/session middleware with a database fixture.
// This makes tests independent of local MySQL credentials and existing accounts.
const username = "student<script>alert(1)</script>";
const salt = "test-only-salt";
const password = "assignment-test-password";
const originalExecute = pool.execute;
pool.execute = async (sql, values) => [[...(values[0] === username ? [{
    id: 1,
    username,
    salt,
    password_hash: pbkdf2Sync(password, salt, 210000, 64, "sha512").toString("hex")
}] : [])]];

const server = app.listen(0, "127.0.0.1");
const ready = new Promise(resolve => server.once("listening", resolve));
after(async () => {
    pool.execute = originalExecute;
    await new Promise(resolve => server.close(resolve));
    await pool.end();
});

test("login saves user data across requests; logout invalidates the original session", async () => {
    await ready;
    const base = `http://127.0.0.1:${server.address().port}`;
    const request = (path, options = {}) => fetch(base + path, { redirect: "manual", ...options });
    const login = (name, pass) => request("/login", {
        method: "POST",
        body: new URLSearchParams({ username: name, password: pass })
    });

    const anonymous = await request("/profile");
    assert.equal(anonymous.status, 302);
    assert.equal(anonymous.headers.get("location"), "/login.html");
    assert.equal(anonymous.headers.get("set-cookie"), null);

    for (const [name, pass] of [[username, "wrong"], ["unknown", password], ["", ""]]) {
        const failed = await login(name, pass);
        assert.equal(failed.status, 401);
        assert.equal(failed.headers.get("set-cookie"), null);
    }

    const successful = await login(username, password);
    assert.equal(successful.status, 303);
    assert.equal(successful.headers.get("location"), "/profile");
    const cookieHeader = successful.headers.get("set-cookie");
    assert.match(cookieHeader, /HttpOnly/);
    assert.match(cookieHeader, /SameSite=Lax/);
    const cookie = cookieHeader.split(";")[0];
    const options = { headers: { Cookie: cookie } };

    const profile = await request("/profile", options);
    assert.equal(profile.status, 200);
    assert.equal(profile.headers.get("cache-control"), "no-store");
    const html = await profile.text();
    assert.ok(html.includes("student&lt;script&gt;alert(1)&lt;/script&gt;"));
    assert.ok(html.includes('href="/logout"'));
    assert.ok(!html.includes("<script>"));

    // A separate browser does not inherit the authenticated user's session.
    assert.equal((await request("/profile")).status, 302);

    // A new login rotates the ID and invalidates the previous ID.
    const second = await login(username, password);
    const secondCookie = second.headers.get("set-cookie").split(";")[0];
    const rotated = await request("/login", {
        method: "POST",
        headers: { Cookie: secondCookie },
        body: new URLSearchParams({ username, password })
    });
    assert.notEqual(rotated.headers.get("set-cookie").split(";")[0], secondCookie);
    assert.equal((await request("/profile", { headers: { Cookie: secondCookie } })).status, 302);

    const logout = await request("/logout", options);
    assert.equal(logout.status, 200);
    assert.match(logout.headers.get("set-cookie"), /assignment\.sid=;/);
    assert.match(await logout.text(), /logged out successfully/);
    // Replaying the old cookie must fail, even if the browser did not remove it.
    assert.equal((await request("/profile", options)).status, 302);
    assert.equal((await request("/logout")).status, 200);
});
