# PostgreSQL backup and restore drill

Production PostgreSQL is an external/native service. The ECS host runs `/opt/huangguanedu/ops/backup-postgres-to-oss-native.cjs`; it does not use Docker or `ossutil` for the production backup path.

## Daily backup

The host cron runs at 03:30 Asia/Shanghai:

```cron
CRON_TZ=Asia/Shanghai
30 3 * * * /usr/bin/flock -n /var/lock/huangguanedu-backup.lock /opt/node-v22/bin/node /opt/huangguanedu/ops/backup-postgres-to-oss-native.cjs /opt/huangguanedu/.env.production
```

The helper uses native `pg_dump --format=custom`, writes a SHA-256 sidecar, uploads both objects through `ali-oss`, and verifies remote existence and object sizes with OSS `head`. It resolves `OSS_BACKUP_BUCKET` with fallback to `OSS_BUCKET`, and `OSS_BACKUP_PREFIX` with fallback to `backups/postgres`.

Local dump files are kept in the dedicated `.backups/postgres-native` directory for exactly 14 days. OSS objects are retained indefinitely. The helper never deletes remote OSS objects. Both success and failure are sent to `logger`/journald with a safe metadata summary; secrets and connection strings are never logged.

## Safe manual restore drill

Perform this drill on an isolated temporary PostgreSQL cluster, never on production:

1. Download one `.dump` object and its matching `.sha256` object into a temporary directory.
2. Verify the checksum locally with `sha256sum -c <dump>.sha256`.
3. Create a temporary PostgreSQL cluster with separate credentials, storage, and network identity. Do not reuse the production `DATABASE_URL`.
4. Restore the custom-format dump into that temporary cluster with `pg_restore --no-owner --no-acl`.
5. Check migration metadata, representative row counts, and read-only application behavior against the temporary connection.
6. Record the drill result, then remove the temporary cluster and its local dump files according to the host's temporary-data policy.

This task does not include a production restore, production service restart, migration, release switch, account creation, OSS lifecycle change, or remote cleanup.
