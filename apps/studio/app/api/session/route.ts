import { NextResponse } from "next/server";
import {
  expiredSessionCookieOptions,
  readStudioSession,
  sessionSigningSecrets,
  STUDIO_SESSION_NS,
  STUDIO_SESSION_COOKIE,
} from "../../../lib/studio-session";
import { getStore } from "../../../lib/backend";

export async function DELETE(req: Request) {
  const secrets = sessionSigningSecrets(process.env);
  const cookie = req.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${STUDIO_SESSION_COOKIE}=`))
    ?.slice(STUDIO_SESSION_COOKIE.length + 1);
  const sessionId =
    secrets.length > 0
      ? await readStudioSession(cookie ? decodeURIComponent(cookie) : undefined, secrets)
      : undefined;
  if (sessionId) await (await getStore()).kvDelete(STUDIO_SESSION_NS, sessionId);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(STUDIO_SESSION_COOKIE, "", {
    ...expiredSessionCookieOptions(),
  });
  return response;
}
