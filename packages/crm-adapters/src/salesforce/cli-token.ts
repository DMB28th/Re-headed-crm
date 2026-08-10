/**
 * LOCAL DEV ONLY — mint a Salesforce access token from the `sf` CLI.
 *
 * Why this exists: pointing local dev at a real org through the normal OAuth
 * connection means the local file store (`data/cardstack-config.json`) and
 * Railway's Postgres hold two unsynced copies of the SAME org's refresh token.
 * The connected app rotates refresh tokens with reuse detection, so a refresh
 * on either side revokes the whole grant family and kills the other — this is
 * what repeatedly broke the deployed connection through 2026-07-25.
 *
 * The `sf` CLI holds its OWN independent auth. Borrowing its access token
 * therefore touches no refresh token the connected app knows about, and the
 * token here is held IN MEMORY ONLY: nothing in this file writes to the config
 * store, and the dev adapter is built outside the stored connection entirely.
 *
 * NEVER persist what this returns.
 */
import { execFile, type ExecFileOptions } from "node:child_process";
import { CrmAuthError } from "../adapter.js";

/**
 * Hand-rolled instead of util.promisify(execFile): promisify only resolves
 * `{stdout, stderr}` when it can read execFile's `util.promisify.custom`
 * symbol, and bundlers (Next's server build, notably) drop it — the call then
 * resolves the bare stdout STRING and every `{ stdout }` destructure silently
 * yields undefined.
 */
function run(
  file: string,
  args: string[],
  options: ExecFileOptions,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(file, args, options, (error, stdout, stderr) => {
      const out = { stdout: String(stdout ?? ""), stderr: String(stderr ?? "") };
      if (error) {
        reject(Object.assign(error, out));
        return;
      }
      resolve(out);
    });
  });
}

export interface SalesforceCliToken {
  accessToken: string;
  instanceUrl: string;
  username: string;
  /** Org id, when the CLI reports one — surfaced in logs to catch wrong-org runs. */
  orgId?: string;
}

interface SfOrgDisplay {
  status: number;
  result?: {
    accessToken?: string;
    instanceUrl?: string;
    username?: string;
    id?: string;
  };
  message?: string;
}

/**
 * `sf org display --json` for the target org.
 *
 * The CLI (>= 2.144) REDACTS accessToken unless SF_TEMP_SHOW_SECRETS=true, so
 * that is set on the subprocess env only — never exported process-wide.
 */
export async function readSalesforceCliToken(targetOrg?: string): Promise<SalesforceCliToken> {
  const args = ["org", "display", "--json", ...(targetOrg ? ["--target-org", targetOrg] : [])];
  let stdout: string;
  try {
    ({ stdout } = await run("sf", args, {
      env: {
        ...process.env,
        SF_TEMP_SHOW_SECRETS: "true",
        // The CLI colorizes --json output when it believes the consumer wants
        // color, and Next's dev server exports FORCE_COLOR to its children —
        // the ANSI escapes make JSON.parse fail on otherwise valid output.
        FORCE_COLOR: "0",
        NO_COLOR: "1",
      },
      timeout: 30_000,
      maxBuffer: 8 * 1024 * 1024,
    }));
  } catch (error) {
    // A failed CLI call still prints JSON on stdout for auth errors; prefer its
    // message over the raw exec failure, which is just "Command failed".
    const stdoutText = (error as { stdout?: string }).stdout ?? "";
    const parsed = safeParse(stdoutText);
    throw new CrmAuthError(
      "Salesforce",
      parsed?.message ??
        `Could not read a token from the sf CLI for ${targetOrg ?? "the default org"}. ` +
          `Check \`sf org list\` and re-authorize with \`sf org login web\`. (${String(error)})`,
    );
  }

  const parsed = safeParse(stdout);
  const result = parsed?.result;
  if (!result?.accessToken || !result.instanceUrl || result.accessToken.includes("REDACTED")) {
    throw new CrmAuthError(
      "Salesforce",
      `sf CLI returned no usable access token for ${targetOrg ?? "the default org"}. ` +
        `CLI status ${parsed?.status ?? "?"}, keys [${Object.keys(result ?? {}).join(", ") || "none"}], ` +
        `token ${describeToken(result?.accessToken)}` +
        (parsed?.message ? `, message: ${parsed.message}` : ""),
    );
  }
  return {
    accessToken: result.accessToken,
    instanceUrl: result.instanceUrl.replace(/\/$/, ""),
    username: result.username ?? "unknown",
    ...(result.id ? { orgId: result.id } : {}),
  };
}

/** Never echo a real token into an error string — only its shape. */
function describeToken(token: string | undefined): string {
  if (token === undefined) return "absent";
  if (token.includes("REDACTED")) return "redacted by the CLI";
  return `present (${token.length} chars)`;
}

function safeParse(text: string): SfOrgDisplay | null {
  // Strip ANSI escapes and trim to the outermost JSON object: the CLI can wrap
  // --json output in color codes, and oclif plugin warnings sometimes precede
  // it. Both make a naive JSON.parse fail on otherwise valid output.
  // eslint-disable-next-line no-control-regex
  const clean = text.replace(/\[[0-9;]*m/g, "");
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(clean.slice(start, end + 1)) as SfOrgDisplay;
  } catch {
    return null;
  }
}
