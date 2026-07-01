import { createHmac, timingSafeEqual } from "node:crypto";
import { isAbsolute, normalize, sep } from "node:path";

const SAFE_COMMANDS = new Set([
  "git status",
  "git status --short",
  "git diff",
  "gh pr view",
  "gh pr diff",
  "gh pr review",
  "gh pr comment",
  "gh pr create",
  "gh issue view",
  "gh issue comment",
  "npm test",
  "npm run lint",
  "npm run typecheck"
]);

export function verifyGitHubSignature(body: Buffer, signatureHeader: string | undefined, secret: string): boolean {
  if (!signatureHeader?.startsWith("sha256=")) {
    return false;
  }

  const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
  const actualBuffer = Buffer.from(signatureHeader, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function rejectPathTraversal(relativePath: string): string {
  const normalized = normalize(relativePath);
  if (
    isAbsolute(relativePath) ||
    normalized === ".." ||
    normalized.startsWith(`..${sep}`) ||
    normalized.split(/[\\/]+/).includes("..")
  ) {
    throw new Error(`path traversal is not allowed: ${relativePath}`);
  }

  return normalized.replace(/\\/g, "/");
}

export function isSafeShellCommand(args: string[]): boolean {
  const command = args.join(" ");
  if (SAFE_COMMANDS.has(command)) {
    return true;
  }

  return (
    args[0] === "gh" &&
    args.length >= 3 &&
    SAFE_COMMANDS.has(args.slice(0, 3).join(" "))
  );
}

export function sanitizeBranchComponent(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._/-]+/g, "-")
    .replace(/\/+/g, "/")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}
