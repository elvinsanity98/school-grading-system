# Deployment

The system is one Node.js program. It serves the website **and** the API that the Android app talks to, from one
address, and keeps everything in one folder (`apps/server/data`). Pick where to run it.

| Option | Good when | Notes |
| --- | --- | --- |
| A. A school computer on the school network | Most schools. Free. Data stays in school | Devices must be on the school Wi-Fi/LAN |
| B. A cloud server (VPS) | Teachers and learners use it from home too | Needs HTTPS, a domain name, a monthly fee |

Requirements: **Node.js 22 LTS** (20.19 or newer works, but see Known limits in the README), 1 GB RAM, a few hundred MB of disk.

## A. School computer (Windows)

1. Install Node.js LTS from <https://nodejs.org> on the computer that will be the server. Keep it on during school hours.
2. Copy the project folder to it (for example `C:\BNHS-Grading-System`).
3. Double-click **`start-server.bat`**. The first run installs and builds (internet needed once). It prints the addresses.
4. Give the computer a fixed address so phones can always find it: in the router, reserve an IP for this computer
   (DHCP reservation), or set a static IP in Windows. Find the IP with `ipconfig` (IPv4 Address, e.g. `192.168.1.10`).
5. Allow the port through the firewall (once, as administrator):
   ```
   netstat -an | find "3000"
   netsh advfirewall firewall add rule name="BNHS Grades" dir=in action=allow protocol=TCP localport=3000
   ```
6. Everyone on the school network opens `http://192.168.1.10:3000`. Android app users type that address once.
7. Start automatically after a power cut: Task Scheduler, *Create Task*, trigger *At startup*, action *Start a program*
   `C:\BNHS-Grading-System\start-server.bat`, tick *Run whether user is logged on or not*.
   (Alternatives: `pm2` or NSSM to run it as a Windows service.)

The first person to open the address creates the administrator account. Do that yourself before announcing the address.

Plain `http` on a private network is normal for a school LAN. Do not expose that address to the internet; use option B for that.

### Linux

```bash
sudo apt install nodejs npm      # or use nvm to get Node 22
git clone <your copy> && cd BNHS-Grading-System
npm ci && npm run build
NODE_ENV=production npm start    # migrations are applied automatically at start
```
Run it as a service with a systemd unit (`ExecStart=/usr/bin/npm start`, `WorkingDirectory=`, `Restart=always`, `Environment=NODE_ENV=production`).

## B. Cloud server with HTTPS

Rent a small VPS (Ubuntu), install Node 22, copy the project, build and run it as above, on `localhost:3000`.
Put **Caddy** in front for automatic HTTPS. `/etc/caddy/Caddyfile`:

```
grades.yourschool.edu.ph {
    reverse_proxy localhost:3000
}
```

Point the domain's DNS at the server. The Android app then uses `https://grades.yourschool.edu.ph`.
Docker users: `docker compose up -d` builds and runs the included `Dockerfile` with a persistent volume
(these files were written but not run on the development machine).

**Always use HTTPS on the internet.** Sign-in tokens and grades travel over it.

## Configuration

Copy `apps/server/.env.example` to `apps/server/.env`. Everything is optional:

| Setting | Meaning |
| --- | --- |
| `PORT`, `HOST` | Where it listens (default 3000 on all interfaces) |
| `DATA_DIR` | Folder for the SQLite file and the token secret (default `apps/server/data`) |
| `DATABASE_URL` | `postgresql://...` to use PostgreSQL / Supabase instead of the SQLite file (see the Supabase section) |
| `JWT_SECRET` | 32+ characters. If absent, a random one is created in `DATA_DIR/jwt.secret` |
| `TOKEN_TTL` | How long a sign-in lasts (default `12h`) |
| `CORS_ORIGINS` | Extra sites allowed to call the API. Not needed for the built-in website or the Android app |

## Backups (do this)

- **In the app:** administrator, *System and backup*, *Download backup*. It is a consistent copy of the whole database.
  Do it after each term is approved, and keep copies off the server (flash drive, school head's laptop).
- **On the server:** copy the whole `apps/server/data` folder (database plus `jwt.secret`) while the server is stopped, or use the app download while it runs.

**Restore:** stop the server, replace `apps/server/data/bnhs.db` with the backup file (delete `bnhs.db-wal` and
`bnhs.db-shm` if present), start the server. Test a restore once before you need it.

## Updating to a new version

1. Download a backup.
2. Stop the server, replace the project files (keep `apps/server/data`), then run `npm install` and `npm run build`.
3. Start the server. Database migrations run automatically at start.

## Moving to next school year

Setup, School years, *New school year*, then make it current. Create the new sections, enroll returning learners
(Learners, tick *Not yet enrolled this year*, or import the list), assign teachers. Last year's data stays and stays printable.

## Public demo (made-up data, nothing to set up)

To let people try the system without any real records, run it in **demo mode**. The login page then offers one-click
sign-in as an administrator, registrar, teacher, adviser, learner or parent, a banner lets visitors switch role or reset
the data, and everything wipes itself and reloads every few hours. The fake school has 68 learners in 5 sections: a
two finished terms with report cards, honors and a remedial class, an approvals queue, and a class still being encoded.

**On Render, in a few clicks:** Render dashboard, **New**, **Blueprint**, pick this repository, **Apply**. It reads
`render.yaml` and creates `bnhs-grades-demo` on the free plan with no database and no secrets to enter. The web address
is shown on the service page. On the free plan the service sleeps when idle and the first visit takes a minute or two
(the data is reloaded when it wakes).

**On any computer or host:** set `DEMO_MODE=true` (and optionally `DEMO_RESET_HOURS`, default 6) and run `npm start`.
On your own PC, `npm run demo` does the same with a separate file (`apps/server/data/demo.db`).

What demo mode changes: demo data is loaded into an empty database; the accounts all share the public password
`Demo#2026`; changing passwords, creating or editing users and downloading backups are switched off (so one visitor cannot lock
the next one out); visitors may reset the demo at most every 5 minutes. **It refuses to start when `DATABASE_URL` is
PostgreSQL**, so it cannot wipe a real Supabase database. Never enter real learner data into a demo.

## Supabase (PostgreSQL) instead of the local file

By default everything is stored in one SQLite file on the server. The system can store it in **PostgreSQL** instead,
for example a **Supabase** project. Set one setting and nothing else changes: the same server, the same web and
Android apps. Tables are created automatically at start.

**When it makes sense:** the server runs in the cloud (Render, Railway, Fly.io, a VPS) with no permanent disk, or you
want the provider to take care of backups. **When it does not:** a school computer that already keeps a backed-up
file works fine and keeps the data in the school.

> Supabase is used here **only as the database**. The system does not use Supabase's own login, storage or web API.
> The Supabase *project URL* and *publishable key* are not needed and not used.

1. In Supabase create a **new project** for the school (do not reuse the project of another app). Pick the region closest
   to the server, for the Philippines usually *Southeast Asia (Singapore)*. Set a strong database password and keep it.
2. Press **Connect** at the top of the project and copy the **Session pooler** connection string. It looks like
   `postgresql://postgres.<project-ref>:[YOUR-PASSWORD]@aws-0-<region>.pooler.supabase.com:5432/postgres`.
   Use the *Session pooler* (port 5432): it works over IPv4 and supports the database migrations. Do not use the
   *Transaction pooler* (port 6543).
3. On the machine that runs the server, copy `apps/server/.env.example` to `apps/server/.env` and set
   `DATABASE_URL=` to that string with the password filled in (symbols such as `@` `#` `/` written as `%40` `%23` `%2F`).
   On a cloud host put `DATABASE_URL` and `JWT_SECRET` (32+ random characters) in the host's environment settings instead.
4. `npm start`. The log says `Database: PostgreSQL postgres.<ref>@...` and the tables are created. Open the address:
   the first-run screen appears as usual.
5. In Supabase, **Table Editor** should list the tables with *RLS enabled*, and **Project Settings, Data API** can be
   switched off, since this system never uses it.

**Learners' data is protected from Supabase's public web API.** Supabase publishes every table of a project through a
web API opened by the *publishable key*, which is public by design (it sits in every app that uses it). The second
database migration (`lock_down_data_api`) turns on row-level security for all tables and removes the web-API roles'
privileges, so that key can read nothing. The server itself connects with the database owner's login, which is not
affected. An automated test checks this on every table. If you add tables of your own, do the same for them.

**Things to know**
- **Backups.** The *Download backup* button only exists for SQLite. In Supabase use *Database, Backups*. Daily backups
  need a paid plan; on the free plan export regularly (`pg_dump` with the connection string) and remember that
  **free projects pause after a week without use**, which locks everybody out until you resume it.
- **Speed.** Every screen talks to the database over the internet. Keep the server in the same region as the database
  (both in Singapore) for the best speed. A school computer in the Philippines talking to Singapore works but is a
  little slower than a local file.
- **Privacy.** Grades and learner records are then stored on a foreign cloud service. Ask your Data Protection Officer
  and the division office whether that is allowed for your school, and how to inform learners and parents.
- **Switching.** Data is not copied between SQLite and PostgreSQL automatically. Decide before entering real records.
- **Tested with:** the full automated suite runs on PostgreSQL (PGlite, a real Postgres in WebAssembly, through the same
  `pg` driver) and `prisma migrate deploy` was run against it. It has **not** been run against a live Supabase project
  yet, because that needs the database password. Do the first run yourself with an empty project and check steps 4 and 5.

## Privacy checklist

- Only the ICT coordinator and the administrator can reach the server computer.
- Use a strong administrator password; disable accounts of teachers who leave (Setup, Users, *Disable*).
- Do not send exports (Excel, CSV, backups) through public chat apps.
- Tell learners and parents what is stored and why, as the Data Privacy Act requires, and ask your Data Protection Officer to review.
