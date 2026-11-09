import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

// Used only by server code. Real accounts are authenticated by Supabase Auth.
export const DEFAULT_DEMO_PASSWORD_HASH =
  "scrypt-v1:5f6a11c2f8ea57179d5616f2d83b251b:2bd1b92c89ee289e02485b7414ae3ffa9caa6d79b11bd55776c045f14edb241a5d1262f6ded2adc641cfe8bfd789ce7526a5cf7af9daa167d60e49294d25f6f9";

const options = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, options, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashAdminPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = await derive(password, salt);
  return `scrypt-v1:${salt}:${hash.toString("hex")}`;
}

export async function verifyAdminPassword(
  password: string,
  encoded: string,
): Promise<boolean> {
  const match = /^scrypt-v1:([a-f0-9]{32}):([a-f0-9]{128})$/.exec(encoded);
  if (!match || password.length > 256) return false;
  const actual = await derive(password, match[1]);
  return timingSafeEqual(actual, Buffer.from(match[2], "hex"));
}
