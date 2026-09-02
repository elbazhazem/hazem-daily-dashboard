import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { calendarConnections } from "../../../../db/schema";
import { encrypt, setGoogleSession } from "../../../google-session";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const cookieStore = await cookies();
  const expectedState = cookieStore.get("google_oauth_state")?.value;
  cookieStore.delete("google_oauth_state");
  if (!expectedState || url.searchParams.get("state") !== expectedState) return Response.redirect(new URL("/?calendar=invalid_state", request.url));
  const code = url.searchParams.get("code");
  if (!code) return Response.redirect(new URL("/?calendar=denied", request.url));
  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        redirect_uri: process.env.GOOGLE_REDIRECT_URI ?? "",
        grant_type: "authorization_code",
      }),
    });
    if (!tokenResponse.ok) throw new Error("token exchange failed");
    const token = await tokenResponse.json() as { access_token: string; refresh_token?: string; expires_in: number; scope?: string };
    const profileResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", { headers: { authorization: `Bearer ${token.access_token}` } });
    if (!profileResponse.ok) throw new Error("profile request failed");
    const profile = await profileResponse.json() as { id?: string; email?: string; name?: string };
    if (!profile.id || !profile.email) throw new Error("Google identity is incomplete");
    // Every Google account gets an isolated dashboard and calendar connection.
    // Keep the original owner's existing data under the legacy user id so the
    // migration from the former single-account deployment is lossless.
    const legacyEmail = process.env.ALLOWED_GOOGLE_EMAIL?.trim().toLowerCase();
    const legacyUserId = process.env.DASHBOARD_USER_ID?.trim();
    const userId = legacyUserId && legacyEmail === profile.email.toLowerCase()
      ? legacyUserId
      : `google:${profile.id}`;
    const db = getDb();
    const existing = await db.query.calendarConnections.findFirst({ where: eq(calendarConnections.userId, userId) });
    const now = new Date().toISOString();
    const values = {
      accountEmail: profile.email ?? null,
      encryptedAccessToken: await encrypt(token.access_token),
      encryptedRefreshToken: token.refresh_token ? await encrypt(token.refresh_token) : existing?.encryptedRefreshToken ?? null,
      tokenExpiry: Date.now() + token.expires_in * 1000,
      scope: token.scope ?? "https://www.googleapis.com/auth/calendar.readonly",
      updatedAt: now,
    };
    if (existing) await db.update(calendarConnections).set(values).where(eq(calendarConnections.id, existing.id));
    else await db.insert(calendarConnections).values({ ...values, userId, createdAt: now });
    await setGoogleSession({ userId, email: profile.email, name: profile.name ?? profile.email.split("@")[0] });
    return Response.redirect(new URL("/?auth=connected", request.url));
  } catch { return Response.redirect(new URL("/?auth=error", request.url)); }
}
