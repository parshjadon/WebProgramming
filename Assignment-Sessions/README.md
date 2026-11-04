# Using session variables for user data

This extends my previous Express/MySQL registration and login assignment. After a successful login, the server stores the user's ID and username in `req.session.user`. A separate `/profile` page reads the session and displays the username. Its **Log out** link visits `/logout`, which destroys the session and clears its cookie.

## Run locally

1. Start MySQL Server. Run `setup.sql` in MySQL Workbench if the `paws.users` table does not already exist. Accounts from the previous login assignment work with this version.
2. In PowerShell, open this folder and run:

   ```powershell
   npm.cmd install
   $env:ROOTPASS = 'your_mysql_password'
   $env:SESSION_SECRET = (node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))")
   npm.cmd start
   ```

   If your local MySQL root account has no password, omit `ROOTPASS`. Optional database settings are `DB_HOST`, `DB_USER`, `DB_NAME`, and `DB_PORT`; `PORT` defaults to 3000. Keep passwords and session secrets out of GitHub.

3. Visit http://localhost:3000/register.html. Register an account, then log in. Use the server URL rather than opening the HTML files directly.

## Verify the assignment

1. Before login, visit `/profile`. It redirects to the login page.
2. Log in with a registered username and password. Login redirects to `/profile`, which displays **Welcome, your-username!**
3. Refresh `/profile`; the username remains available through the session.
4. Click **Log out**. The server destroys the session and displays a confirmation.
5. Visit `/profile` again; it redirects to login because the session no longer contains user data.
6. An incorrect password does not create a login session.

Run `npm.cmd test` for HTTP tests covering valid and invalid login, profile access, separate sessions, escaped username output, session ID rotation, and logout. Tests use a database fixture; they do not connect to or modify your MySQL database. Registration and real database connectivity should also be checked manually using the steps above.

## Code and submission

- `loginsessionsampleclean.js`: commented login, session configuration, profile, logout, registration, and database code.
- `login.html`, `register.html`, `signup.html`: account forms and navigation.
- `setup.sql`: existing MySQL database schema; no session-related schema change is required.
- `session.test.js`: automated session behavior tests.

Repository: https://github.com/parshjadon/WebProgramming

After this folder is committed and pushed to the `main` branch, submit this code link:

https://github.com/parshjadon/WebProgramming/blob/main/Assignment-Sessions/loginsessionsampleclean.js

Suggested submission: “My login stores user information in a session. The `/profile` page displays the logged-in username, and its `/logout` link destroys the session. The code includes comments explaining the session behavior.”

## Session details

The browser stores a signed session ID; user data stays on the server. Cookies are HTTP-only, use SameSite=Lax, and expire after one hour. Login creates a fresh session ID and saves the session before redirecting. Passwords are salted hashes and are never stored in the session.

The default Express MemoryStore is suitable for this local assignment. Restarting the server clears sessions. A deployed site needs a persistent session store and HTTPS; production mode requires `SESSION_SECRET` and uses secure cookies. If HTTPS terminates at a reverse proxy, configure Express's `trust proxy` for that deployment.
