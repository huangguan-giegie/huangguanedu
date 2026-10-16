#!/usr/bin/env node

// 宿主机 PostgreSQL 原生备份：pg_dump -> SHA-256 -> OSS。
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { promisify } = require("node:util");
const OSS = require("ali-oss");
const dotenv = require("dotenv");

const execFile = promisify(require("node:child_process").execFile);
const ROOT_DIR = path.resolve(__dirname, "..");
const ENV_FILE = path.resolve(process.argv[2] || path.join(ROOT_DIR, ".env.production"));
const BACKUP_DIR = path.join(ROOT_DIR, ".backups", "postgres-native");
const RETENTION_DAYS = 14;
const LOGGER_TAG = "huangguanedu-postgres-backup";

function env(name, fallback = "") {
  return String(process.env[name] || fallback).trim();
}

function log(message) {
  const safe = `[backup] ${message}`;
  // logger 的消息只包含文件名、大小和状态等安全元数据。
  execFile("logger", ["-t", LOGGER_TAG, "--", safe]).catch(() => {});
  process.stdout.write(`${safe}\n`);
}

function failureCategory(error) {
  if (error && error.code === "ENOENT") return "local_file_missing";
  if (error && error.code === "EACCES") return "local_permission_denied";
  if (error && error.code === "pg_dump_spawn_failed") return "pg_dump_unavailable";
  if (error && error.code === "pg_dump_exit_nonzero") return "pg_dump_failed";
  if (error && error.code === "OSS_NOT_FOUND") return "oss_object_missing";
  if (error && error.code === "OSS_SIZE_MISMATCH") return "oss_size_mismatch";
  return "operation_failed";
}

function fail(error) {
  log(`failure category=${failureCategory(error)}`);
  process.exitCode = 1;
}

function required(name) {
  const value = env(name);
  if (!value) {
    const error = new Error();
    error.code = "missing_required_config";
    throw error;
  }
  return value;
}

function parseDatabaseUrl(databaseUrl) {
  const url = new URL(databaseUrl);
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    const error = new Error();
    error.code = "invalid_database_url";
    throw error;
  }
  return {
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGDATABASE: decodeURIComponent(url.pathname.replace(/^\//, "")),
    ...(url.searchParams.get("sslmode") ? { PGSSLMODE: url.searchParams.get("sslmode") } : {}),
  };
}

function databaseEnvironment() {
  const databaseUrl = env("DATABASE_URL");
  if (databaseUrl) return parseDatabaseUrl(databaseUrl);
  return {
    PGHOST: required("PGHOST"),
    PGPORT: env("PGPORT", "5432"),
    PGUSER: required("POSTGRES_USER"),
    PGPASSWORD: required("POSTGRES_PASSWORD"),
    PGDATABASE: required("POSTGRES_DB"),
    ...(env("PGSSLMODE") ? { PGSSLMODE: env("PGSSLMODE") } : {}),
  };
}

function runPgDump(outputFile, pgEnv) {
  const childEnv = {};
  for (const name of [
    "PATH", "LANG", "LC_ALL", "LC_CTYPE", "LD_LIBRARY_PATH", "DYLD_LIBRARY_PATH",
    "PGHOST", "PGPORT", "PGUSER", "PGPASSWORD", "PGDATABASE", "PGSSLMODE",
    "PGOPTIONS", "PGSSLCERT", "PGSSLKEY", "PGSSLROOTCERT", "PGCHANNELBIND", "PGTZ",
  ]) {
    if (process.env[name] !== undefined) childEnv[name] = process.env[name];
  }
  Object.assign(childEnv, pgEnv);
  return new Promise((resolve, reject) => {
    const child = spawn("pg_dump", [
      "--format=custom",
      "--compress=6",
      "--no-owner",
      "--no-acl",
      "--file",
      outputFile,
    ], { env: childEnv, stdio: ["ignore", "ignore", "ignore"] });
    child.on("error", () => {
      const error = new Error();
      error.code = "pg_dump_spawn_failed";
      reject(error);
    });
    child.on("close", (code) => {
      if (code === 0) return resolve();
      const error = new Error();
      error.code = "pg_dump_exit_nonzero";
      reject(error);
    });
  });
}

function sha256(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(file);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function headSize(client, key, expectedSize) {
  let result;
  try {
    result = await client.head(key);
  } catch {
    const error = new Error();
    error.code = "OSS_NOT_FOUND";
    throw error;
  }
  const actualSize = Number(result.res && result.res.headers && result.res.headers["content-length"]);
  if (!Number.isFinite(actualSize) || actualSize !== expectedSize) {
    const error = new Error();
    error.code = "OSS_SIZE_MISMATCH";
    throw error;
  }
}

async function removeExpiredBackups() {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  let removed = 0;
  for (const name of fs.readdirSync(BACKUP_DIR)) {
    if (!/^huangguanedu-\d{8}T\d{6}Z\.dump(?:\.sha256)?$/.test(name)) continue;
    const file = path.join(BACKUP_DIR, name);
    const stat = fs.statSync(file);
    if (stat.isFile() && stat.mtimeMs < cutoff) {
      fs.unlinkSync(file);
      removed += 1;
    }
  }
  return removed;
}

async function main() {
  process.umask(0o077);
  if (!fs.existsSync(ENV_FILE)) {
    const error = new Error();
    error.code = "environment_file_missing";
    throw error;
  }
  dotenv.config({ path: ENV_FILE, override: false, quiet: true });
  fs.mkdirSync(BACKUP_DIR, { recursive: true, mode: 0o700 });
  fs.chmodSync(BACKUP_DIR, 0o700);

  const bucket = env("OSS_BACKUP_BUCKET", env("OSS_BUCKET"));
  const prefix = env("OSS_BACKUP_PREFIX", "backups/postgres").replace(/^\/+|\/+$/g, "");
  if (!bucket) {
    const error = new Error();
    error.code = "missing_backup_bucket";
    throw error;
  }
  const endpoint = required("OSS_ENDPOINT");
  const region = required("OSS_REGION");
  const accessKeyId = required("OSS_ACCESS_KEY_ID");
  const accessKeySecret = required("OSS_ACCESS_KEY_SECRET");
  const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const filename = `huangguanedu-${timestamp}.dump`;
  const dumpFile = path.join(BACKUP_DIR, filename);
  const checksumFile = `${dumpFile}.sha256`;

  try {
    await runPgDump(dumpFile, databaseEnvironment());
    const dumpSize = fs.statSync(dumpFile).size;
    if (dumpSize <= 0) {
      const error = new Error();
      error.code = "empty_dump";
      throw error;
    }
    const digest = await sha256(dumpFile);
    fs.writeFileSync(checksumFile, `${digest}  ${filename}\n`, { mode: 0o600 });
    const checksumSize = fs.statSync(checksumFile).size;
    const client = new OSS({ region, endpoint, bucket, accessKeyId, accessKeySecret, secure: true });
    const dumpKey = `${prefix}/${filename}`;
    const checksumKey = `${dumpKey}.sha256`;
    await client.put(dumpKey, dumpFile);
    await client.put(checksumKey, checksumFile);
    await headSize(client, dumpKey, dumpSize);
    await headSize(client, checksumKey, checksumSize);
    const removed = await removeExpiredBackups();
    log(`success bucket=${bucket} dump_key=${dumpKey} checksum_key=${checksumKey} file=${filename} bytes=${dumpSize} sha256=${digest} removed_local=${removed}`);
  } catch (error) {
    for (const file of [dumpFile, checksumFile]) {
      try { fs.rmSync(file, { force: true }); } catch {}
    }
    throw error;
  }
}

main().catch(fail);
