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
| `DATA_DIR` | Folder for the database and the token secret (default `apps/server/data`) |
| `JWT_SECRET` | 32+ characters. If absent, a random one is created in `DATA_DIR/jwt.secret` |
| `TOKEN_TTL` | How long a sign-in lasts (default `12h`) |
| `CORS_ORIGINS` | Extra sites allowed to call the API. Not needed for the built-in website or the Android app |

## Backups (do this)

- **In the app:** administrator, *System and backup*, *Download backup*. It is a consistent copy of the whole database.
  Do it after each quarter is approved, and keep copies off the server (flash drive, school head's laptop).
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

## PostgreSQL (optional, untested)

The schema uses only portable column types. To try PostgreSQL: set `provider = "postgresql"` in
`apps/server/prisma/schema.prisma`, install `@prisma/adapter-pg`, use it in `apps/server/src/db.ts`, delete
`prisma/migrations`, run `prisma migrate dev --name init`. For one school, SQLite is simpler and sufficient.

## Privacy checklist

- Only the ICT coordinator and the administrator can reach the server computer.
- Use a strong administrator password; disable accounts of teachers who leave (Setup, Users, *Disable*).
- Do not send exports (Excel, CSV, backups) through public chat apps.
- Tell learners and parents what is stored and why, as the Data Privacy Act requires, and ask your Data Protection Officer to review.
