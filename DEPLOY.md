# Deploying ServiceSetu

Target: **https://services.hiideals.com**, served through a Cloudflare tunnel.

Four containers on one private network plus the tunnel. Nothing is exposed to
the internet directly: cloudflared dials out to Cloudflare and traffic returns
down that connection, so the server accepts no inbound connections at all.
That is also why this works behind CGNAT, where port forwarding cannot.

```
  the internet
        |
   Cloudflare  ..... TLS terminates here, certificate is automatic
        |
        |  (outbound connection, opened by the server)
        |
  +-----------------------------------------------+
  |  cloudflared                                   |
  |       |                                        |
  |  web  |  nginx, serves the built app           |
  |       +-- /api/* --> api:5000                  |
  |  api      Node, the API                        |
  |            +-------> db:5432                   |
  |  db       PostgreSQL 18                        |
  +-----------------------------------------------+
         volumes: pgdata, uploads
```

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

**The domain settings** are already correct in the template - leave them:

```ini
APP_URL=https://services.hiideals.com
CORS_ORIGINS=https://services.hiideals.com
COOKIE_SECURE=true
```

`COOKIE_SECURE=true` is right here because Cloudflare serves the site over
HTTPS. It must only be false if you ever go back to plain HTTP.

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

## 3. Create the uploads folder

KYC documents are written to a folder on the host rather than into Docker's
internal storage, so you can see them and back them up with ordinary tools.

```bash
mkdir -p data/uploads
sudo chown -R 1000:1000 data/uploads
```

The `chown` matters. The API container runs as a non-root user (uid 1000), and
when Docker has to create a missing bind-mount path it creates it owned by
root - the container then cannot write, and uploads fail with an error that
never mentions permissions.

To keep documents on another disk, set an absolute `UPLOADS_PATH` in `.env`
and create that path instead.

## 4. Build and start

```bash
docker compose up -d --build
```

First run takes a few minutes: it pulls Postgres and nginx, installs
dependencies and builds the frontend bundle.

The order is enforced, not hoped for — `db` becomes healthy, then `migrate`
applies the schema and seeds the catalogue and exits, then `api` starts, then
`web`.

## 5. Watch it come up

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

## 6. Check it on the server

The domain does not work yet - the tunnel is step 7. For now the site is
reachable only from the machine itself, which is exactly what you want to
confirm before publishing it.

```bash
curl -I http://localhost:8082/
curl -s http://localhost:8082/api/v1/categories/tree | head -c 200
```

A `200` and a list of categories means the whole stack is working. If you are
on the same network you can also open `http://192.168.29.193:8082` in a
browser to see it rendered.

## 7. Put it on the domain

The stack is now running, reachable only from the server itself. The tunnel
publishes it at services.hiideals.com without opening a port or needing a public
IP.

### Prerequisite

`hiideals.com` must use Cloudflare's nameservers. Check:

```bash
dig NS hiideals.com +short
```

If that does not show `*.ns.cloudflare.com`, add the domain at
dash.cloudflare.com (free plan is fine) and change the nameservers at your
registrar. Propagation is usually under an hour.

### Create the tunnel

1. **one.dash.cloudflare.com** -> **Networks -> Tunnels** -> *Create a tunnel*
2. Type: **Cloudflared**. Name it `servicesetu`.
3. It shows an install command containing `--token eyJhIjoi...` - copy **just
   the token**, the long string after `--token`.
4. On the *Route tunnel* step:
   - Subdomain: `services`
   - Domain: `hiideals.com`
   - Service type: **HTTP**
   - URL: `web:80`

   `web:80` is the container name on the compose network, which is how
   cloudflared reaches nginx. Not localhost, and not the published port.

### Start it

Put the token in `.env`:

```ini
CLOUDFLARE_TUNNEL_TOKEN=eyJhIjoi...
```

Then:

```bash
docker compose --profile tunnel up -d
```

The `--profile tunnel` matters. Without it the cloudflared container is
skipped entirely and nothing reaches the domain.

### Check

```bash
docker compose logs cloudflared --tail=20
```

Look for `Registered tunnel connection`. Then from any machine:

```bash
curl -I https://services.hiideals.com
```

The DNS record is created for you by the tunnel - you do not add one by hand.

### The cookie rule

The refresh token is an HttpOnly cookie. Browsers refuse to store a `Secure`
cookie on a plain-HTTP origin - silently, with nothing in the console and
nothing in any log. The symptom is specific: sign-in appears to work, you see
the dashboard for a moment, and the next page load returns you to sign-in.

`COOKIE_SECURE=true` is correct behind the tunnel, because the browser is on
HTTPS. Only set it false if you ever serve the site over plain HTTP again.

---

## 8. Create your admin

The database was seeded with the catalogue only — **no accounts exist**, by
design. The demo accounts share one published password and have no business on
a machine other people can reach.

Register through the site at `https://services.hiideals.com/register`, then promote
yourself:

```bash
docker compose exec db psql -U postgres -d servicesetu \
  -c "UPDATE users SET role = 'admin', email_verified_at = NOW() WHERE email = 'you@example.com';"
```

Sign out and back in. You will land on the admin console.

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
regenerated. Now that they are an ordinary folder, this needs no Docker
gymnastics:

```bash
tar czf ~/uploads-$(date +%F).tar.gz -C data uploads
```

Or keep a running mirror elsewhere:

```bash
rsync -a --delete data/uploads/ /mnt/backup/servicesetu-uploads/
```

**Restore a database backup**

```bash
gunzip -c backup-2026-10-02.sql.gz | docker compose exec -T db psql -U postgres -d servicesetu
```

**Stop**

```bash
docker compose down           # keeps the volumes
docker compose down -v        # DESTROYS the database. Uploads now survive,
                              # being a folder rather than a volume.
```

`-v` is not recoverable. There is no confirmation prompt.

---

## When something is wrong

**`web` is up but the API 502s** — the API is not healthy yet, or it crashed.
`docker compose logs api`. A boot failure is almost always a missing or
malformed value in `.env`; the API refuses to start rather than run
misconfigured, and says which variable.

**Registration or sign-in fails with "Origin ... is not allowed"** —
`CORS_ORIGINS` in `.env` does not match the address in the browser's bar. An
origin is scheme + host + port and they are compared exactly, so a site on
`:8082` needs `CORS_ORIGINS=https://services.hiideals.com`. Fix it, then
`docker compose up -d api`.

**Sign-in bounces straight back to the login page** — `COOKIE_SECURE`. See §7.

**`migrate` exited non-zero** — the schema was not applied and `api` will not
start. Read `docker compose logs migrate`. The migration runner is checksummed,
so an edited migration that has already run is refused on purpose.

**Port 80 already in use** — set `WEB_PORT=8080` in `.env` and reach the
site at `https://services.hiideals.com:8080`.

**Uploads fail with a permission error** — the uploads folder is owned by
root. Docker creates a missing bind-mount path that way, and the container
runs as uid 1000:

```bash
sudo chown -R 1000:1000 data/uploads
docker compose restart api
```

**Uploads fail with 413** — nginx caps the body at 10 MB and the API at
`MAX_UPLOAD_MB` (5). Raise `client_max_body_size` in `frontend/nginx.conf` as
well, or the request never reaches the API to be explained properly.

---

## Still outstanding before real customers

- `RAZORPAY_WEBHOOK_SECRET` is empty and `PAYMENT_DRIVER=mock`. No real money
  moves until both are set.
- WhatsApp codes need the Meta credentials in `.env`; without them every
  code quietly falls back to email, which works but is not what you set up.
- An offsite copy of the two backups above. A volume on one machine is not a
  backup.
