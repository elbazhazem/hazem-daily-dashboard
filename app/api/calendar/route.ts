import { apiError, getValidGoogleToken, requireUserId } from "../_shared";

type GoogleEvent = { id: string; summary?: string; description?: string; location?: string; htmlLink?: string; hangoutLink?: string; start: { dateTime?: string; date?: string }; end: { dateTime?: string; date?: string }; };

export async function GET(request: Request) {
  try {
    const userId = await requireUserId();
    const date = new URL(request.url).searchParams.get("date") ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ error: "Valid date required." }, { status: 400 });
    const connection = await getValidGoogleToken(userId);
    if (!connection) return Response.json({ connected: false, events: [] });
    const zone = "Asia/Gaza";
    const timeMin = new Date(`${date}T00:00:00+03:00`).toISOString();
    const timeMax = new Date(`${date}T23:59:59+03:00`).toISOString();
    const params = new URLSearchParams({ timeMin, timeMax, singleEvents: "true", orderBy: "startTime", timeZone: zone, maxResults: "50" });
    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, { headers: { authorization: `Bearer ${connection.token}` } });
    if (!response.ok) return Response.json({ error: "Calendar refresh failed." }, { status: 502 });
    const data = await response.json() as { items?: GoogleEvent[] };
    const events = (data.items ?? []).map((event) => ({
      id: event.id,
      title: event.summary ?? "Untitled event",
      description: event.description ?? null,
      location: event.location ?? null,
      url: event.htmlLink ?? null,
      meetingUrl: event.hangoutLink ?? null,
      start: event.start.dateTime ?? event.start.date ?? "",
      end: event.end.dateTime ?? event.end.date ?? "",
      allDay: Boolean(event.start.date),
    }));
    return Response.json({ connected: true, accountEmail: connection.email, events });
  } catch (error) { return apiError(error); }
}
