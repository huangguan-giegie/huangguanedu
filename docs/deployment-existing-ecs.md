# Existing ECS production path

This profile uses an existing host Nginx and an external/native PostgreSQL service. The production path is:

```text
GitHub Actions build -> Actions artifact -> ECS release directory -> systemd -> host Nginx
                                      \-> external/native PostgreSQL
                                      \-> private OSS
```

The 2 GiB ECS must not run a Next.js production build locally. GitHub Actions builds the application and publishes the artifact. The ECS only unpacks that artifact into `/opt/huangguanedu/releases/<git-sha>` and runs the existing systemd unit whose `WorkingDirectory` directly names the selected release. The service uses `/opt/node-v22/bin/node` and listens on `172.18.0.1:3001`; the host Nginx proxies to that address.

## Host prerequisites

- Alibaba Cloud Linux with systemd and host Nginx
- Node.js runtime and `pg_dump` on the host
- Network access from ECS to external PostgreSQL, restricted by private address and firewall
- A private OSS bucket and least-privilege RAM credentials
- A 2 GiB host must have enough swap for the runtime; it must not build Next.js locally

## Release layout

Keep release directories immutable after publication:

```text
/opt/huangguanedu/
  releases/<git-sha>/
  .env.production
```

Copy the GitHub Actions artifact into its release directory, verify the artifact checksum, and set the environment file to mode `600`. The systemd unit should run `next start` from the selected `/opt/huangguanedu/releases/<git-sha>` and load `/opt/huangguanedu/.env.production`. Apply Prisma migrations from the selected release with `npm run db:deploy`; do not run the seed command in production.

## Host Nginx

Adapt `deploy/nginx-huangguanedu.conf.example` for the existing Nginx, certificate paths, public hostname, and upstream `172.18.0.1:3001`. Validate with `nginx -t` and follow the host's normal configuration loading procedure. The application must set `TRUSTED_PROXY=true` and `TRUSTED_PROXY_HOPS=1` only when this Nginx overwrites the forwarded headers.

## Native PostgreSQL backup

Install Node.js dependencies for the shared host helper and make sure `pg_dump` is available on the host. Run:

```bash
/opt/node-v22/bin/node /opt/huangguanedu/ops/backup-postgres-to-oss-native.cjs /opt/huangguanedu/.env.production
```

The helper reads `DATABASE_URL` without printing it, invokes native `pg_dump` without putting the password on the command line, calculates a local SHA-256, uploads the dump and `.sha256` through `ali-oss`, then uses OSS `head` to verify both objects exist and have the expected sizes. It uses `OSS_BACKUP_BUCKET` or falls back to `OSS_BUCKET`, and `OSS_BACKUP_PREFIX` or `backups/postgres`.

Backups are stored only in the dedicated `.backups/postgres-native` directory and local files are retained for exactly 14 days. Remote OSS objects are retained indefinitely; the helper never deletes remote objects. Success and failure are sent with `logger` to journald using only safe metadata.

Install this daily cron entry in the host's Asia/Shanghai timezone:

```cron
CRON_TZ=Asia/Shanghai
30 3 * * * /usr/bin/flock -n /var/lock/huangguanedu-backup.lock /opt/node-v22/bin/node /opt/huangguanedu/ops/backup-postgres-to-oss-native.cjs /opt/huangguanedu/.env.production
```

## Restore drill

Download a dump and checksum from OSS into a temporary isolated directory, verify the checksum, and restore it into a temporary PostgreSQL cluster that is not connected to production. Validate migrations, representative row counts, and application reads against that isolated cluster. Tear down the temporary cluster after the drill. This repository does not perform or document a production restore procedure.
