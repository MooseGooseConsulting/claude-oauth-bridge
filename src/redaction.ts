const SECRET_KEYS = new Set([
  "CLAUDE_CODE_OAUTH_TOKEN",
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN"
]);

export function redactSecrets<T>(value: T): T {
  return redactValue(value) as T;
}

function redactValue(value: unknown): unknown {
  if (typeof value === "string") {
    return redactString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item));
  }

  if (!isPlainObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      SECRET_KEYS.has(key) ? "[REDACTED]" : redactValue(entry)
    ])
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function redactString(value: string): string {
  return secretValues().reduce((text, secret) => text.split(secret).join("[REDACTED]"), value);
}

function secretValues(): string[] {
  return Array.from(SECRET_KEYS)
    .map((key) => process.env[key])
    .filter((value): value is string => typeof value === "string" && value.length > 0);
}
