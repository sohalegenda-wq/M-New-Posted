export const randomToken = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
export async function digest(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (n) => n.toString(16).padStart(2, "0"),
  ).join("");
}
export async function hashPassword(password: string, salt = randomToken()) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: new TextEncoder().encode(salt),
      iterations: 100000,
    },
    key,
    256,
  );
  return `pbkdf2-sha256$100000$${salt}$${Array.from(new Uint8Array(bits), (n) => n.toString(16).padStart(2, "0")).join("")}`;
}
export function equal(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
export async function verifyPassword(password: string, hash: string) {
  return equal(await hashPassword(password, hash.split("$")[2]), hash);
}
export const tiers = {
  free: { maxChars: 500, maxImages: 2, maxPins: 1, bioLength: 160 },
  premium: { maxChars: 2000, maxImages: 4, maxPins: 3, bioLength: 500 },
  premium_plus: { maxChars: 5000, maxImages: 6, maxPins: 5, bioLength: 1000 },
  elite: { maxChars: 10000, maxImages: 8, maxPins: 10, bioLength: 2000 },
} as const;
export type Tier = keyof typeof tiers;
export type Role = "user" | "moderator" | "administrator" | "owner";
export function imageType(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return "image/jpeg";
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b))
    return "image/png";
  if (
    new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
  )
    return "image/webp";
  return null;
}
