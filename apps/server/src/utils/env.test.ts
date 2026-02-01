import { describe, expect, it } from "vitest";
import { isEnabled } from "./env.js";

describe("isEnabled", () => {
  it("returns true for true-like values", () => {
    expect(isEnabled("true")).toBe(true);
    expect(isEnabled("1")).toBe(true);
    expect(isEnabled("TRUE")).toBe(true);
  });

  it("returns false for other values", () => {
    expect(isEnabled("false")).toBe(false);
    expect(isEnabled(undefined)).toBe(false);
    expect(isEnabled("0")).toBe(false);
  });
});
