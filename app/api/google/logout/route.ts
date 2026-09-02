import { clearGoogleSession } from "../../../google-session";

export async function GET(request: Request) {
  await clearGoogleSession();
  return Response.redirect(new URL("/", request.url));
}
