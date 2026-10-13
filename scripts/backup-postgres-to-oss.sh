#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${1:-$ROOT_DIR/.env.production}"
COMPOSE_FILE="$ROOT_DIR/docker-compose.ecs.yml"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/.backups/postgres}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Environment file not found: $ENV_FILE" >&2
  exit 1
fi

# Read only the keys needed by this script, without shell-evaluating secret values.
read_env_value() {
  local key="$1"
  local line
  line="$(grep -m1 -E "^[[:space:]]*${key}=" "$ENV_FILE" || true)"
  if [[ -z "$line" ]]; then
    return 0
  fi

  local value="${line#*=}"
  value="${value%$'\r'}"

  if [[ "$value" == \"*\" && "$value" == *\" ]]; then
    value="${value:1:${#value}-2}"
  elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
    value="${value:1:${#value}-2}"
  fi

  printf '%s' "$value"
}

POSTGRES_USER="${POSTGRES_USER:-$(read_env_value POSTGRES_USER)}"
POSTGRES_DB="${POSTGRES_DB:-$(read_env_value POSTGRES_DB)}"
OSS_BUCKET="${OSS_BUCKET:-$(read_env_value OSS_BUCKET)}"
OSS_ACCESS_KEY_ID="${OSS_ACCESS_KEY_ID:-$(read_env_value OSS_ACCESS_KEY_ID)}"
OSS_ACCESS_KEY_SECRET="${OSS_ACCESS_KEY_SECRET:-$(read_env_value OSS_ACCESS_KEY_SECRET)}"
APP_OSS_REGION="${OSS_REGION:-$(read_env_value OSS_REGION)}"
OSSUTIL_REGION="${OSSUTIL_REGION:-$(read_env_value OSSUTIL_REGION)}"
OSS_BACKUP_BUCKET="${OSS_BACKUP_BUCKET:-$(read_env_value OSS_BACKUP_BUCKET)}"
OSS_BACKUP_PREFIX="${OSS_BACKUP_PREFIX:-$(read_env_value OSS_BACKUP_PREFIX)}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-$(read_env_value BACKUP_RETENTION_DAYS)}"
OSS_ENDPOINT="${OSS_ENDPOINT:-$(read_env_value OSS_ENDPOINT)}"

require_value() {
  local name="$1"
  local value="$2"
  if [[ -z "$value" ]]; then
    echo "Required variable is missing: $name" >&2
    exit 1
  fi
}

require_value POSTGRES_USER "$POSTGRES_USER"
require_value POSTGRES_DB "$POSTGRES_DB"
require_value OSS_BUCKET "$OSS_BUCKET"
require_value OSS_ACCESS_KEY_ID "$OSS_ACCESS_KEY_ID"
require_value OSS_ACCESS_KEY_SECRET "$OSS_ACCESS_KEY_SECRET"

command -v docker >/dev/null 2>&1 || {
  echo "docker is required" >&2
  exit 1
}
docker compose version >/dev/null 2>&1 || {
  echo "Docker Compose plugin is required" >&2
  exit 1
}
command -v ossutil >/dev/null 2>&1 || {
  echo "ossutil 2.x is required for OSS backup upload" >&2
  exit 1
}
command -v sha256sum >/dev/null 2>&1 || {
  echo "sha256sum is required" >&2
  exit 1
}

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

timestamp="$(date -u +'%Y%m%dT%H%M%SZ')"
filename="huangguanedu-${timestamp}.dump"
backup_file="$BACKUP_DIR/$filename"
checksum_file="$backup_file.sha256"

compose=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")

echo "[backup] Creating PostgreSQL dump: $backup_file"
"${compose[@]}" exec -T postgres   pg_dump   --username="$POSTGRES_USER"   --dbname="$POSTGRES_DB"   --format=custom   --compress=6   --no-owner   --no-acl   >"$backup_file"

if [[ ! -s "$backup_file" ]]; then
  echo "Backup file is empty" >&2
  rm -f "$backup_file"
  exit 1
fi

(
  cd "$BACKUP_DIR"
  sha256sum "$filename" >"$filename.sha256"
)

# ali-oss uses values such as oss-cn-shanghai.
# ossutil 2.x expects the generic Alibaba Cloud region ID, e.g. cn-shanghai.
export OSS_ACCESS_KEY_ID
export OSS_ACCESS_KEY_SECRET
export OSS_REGION="${OSSUTIL_REGION:-${APP_OSS_REGION#oss-}}"
if [[ -n "$OSS_ENDPOINT" ]]; then
  export OSS_ENDPOINT
fi
require_value OSS_REGION "$OSS_REGION"

backup_bucket="${OSS_BACKUP_BUCKET:-$OSS_BUCKET}"
backup_prefix="${OSS_BACKUP_PREFIX:-backups/postgres}"
backup_prefix="${backup_prefix#/}"
backup_prefix="${backup_prefix%/}"
remote_base="oss://${backup_bucket}/${backup_prefix}"

echo "[backup] Uploading to $remote_base/"
ossutil cp "$backup_file" "$remote_base/$filename"
ossutil cp "$checksum_file" "$remote_base/$filename.sha256"

ossutil stat "$remote_base/$filename" >/dev/null
ossutil stat "$remote_base/$filename.sha256" >/dev/null

retention_days="${BACKUP_RETENTION_DAYS:-7}"
if ! [[ "$retention_days" =~ ^[0-9]+$ ]]; then
  echo "BACKUP_RETENTION_DAYS must be a non-negative integer" >&2
  exit 1
fi

find "$BACKUP_DIR" -type f \( -name 'huangguanedu-*.dump' -o -name 'huangguanedu-*.dump.sha256' \)   -mtime "+$retention_days" -delete

echo "[backup] Completed: $remote_base/$filename"
