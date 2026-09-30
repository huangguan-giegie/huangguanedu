# Deploy on an existing Alibaba Cloud ECS + OSS

This deployment profile is for an ECS that already has a host-level Nginx serving other sites. It intentionally keeps huangguanedu isolated:

```text
Internet
  -> existing host Nginx :80/:443
      -> 127.0.0.1:3001 -> huangguanedu web container
                            -> postgres container (Docker private network)
                            -> OSS private bucket
                            -> DashScope
      -> huangguanedu jobs container
```

The project Nginx service in `docker-compose.yml` is **not** used by this profile, so it cannot take over ports 80/443.

## 1. ECS prerequisites

Recommended baseline:

- Ubuntu LTS
- Docker Engine + Docker Compose plugin
- host Nginx already installed and running
- at least 2 GB RAM; for a 2 GB host shared with other applications, add swap before building images
- security group: public 80/443 only; restrict SSH 22 to administrator IPs

Optional 4 GB swap for a small shared ECS:

```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

## 2. Prepare the application

```bash
sudo mkdir -p /opt/huangguanedu
sudo chown "$USER":"$USER" /opt/huangguanedu

git clone https://github.com/huangguan-giegie/huangguanedu.git /opt/huangguanedu
cd /opt/huangguanedu

cp deploy/production.env.example .env.production
chmod 600 .env.production
nano .env.production
```

Replace every `CHANGE_ME` value.

Generate independent secrets:

```bash
openssl rand -hex 32
openssl rand -hex 32
```

Use one output for `SESSION_SECRET` and the other for `CRON_SECRET`.

### PostgreSQL URL

The database hostname must remain `postgres` because the web/jobs containers resolve the database through the Compose network:

```text
postgresql://USER:PASSWORD@postgres:5432/DB_NAME?sslmode=disable
```

If the database password contains URL-reserved characters, URL-encode the password portion in `DATABASE_URL`.

## 3. OSS

Use a **private** bucket and a least-privilege RAM identity. Do not use the Alibaba Cloud root-account AccessKey.

For an OSS bucket in Shanghai, the application settings are:

```env
OSS_ENDPOINT=https://oss-cn-shanghai.aliyuncs.com
OSS_REGION=oss-cn-shanghai
```

Keep the public OSS endpoint in application configuration. The authenticated image endpoint returns short-lived signed URLs to the browser and Qwen, so an `-internal` endpoint would not be reachable by external clients.

The backup helper uses ossutil 2.x, whose region ID is configured separately:

```env
OSSUTIL_REGION=cn-shanghai
```

## 4. Build and start PostgreSQL

```bash
cd /opt/huangguanedu

docker compose \
  --env-file .env.production \
  -f docker-compose.ecs.yml \
  up -d postgres

docker compose \
  --env-file .env.production \
  -f docker-compose.ecs.yml \
  ps
```

## 5. Build the application and apply migrations

```bash
docker compose \
  --env-file .env.production \
  -f docker-compose.ecs.yml \
  build web jobs

docker compose \
  --env-file .env.production \
  -f docker-compose.ecs.yml \
  run --rm web npx prisma migrate deploy
```

Do **not** run `prisma db seed` in production.

Start web and jobs:

```bash
docker compose \
  --env-file .env.production \
  -f docker-compose.ecs.yml \
  up -d web jobs
```

The only host port exposed by this stack is:

```text
127.0.0.1:3001 -> web:3000
```

PostgreSQL is not exposed to the host or Internet.

Smoke test from the ECS:

```bash
curl -I http://127.0.0.1:3001/
```

## 6. Reuse the existing host Nginx

Copy `deploy/nginx-huangguanedu.conf.example` into the host Nginx configuration and replace:

- `academy.example.com`
- TLS certificate path
- TLS private-key path

Then validate before reloading:

```bash
sudo nginx -t
sudo systemctl reload nginx
```

Set `APP_BASE_URL` in `.env.production` to the exact public HTTPS origin used by this server block.

## 7. Production verification

```bash
cd /opt/huangguanedu

docker compose --env-file .env.production -f docker-compose.ecs.yml ps

docker compose --env-file .env.production -f docker-compose.ecs.yml logs --tail=100 web

docker compose --env-file .env.production -f docker-compose.ecs.yml logs --tail=100 jobs
```

Verify manually:

1. HTTPS opens without certificate errors.
2. Login and password change work.
3. Uploading a wrong-question image succeeds.
4. Opening the image follows a temporary OSS signed URL and succeeds.
5. A queued analysis job is picked up by `jobs`.
6. The browser console and server logs do not expose OSS or DashScope secrets.

## 8. PostgreSQL backup to OSS

Install **ossutil 2.x** on the ECS and verify:

```bash
ossutil version
```

Run one backup manually:

```bash
cd /opt/huangguanedu
bash scripts/backup-postgres-to-oss.sh .env.production
```

The script:

- runs `pg_dump --format=custom` inside the PostgreSQL container;
- calculates SHA-256;
- uploads both the dump and checksum to OSS;
- verifies both uploaded objects with `ossutil stat`;
- deletes old **local** backup files after `BACKUP_RETENTION_DAYS`.

It intentionally does not delete remote OSS backups. Configure an OSS Lifecycle rule for remote retention.

Example daily cron at 03:20:

```cron
20 3 * * * cd /opt/huangguanedu && /usr/bin/flock -n /var/lock/huangguanedu-backup.lock /bin/bash scripts/backup-postgres-to-oss.sh .env.production >> /var/log/huangguanedu-backup.log 2>&1
```

## 9. Restore test

Download a dump and its `.sha256` file from OSS, then verify:

```bash
sha256sum -c huangguanedu-YYYYMMDDTHHMMSSZ.dump.sha256
```

Before restoring production data, stop writers:

```bash
docker compose --env-file .env.production -f docker-compose.ecs.yml stop web jobs
```

Restore the custom-format dump:

```bash
cat huangguanedu-YYYYMMDDTHHMMSSZ.dump | \
docker compose --env-file .env.production -f docker-compose.ecs.yml exec -T postgres \
  pg_restore \
  --username="$POSTGRES_USER" \
  --dbname="$POSTGRES_DB" \
  --clean \
  --if-exists \
  --no-owner \
  --no-acl
```

After validation:

```bash
docker compose --env-file .env.production -f docker-compose.ecs.yml up -d web jobs
```

A restore should be rehearsed periodically; an untested backup is not a recovery plan.

## 10. Upgrade procedure

```bash
cd /opt/huangguanedu
git pull --ff-only

# Backup before schema/application changes.
bash scripts/backup-postgres-to-oss.sh .env.production

docker compose --env-file .env.production -f docker-compose.ecs.yml build web jobs

docker compose --env-file .env.production -f docker-compose.ecs.yml run --rm web \
  npx prisma migrate deploy

docker compose --env-file .env.production -f docker-compose.ecs.yml up -d web jobs

docker compose --env-file .env.production -f docker-compose.ecs.yml logs --tail=100 web jobs
```
