import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  equal,
  imageType,
  tiers,
} from "../server/security";
describe("security primitives", () => {
  it("uses salted password hashes and rejects an incorrect password", async () => {
    const a = await hashPassword("correct-horse-battery-staple");
    const b = await hashPassword("correct-horse-battery-staple");
    expect(a).not.toBe(b);
    expect(a).not.toContain("correct-horse");
    expect(await verifyPassword("correct-horse-battery-staple", a)).toBe(true);
    expect(await verifyPassword("wrong", a)).toBe(false);
  });
  it("compares CSRF tokens exactly", () => {
    expect(equal("abc", "abc")).toBe(true);
    expect(equal("abc", "abd")).toBe(false);
    expect(equal("", "a")).toBe(false);
  });
  it("rejects SVG and checks binary signatures", () => {
    expect(
      imageType(new TextEncoder().encode('<svg onload="alert(1)">')),
    ).toBeNull();
    expect(imageType(new Uint8Array([255, 216, 255]))).toBe("image/jpeg");
  });
  it("grants no privilege to the free tier and keeps defined limits ordered", () => {
    expect(tiers.free.maxChars).toBe(500);
    expect(tiers.elite.maxChars).toBeGreaterThan(tiers.premium_plus.maxChars);
  });
});
