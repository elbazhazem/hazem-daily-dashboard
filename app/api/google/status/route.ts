import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { calendarConnections } from "../../../../db/schema";
import { apiError, requireUserId } from "../../_shared";

export async function GET() {
  try {
    const userId = await requireUserId();
    const connection = await getDb().query.calendarConnections.findFirst({ where: eq(calendarConnections.userId, userId) });
    return Response.json({ connected: Boolean(connection), email: connection?.accountEmail ?? null, configured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_REDIRECT_URI) });
  } catch (error) { return apiError(error); }
}

export async function DELETE() {
  try {
    const userId = await requireUserId();
    await getDb().delete(calendarConnections).where(eq(calendarConnections.userId, userId));
    return Response.json({ ok: true });
  } catch (error) { return apiError(error); }
}
