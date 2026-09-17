"use client";

import { useState } from "react";
import { AlertTriangle, CalendarPlus, CheckCircle2, ExternalLink, ListPlus, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { canCreateCalendarEvent, canCreateTask, extractNoteActions, type NoteActionCandidate } from "../lib/note-actions";

type Category = { id: number; name: string };
type CreatedTask = { id: number; title: string; description: string; taskDate: string; dueTime: string | null; priority: "high" | "medium" | "low"; status: "not_started"; category: string };
type ActionResult = { message: string; tone: "success" | "warning" | "error"; eventUrl?: string | null; reconnect?: boolean };

export default function DetectedActions({
  noteDate,
  savedContent,
  categories,
  calendarCanCreateEvents,
  calendarConfigured,
  onTaskCreated,
  onCalendarCreated,
}: {
  noteDate: string;
  savedContent: string;
  categories: Category[];
  calendarCanCreateEvents: boolean;
  calendarConfigured: boolean;
  onTaskCreated: (task: CreatedTask) => void;
  onCalendarCreated: () => void;
}) {
  const [candidates, setCandidates] = useState(() => extractNoteActions(noteDate, savedContent, categories.map((category) => category.name)));
  const [workingId, setWorkingId] = useState("");
  const [results, setResults] = useState<Record<string, ActionResult>>({});

  if (!candidates.length) return null;

  function update(id: string, changes: Partial<NoteActionCandidate>) {
    setCandidates((current) => current.map((candidate) => candidate.id === id ? { ...candidate, ...changes } : candidate));
  }

  function remove(id: string) {
    setCandidates((current) => current.filter((candidate) => candidate.id !== id));
  }

  async function execute(action: "task" | "calendar" | "both", candidate: NoteActionCandidate) {
    const label = action === "task" ? "create this task" : action === "calendar" ? "create this calendar event" : "create both the task and calendar event";
    if (!window.confirm(`Review complete. Do you want to ${label}?`)) return;
    setWorkingId(candidate.id);
    setResults((current) => ({ ...current, [candidate.id]: { message: "Creating the confirmed action…", tone: "warning" } }));
    try {
      const response = await fetch("/api/actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, candidate }),
      });
      const data = await response.json() as {
        code?: string;
        error?: string;
        task?: { ok: boolean; created?: boolean; duplicate?: boolean; task?: CreatedTask; error?: string; code?: string };
        calendar?: { ok: boolean; created?: boolean; duplicate?: boolean; event?: { url?: string | null }; error?: string; code?: string };
        partial?: boolean;
      };
      if (!response.ok && response.status !== 207) {
        const reconnect = data.code === "CALENDAR_REAUTHORIZE_REQUIRED" || data.code === "CALENDAR_CONNECTION_REQUIRED";
        setResults((current) => ({ ...current, [candidate.id]: { message: data.error ?? "The action could not be completed.", tone: "error", reconnect } }));
        return;
      }
      const messages: string[] = [];
      let tone: ActionResult["tone"] = "success";
      let reconnect = false;
      if (data.task) {
        if (data.task.ok) {
          messages.push(data.task.duplicate ? "The task already exists; no duplicate was created." : "Task created successfully.");
          if (data.task.created && data.task.task) onTaskCreated(data.task.task);
        } else {
          messages.push(data.task.error ?? "Task creation failed.");
          tone = "warning";
        }
      }
      if (data.calendar) {
        if (data.calendar.ok) {
          messages.push(data.calendar.duplicate ? "The calendar event already exists; no duplicate was created." : "Calendar event created successfully.");
          if (data.calendar.created) onCalendarCreated();
        } else {
          messages.push(data.calendar.error ?? "Calendar event creation failed.");
          reconnect = data.calendar.code === "CALENDAR_REAUTHORIZE_REQUIRED" || data.calendar.code === "CALENDAR_CONNECTION_REQUIRED";
          tone = "warning";
        }
      }
      setResults((current) => ({
        ...current,
        [candidate.id]: { message: messages.join(" "), tone, eventUrl: data.calendar?.event?.url, reconnect },
      }));
    } catch {
      setResults((current) => ({ ...current, [candidate.id]: { message: "The action could not be completed. Your note was not changed.", tone: "error" } }));
    } finally {
      setWorkingId("");
    }
  }

  return <section className="detected-actions" aria-label="Detected actions">
    <header className="detected-actions-header">
      <div><Sparkles /><div><h3>Detected Actions</h3><p>{candidates.length} suggestion{candidates.length === 1 ? "" : "s"} found in the saved note. Review before creating anything.</p></div></div>
      {!calendarCanCreateEvents && calendarConfigured && <a className="secondary-button compact" href="/api/google/connect"><RefreshCw />Reconnect calendar</a>}
    </header>
    <div className="detected-action-list">
      {candidates.map((candidate) => {
        const taskReady = canCreateTask(candidate);
        const eventReady = canCreateCalendarEvent(candidate);
        const result = results[candidate.id];
        const choices = categories.some((category) => category.name === candidate.category)
          ? categories
          : [{ id: -999, name: candidate.category }, ...categories];
        return <article className="detected-action-card" key={candidate.id}>
          <div className="detected-action-meta">
            <span className={`action-type ${candidate.type}`}>{candidate.type === "meeting" ? "Meeting" : "Task"}</span>
            <span className={`confidence ${candidate.confidence}`}>{candidate.confidence === "needs_clarification" ? "Needs clarification" : `${candidate.confidence[0].toUpperCase() + candidate.confidence.slice(1)} confidence`}</span>
            <button className="icon-button small danger" type="button" onClick={() => remove(candidate.id)} aria-label="Dismiss suggestion"><Trash2 /></button>
          </div>
          <blockquote dir="auto">{candidate.sourceText}</blockquote>
          <p className="detection-reason"><Sparkles />{candidate.reason}</p>
          {candidate.tentative && <label className="tentative-confirm"><input type="checkbox" checked={candidate.confirmed} onChange={(event) => update(candidate.id, { confirmed: event.target.checked })} /><span><strong>This plan is confirmed</strong><small>The note sounds tentative. Confirm it before creating anything.</small></span></label>}
          <div className="detected-fields">
            <label className="wide">Event title<input value={candidate.title} onChange={(event) => update(candidate.id, { title: event.target.value })} maxLength={180} dir="auto" /></label>
            {candidate.type === "meeting" && <label className="wide">Task title<input value={candidate.taskTitle} onChange={(event) => update(candidate.id, { taskTitle: event.target.value })} maxLength={180} dir="auto" /></label>}
            <label>Date <span className="source-tag">{candidate.dateSource}</span><input type="date" value={candidate.date} onChange={(event) => update(candidate.id, { date: event.target.value, dateSource: "explicit" })} /></label>
            <label>Time <span className="source-tag">{candidate.timeSource}</span><input type="time" value={candidate.time} onChange={(event) => update(candidate.id, { time: event.target.value, timeSource: "explicit" })} /></label>
            {candidate.type === "meeting" && <label>Duration<input type="number" min="1" max="1440" value={candidate.durationMinutes} onChange={(event) => update(candidate.id, { durationMinutes: Number(event.target.value), durationDefaulted: false })} /><small>{candidate.durationDefaulted ? "Default: 60 minutes" : "Minutes"}</small></label>}
            <label>Location<input value={candidate.location} onChange={(event) => update(candidate.id, { location: event.target.value })} maxLength={300} dir="auto" /></label>
            <label>Priority<select value={candidate.priority} onChange={(event) => update(candidate.id, { priority: event.target.value as NoteActionCandidate["priority"] })}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label>
            <label>Category<select value={candidate.category} onChange={(event) => update(candidate.id, { category: event.target.value })}>{choices.map((category) => <option key={`${category.id}-${category.name}`} value={category.name}>{category.name}</option>)}</select></label>
            <label className="wide">Description<textarea rows={2} value={candidate.description} onChange={(event) => update(candidate.id, { description: event.target.value })} maxLength={2000} dir="auto" /></label>
          </div>
          {(!taskReady || (candidate.type === "meeting" && !eventReady)) && <div className="action-warning"><AlertTriangle />Complete the highlighted date/time fields and confirm tentative plans before creating the action.</div>}
          {candidate.type === "meeting" && !calendarCanCreateEvents && <div className="action-warning"><AlertTriangle />Google Calendar must be reconnected once to grant event creation access.</div>}
          {result && <div className={`action-result ${result.tone}`} role="status">{result.tone === "success" ? <CheckCircle2 /> : <AlertTriangle />}<span>{result.message}{result.eventUrl && <> <a href={result.eventUrl} target="_blank" rel="noreferrer">Open event <ExternalLink /></a></>}{result.reconnect && <> <a href="/api/google/connect">Reconnect Google Calendar</a></>}</span></div>}
          <div className="detected-action-buttons">
            <button className="secondary-button" type="button" disabled={!taskReady || workingId === candidate.id} onClick={() => void execute("task", candidate)}><ListPlus />Create Task</button>
            {candidate.type === "meeting" && <button className="secondary-button" type="button" disabled={!eventReady || !calendarCanCreateEvents || workingId === candidate.id} onClick={() => void execute("calendar", candidate)}><CalendarPlus />Create Calendar Event</button>}
            {candidate.type === "meeting" && <button className="primary-button" type="button" disabled={!taskReady || !eventReady || !calendarCanCreateEvents || workingId === candidate.id} onClick={() => void execute("both", candidate)}><CheckCircle2 />{workingId === candidate.id ? "Creating…" : "Create Both"}</button>}
          </div>
        </article>;
      })}
    </div>
  </section>;
}
