import { redactSecrets } from "../src/redaction.js";

describe("secret redaction", () => {
  it("preserves non-plain objects instead of flattening them", () => {
    const error = new Error("boom");
    const date = new Date("2026-06-30T00:00:00.000Z");

    expect(redactSecrets(error)).toBe(error);
    expect(redactSecrets(date)).toBe(date);
  });
});
