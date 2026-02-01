import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildYtDlpArgs } from "./ytDlp.js";

describe("buildYtDlpArgs", () => {
  it("includes search query and output template", () => {
    const args = buildYtDlpArgs("Daft Punk One More Time", "/data/media");
    expect(args).toContain("ytsearch1:Daft Punk One More Time official video");
    expect(args).toContain(path.join("/data/media", "%(title)s.%(ext)s"));
  });
});
