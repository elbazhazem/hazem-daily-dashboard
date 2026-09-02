import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import { calendarConnections } from "../../db/schema";
import { decrypt, encrypt, getGoogleSession } from "../google-session";

export async function requireUserId() {
  const session = await getGoogleSession();
  if (!session) throw new Error("AUTH_REQUIRED");
  return session.userId;
}

export async function getValidGoogleToken(userId: string) {
  const db = getDb();
  const connection = await db.query.calendarConnections.findFirst({ where: eq(calendarConnections.userId, userId) });
  if (!connection) return null;
  if (connection.tokenExpiry > Date.now() + 60_000) return { token: await decrypt(connection.encryptedAccessToken), email: connection.accountEmail };
  if (!connection.encryptedRefreshToken) return null;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      refresh_token: await decrypt(connection.encryptedRefreshToken),
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) return null;
  const data = await response.json() as { access_token: string; expires_in: number };
  await db.update(calendarConnections).set({
    encryptedAccessToken: await encrypt(data.access_token),
    tokenExpiry: Date.now() + data.expires_in * 1000,
    updatedAt: new Date().toISOString(),
  }).where(eq(calendarConnections.userId, userId));
  return { token: data.access_token, email: connection.accountEmail };
}

export function apiError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected error";
  if (message === "AUTH_REQUIRED") return Response.json({ error: "Sign in is required." }, { status: 401 });
  if (message === "CALENDAR_NOT_CONFIGURED") return Response.json({ error: "Google Calendar configuration is not complete." }, { status: 503 });
  return Response.json({ error: "The request could not be completed." }, { status: 500 });
}
