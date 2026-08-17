import { HttpError } from "../src/errors.js";

describe("HttpError", () => {
  it("does not duplicate the error code in the public message", () => {
    const error = new HttpError(400, "invalid_request", "Field is required");

    expect(error.message).toBe("Field is required");
    expect(error.toJSON()).toEqual({
      error: {
        code: "invalid_request",
        message: "Field is required"
      }
    });
  });

  it("redacts known secret values from thrown and serialized messages", () => {
    const previous = process.env.CLAUDE_CODE_OAUTH_TOKEN;
    process.env.CLAUDE_CODE_OAUTH_TOKEN = "oauth-secret-value";

    try {
      const error = new HttpError(
        500,
        "internal_error",
        "CLI failed with token oauth-secret-value"
      );

      expect(error.message).not.toContain("oauth-secret-value");
      expect(error.toJSON().error.message).not.toContain("oauth-secret-value");
      expect(error.toJSON().error.message).toContain("[REDACTED]");
    } finally {
      process.env.CLAUDE_CODE_OAUTH_TOKEN = previous;
    }
  });
});
