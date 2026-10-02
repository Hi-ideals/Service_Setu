# Deploying ServiceSetu to a local server

Target: `http://100.99.97.110`, over plain HTTP, with Docker Compose.

Three containers on one private network. Only nginx publishes a port — the API
and the database are reachable from inside the network only, so the single way
in from the LAN is through the web container.

```
         LAN                 docker network "servicesetu"
                        ┌──────────────────────────────────────┐
  :80 ──────────────────┤  web    nginx, serves the built app  │
                        │          └ /api/* ──► api:5000       │
                        │  api    Node, the API                │
                        │          └──────────► db:5432        │
                        │  db     PostgreSQL 18                │
                        └──────────────────────────────────────┘
                              volumes: pgdata, uploads
```

---

## Before you start

On the server you need Docker Engine and the Compose plugin:

```bash
docker --version          # 24 or newer
docker compose version    # v2.17 or newer
```

v2.17 matters: the deployment uses `service_completed_successfully`, which
earlier versions do not understand.

---

## 1. Get the code onto the server

```bash
git clone https://github.com/Hi-ideals/Service_Setu.git
cd Service_Setu
```

## 2. Write the configuration

```bash
cp .env.docker.example .env
```

Open `.env` and change four things. Everything else has a working
default.

**Generate two different secrets:**

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Run it twice, once for each.

| Setting | What to put |
|---|---|
| `DB_PASSWORD` | Something long. Not `postgres`. |
| `JWT_ACCESS_SECRET` | First generated value |
| `JWT_REFRESH_SECRET` | Second generated value — **not the same as the first** |
| `SMTP_USER` / `SMTP_PASSWORD` / `EMAIL_FROM` | Your Gmail address and app password |

`EMAIL_FROM` must contain the same address as `SMTP_USER`. A mismatch fails SPF
and Gmail drops the message with no bounce — this has already caught us once.

**Leave `COOKIE_SECURE=false` alone while you are on HTTP.** It is explained in
§7 and it is the one setting that will silently break sign-in.

The name `.env` matters: compose reads it automatically for every command.
Call it anything else and `logs`, `ps` and `down` all need `--env-file`,
and forgetting it on one of them gives a variable-interpolation error that
points nowhere near the real problem.

`.env` is already in `.gitignore`. Keep it that way.

## 3. Build and start

```bash
docker compose up -d --build
```

First run takes a few minutes: it pulls Postgres and nginx, installs
dependencies and builds the frontend bundle.

The order is enforced, not hoped for — `db` becomes healthy, then `migrate`
applies the schema and seeds the catalogue and exits, then `api` starts, then
`web`.

## 4. Watch it come up

```bash
docker compose ps
docker compose logs -f migrate     # should exit 0 after seeding
docker compose logs -f api
```

You are looking for:

```
ServiceSetu API listening on http://localhost:5000/api/v1  [production]
```

`docker compose ps` should show `db`, `api` and `web` as **healthy**, and
`migrate` as **exited (0)**.

## 5. Check it from another machine

```bash
curl -i http://100.99.97.110/api/v1/
curl    http://100.99.97.110/api/v1/categories/tree | head -c 200
```

Then open `http://100.99.97.110` in a browser. You should see the home page
with the six service categories.

## 6. Create your admin

The database was seeded with the catalogue only — **no accounts exist**, by
design. The demo accounts share one published password and have no business on
a machine other people can reach.

Register through the site at `http://100.99.97.110/register`, then promote
yourself:

```bash
docker compose exec db psql -U postgres -d servicesetu \
  -c "UPDATE users SET role = 'admin', email_verified_at = NOW() WHERE email = 'you@example.com';"
```

Sign out and back in. You will land on the admin console.

---

## 7. The one thing that will catch you out

The refresh token is an HttpOnly cookie. Browsers **refuse to store a cookie
marked `Secure` on a plain-HTTP origin** — silently, with nothing in the
console and nothing in any log.

The symptom is specific and confusing: sign-in appears to succeed, you see the
dashboard for a moment, and the next page load returns you to the sign-in
screen. It looks like a session bug. It is not.

`COOKIE_SECURE=false` is what prevents it, and it is set in the template.

Leave it alone unless you move the site to HTTPS. If you do, set it to `true`
at the same time — a Secure cookie over HTTPS is the whole point of having
HTTPS, and leaving it false throws away protection you have paid for.

---

## Day-to-day

**Deploy a change**

```bash
git pull
docker compose up -d --build
```

Migrations run automatically on every `up`. Seeding is idempotent — it upserts
the catalogue and creates no accounts — so repeating it is safe.

**Logs**

```bash
docker compose logs -f api
docker compose logs --tail=100 web
```

**Back up the database** — do this before any upgrade:

```bash
docker compose exec -T db pg_dump -U postgres servicesetu | gzip > backup-$(date +%F).sql.gz
```

**Back up the KYC documents.** These are not in the database and cannot be
regenerated:

```bash
docker run --rm -v servicesetu_uploads:/data -v "$PWD:/out" alpine \
  tar czf /out/uploads-$(date +%F).tar.gz -C /data .
```

**Restore a database backup**

```bash
gunzip -c backup-2026-10-02.sql.gz | docker compose exec -T db psql -U postgres -d servicesetu
```

**Stop**

```bash
docker compose down           # keeps the volumes
docker compose down -v        # DESTROYS the database and every KYC document
```

`-v` is not recoverable. There is no confirmation prompt.

---

## When something is wrong

**`web` is up but the API 502s** — the API is not healthy yet, or it crashed.
`docker compose logs api`. A boot failure is almost always a missing or
malformed value in `.env`; the API refuses to start rather than run
misconfigured, and says which variable.

**Sign-in bounces straight back to the login page** — `COOKIE_SECURE`. See §7.

**`migrate` exited non-zero** — the schema was not applied and `api` will not
start. Read `docker compose logs migrate`. The migration runner is checksummed,
so an edited migration that has already run is refused on purpose.

**Port 80 already in use** — set `WEB_PORT=8080` in `.env` and reach the
site at `http://100.99.97.110:8080`.

**Uploads fail with 413** — nginx caps the body at 10 MB and the API at
`MAX_UPLOAD_MB` (5). Raise `client_max_body_size` in `frontend/nginx.conf` as
well, or the request never reaches the API to be explained properly.

---

## Still outstanding before real customers

- `RAZORPAY_WEBHOOK_SECRET` is empty and `PAYMENT_DRIVER=mock`. No real money
  moves until both are set.
- HTTPS. Running over plain HTTP on a trusted private network is a
  reasonable place to start, but anything reachable more widely needs TLS.
- An offsite copy of the two backups above. A volume on one machine is not a
  backup.
