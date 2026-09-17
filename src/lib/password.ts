import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";
import { promisify } from "node:util";

// Node 的 scrypt 回调重载较多,promisify 推断不出带 options 的签名,这里显式声明
const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

// 存储格式:scrypt:N:r:p:salt:hash
// N/r/p 为 scrypt 内存与并行度参数,便于未来升级时校验旧哈希
const FORMAT_PREFIX = "scrypt";
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
const SCRYPT_PARAMS = {
  N: 16384,
  r: 8,
  p: 1,
};

/**
 * 使用 crypto.scrypt + 随机盐生成密码哈希。
 * 返回格式:`scrypt:N:r:p:salt:hash`(salt 与 hash 均为十六进制)。
 */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derivedKey = (await scrypt(plain, salt, KEY_LENGTH, SCRYPT_PARAMS)) as Buffer;
  const { N, r, p } = SCRYPT_PARAMS;

  return [
    FORMAT_PREFIX,
    N,
    r,
    p,
    salt.toString("hex"),
    derivedKey.toString("hex"),
  ].join(":");
}

/**
 * 校验明文密码与存储哈希是否匹配,使用 timing-safe 比较。
 * 存储格式损坏或参数非法时返回 false,不抛出异常。
 */
export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 6 || parts[0] !== FORMAT_PREFIX) {
    return false;
  }

  const [, nStr, rStr, pStr, saltHex, hashHex] = parts;
  const N = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);

  if (
    !Number.isSafeInteger(N) ||
    !Number.isSafeInteger(r) ||
    !Number.isSafeInteger(p) ||
    N <= 0 ||
    r <= 0 ||
    p <= 0
  ) {
    return false;
  }

  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  if (salt.length !== SALT_LENGTH || expected.length !== KEY_LENGTH) {
    return false;
  }

  const actual = (await scrypt(plain, salt, KEY_LENGTH, { N, r, p })) as Buffer;
  return timingSafeEqual(actual, expected);
}

/**
 * 生成随机临时密码（至少包含大写、小写、数字各一位，长度 12）。
 * 用于管理员创建老师账号或重置密码后的一次性初始密码。
 */
export function generateRandomPassword(length = 12): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const all = upper + lower + digits;

  const pick = (source: string): string =>
    source[randomBytes(1)[0] % source.length]!;

  // 保证三类字符至少各一个，其余随机填充
  const chars = [pick(upper), pick(lower), pick(digits)];
  while (chars.length < length) {
    chars.push(pick(all));
  }
  // 洗牌避免固定前缀
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomBytes(1)[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join("");
}
