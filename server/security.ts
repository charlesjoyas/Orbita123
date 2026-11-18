import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
export const token = () => randomBytes(32).toString("hex");
export const hashToken = (value: string) =>
  createHash("sha256").update(value).digest("hex");
const derive = (password: string, salt: string) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(
      password,
      salt,
      64,
      { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${(await derive(password, salt)).toString("hex")}`;
}
export async function verifyPassword(password: string, encoded: string) {
  const [scheme, salt, value] = encoded.split("$");
  if (scheme !== "scrypt" || !salt || !value) return false;
  const key = await derive(password, salt);
  const expected = Buffer.from(value, "hex");
  return key.length === expected.length && timingSafeEqual(key, expected);
}
export const equalSecret = (a: string, b: string) => {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
};
export const validPassword = (s: unknown): s is string =>
  typeof s === "string" && s.length >= 12 && s.length <= 128;
export const validEmail = (s: unknown): s is string =>
  typeof s === "string" &&
  s.length <= 254 &&
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
