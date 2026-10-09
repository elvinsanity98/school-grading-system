# BNHS SHS Grading System

Senior High School grading system for **Balakan National High School** (DepEd, Philippines). It follows
DepEd Order No. 8, s. 2015 for computing grades and runs as a **website** and as an **Android app** from one codebase.

- Teachers keep their class record online: items, scores, automatic Written Work / Performance Task / Quarterly Assessment computation and transmutation.
- The registrar approves class records, releases grades, manages learners, sections and enrollment.
- Advisers enter attendance and observed values and print the **SF9** report card.
- The registrar prints the **SF10** permanent record, master lists, summaries and honor rolls.
- Learners and parents see their own approved grades.

> **Status.** All server logic, the web app and the Android project are written and the parts that can run on a
> computer are tested (72 automated tests, plus 5 more when run on PostgreSQL, a real browser walk-through, generated PDFs inspected). The Android
> app has **not** been built into an APK or run on a phone yet, because this machine has no Android SDK.
> See [docs/ANDROID.md](docs/ANDROID.md). Read [Known limits](#known-limits) before using it for real records.

## Try it in a few minutes

You need [Node.js](https://nodejs.org) 22 LTS (20.19 or newer also works).

```bash
npm install
npm run demo
```

Open <http://localhost:3000> and press one of the role buttons (administrator, registrar, class adviser, subject teacher, learner,
parent). They all use the password `Demo#2026`. The demo has 68 made-up learners in 5 sections: a finished semester, an approvals queue and a class still being encoded.
It lives in its own file (`apps/server/data/demo.db`) and never touches real data.

**Want a public link to show others?** Deploy the same thing online with one click: in Render choose New, Blueprint and pick
this repository (`render.yaml`). See *Public demo* in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Using it at school

1. On a school computer, install Node.js LTS, copy this folder and double-click **`start-server.bat`**
   (Windows) or run `npm install && npm run build && npm start`.
2. Open the address it shows. The **first screen creates the school, the administrator account and the first
   school year**. There are no default passwords.
3. Follow the *Getting started* checklist on the dashboard: school profile, curriculum, teachers, sections,
   learners, open Quarter 1.
4. Teachers and staff open the same address in any browser on the school network (phones too), or install the
   Android app and type the server address once.

More: [docs/USER-GUIDE.md](docs/USER-GUIDE.md) (by role), [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
(school PC, internet, HTTPS, backups), [docs/ANDROID.md](docs/ANDROID.md), [docs/DEPED-RULES.md](docs/DEPED-RULES.md).

## How grades are computed

For one learner, one subject, one quarter (DO 8, s. 2015):

| Step | Rule |
| --- | --- |
| Percentage Score | total score / highest possible score x 100, per component |
| Weighted Score | Percentage Score x component weight |
| Initial Grade | Weighted Written Work + Performance Tasks + Quarterly Assessment |
| Quarterly Grade | Initial Grade through the DepEd transmutation table (60 becomes 75, 100 stays 100) |
| Semester final grade | average of the two quarterly grades |
| General average | average of the final grades of all subjects |

Weights depend on the subject and the track: core 25/50/25, academic applied and specialized 25/45/30, academic
Work Immersion / Research / Business Enterprise Simulation 35/40/25, TVL / Sports / Arts and Design 20/60/20. They are
editable by the administrator. Worked example and all rules: [docs/DEPED-RULES.md](docs/DEPED-RULES.md).

## Features

| Area | What it does |
| --- | --- |
| Class record | Grid with sticky headers, live computation while typing, autosave, paste from Excel, `EX` for excused items, phone-friendly "by learner" view, Excel export |
| Workflow | Draft, submitted, approved (locked) or returned with a note. Teachers ask the registrar to reopen an approved record. Quarters open and close, and are released to learners separately |
| Learners | Records, CSV import with validation, enrollment, moves between sections, transfers and drop-outs, records from previous schools |
| Report cards | SF9-SHS PDF with grades, descriptors, attendance and observed values; whole section in one file; draft copies are watermarked |
| Permanent record | SF10-SHS PDF from all approved semesters plus encoded previous-school records |
| Lists | Summary of grades, master list, honor roll (DO 36, s. 2016) as Excel |
| Remedial | Remedial marks and recomputed final grades |
| Early warning | Learners with a quarterly grade below 75 on the adviser's and teacher's dashboard |
| People | Administrator, registrar, teacher, learner and parent roles; one-time passwords; account lock after repeated wrong passwords |
| Safety | Audit log of every important action, one-click database backup (SQLite), all traffic can run over HTTPS, tables locked away from Supabase's public web API |

## Technology

| Part | Tools |
| --- | --- |
| Language | TypeScript 7 everywhere, npm workspaces |
| API | Node.js, Fastify 5, Prisma 7 with SQLite (libSQL driver) or PostgreSQL / Supabase, zod 4, jose (tokens), scrypt (passwords), pdfkit, exceljs |
| Web | React 19, Vite 8, Tailwind CSS 4, TanStack Query 5, React Router 7, Lucide icons, installable PWA |
| Android | Capacitor 7 wrapping the same web app |
| Tests | Vitest 4 |
| Shared | `packages/core` holds the DepEd rules so the server and the apps compute identical numbers |

```
packages/core     DepEd grading rules (pure TypeScript, 28 tests)
apps/server       API, database schema and migrations (SQLite + PostgreSQL), PDF and Excel reports (32 tests, 37 on PostgreSQL)
apps/web          React app + Capacitor Android project in apps/web/android (12 tests)
docs/             user guide, deployment, Android, DepEd rules
```

## Development

```bash
npm install            # also generates the Prisma client
npm run dev            # API on :3000 and web app on :5173 (proxied)
npm test               # all tests
npm run typecheck
npm run build          # web app into apps/web/dist, served by the API
npm run db:demo        # fake data into the current database (empty database only)
npm run test:postgres -w @bnhs/server   # the server tests again, on PostgreSQL
```

Useful: `npm run db:reset-password -w @bnhs/server -- <username>` prints a new one-time password for a
locked-out administrator. Copy `apps/server/.env.example` to `.env` to change port, data folder or token lifetime.

## Security and privacy

- Passwords are hashed with scrypt; sign-in tokens are short-lived and stop working when a password is changed or an account is disabled.
- Every endpoint checks the role and, for teachers, advisers and learners, the record they may touch (a teacher only opens their own classes, an adviser only their section, a learner only their own released grades).
- Learners' grades and records are personal information under the Data Privacy Act of 2012 (RA 10173). Keep the server and its backups on trusted machines, use HTTPS whenever the server is reachable from the internet, and let the school's Data Protection Officer review how it is used.
- The audit log (Setup, Audit log) records sign-ins, grade edits, approvals, printing and setup changes.

## Known limits

- **Not yet built or run on Android.** The project is generated and configured; building the APK needs Android Studio or the GitHub workflow (docs/ANDROID.md).
- **Needs the school server.** The app opens without internet but cannot load or save grades without reaching the server. There is no offline queue.
- **Forms are not pixel copies of the official SF9 / SF10.** They carry the same content and layout logic and print on short bond paper. Confirm with your division that printed copies are acceptable, and use DepEd's LIS where it is required.
- **Weights and the transmutation table come from DO 8, s. 2015** as retained by later orders. If DepEd or your division issues new rules (for example a revised Senior High School curriculum), the administrator can edit weights and the curriculum, but the transmutation table and rounding rules are in code (`packages/core`).
- **The sample curriculum is a sample.** Subjects and their semesters differ between schools. Compare it with the program BNHS actually offers (Setup, Curriculum) before creating sections.
- **Node.js 20 on Windows:** the database driver can crash at *shutdown* (after all work is saved) on Node 20. Use Node 22 LTS or newer on the server to avoid it.
- SQLite is the default and fits one school comfortably. **PostgreSQL / Supabase** is supported by setting `DATABASE_URL` (docs/DEPLOYMENT.md). It passes the whole test suite on a local PostgreSQL stand-in but **has not been run against a live Supabase project**, which needs the database password.
- Docker and CI files are provided but were not run on the development machine.
