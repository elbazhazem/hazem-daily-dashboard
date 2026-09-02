import { cookies } from "next/headers";

export async function GET() {
  try {
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_REDIRECT_URI) return Response.json({ error: "Google Calendar connection is not configured." }, { status: 503 });
    const state = crypto.randomUUID();
    const cookieStore = await cookies();
    cookieStore.set("google_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI,
      response_type: "code",
      scope: "openid email profile https://www.googleapis.com/auth/calendar.readonly",
      access_type: "offline",
      include_granted_scopes: "true",
      prompt: "select_account consent",
      state,
    });
    return Response.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  } catch { return Response.json({ error: "Google sign-in could not be started." }, { status: 500 }); }
}
