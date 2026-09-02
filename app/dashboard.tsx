"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addDays, format, isToday, parseISO } from "date-fns";
import { CalendarDays, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock3, ExternalLink, Link2, ListTodo, LogOut, MapPin, Moon, NotebookPen, Pencil, Plus, RefreshCw, Search, Sun, Trash2, X } from "lucide-react";
import AppSidebar from "../components/app-sidebar";

type Task = { id: number; title: string; description: string; taskDate: string; dueTime: string | null; priority: "high" | "medium" | "low"; status: "not_started" | "in_progress" | "completed"; category: string };
type TaskStatus = Task["status"];
type EventItem = { id: string; title: string; description: string | null; location: string | null; url: string | null; meetingUrl: string | null; start: string; end: string; allDay: boolean };
type CalendarState = { connected: boolean; configured?: boolean; email?: string | null; events: EventItem[] };

const categories = ["Academic", "Research", "Teaching", "Administrative", "Personal", "Follow-up"];
const statusLabels: Record<TaskStatus, string> = { not_started: "Not started", in_progress: "In progress", completed: "Completed" };
const priorityLabels: Record<Task["priority"], string> = { high: "High", medium: "Medium", low: "Low" };
const priorityRank: Record<Task["priority"], number> = { high: 0, medium: 1, low: 2 };

function isoDate(date: Date) { return format(date, "yyyy-MM-dd"); }

function greetingForLocalHour(hour: number) {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 18) return "Good afternoon";
  if (hour >= 18) return "Good evening";
  return "Good night";
}

function sortTasksByImportance(items: Task[]) {
  return [...items].sort((a, b) => {
    const completionDifference = Number(a.status === "completed") - Number(b.status === "completed");
    if (completionDifference !== 0) return completionDifference;
    const priorityDifference = priorityRank[a.priority] - priorityRank[b.priority];
    return priorityDifference !== 0 ? priorityDifference : a.id - b.id;
  });
}

export default function Dashboard({ displayName, email }: { displayName: string; email: string }) {
  const [date, setDate] = useState(new Date());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [calendar, setCalendar] = useState<CalendarState>({ connected: false, events: [] });
  const [noteTitle, setNoteTitle] = useState("Daily notes");
  const [noteContent, setNoteContent] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [greeting, setGreeting] = useState("Welcome");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [tab, setTab] = useState<"overview" | "events" | "tasks" | "notes">("overview");
  const noteReady = useRef(false);

  const loadDay = useCallback(async () => {
    setLoading(true);
    const day = isoDate(date);
    try {
      if (isToday(date)) {
        await fetch("/api/tasks/rollover", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sourceDate: isoDate(addDays(date, -1)), targetDate: day }),
        });
      }
      const [taskResponse, noteResponse, calendarResponse, statusResponse] = await Promise.all([
        fetch(`/api/tasks?date=${day}`), fetch(`/api/notes?date=${day}`), fetch(`/api/calendar?date=${day}`), fetch("/api/google/status"),
      ]);
      if (taskResponse.ok) setTasks(sortTasksByImportance((await taskResponse.json()).tasks ?? []));
      if (noteResponse.ok) {
        const note = (await noteResponse.json()).note;
        noteReady.current = false;
        setNoteTitle(note?.title ?? "Daily notes");
        setNoteContent(note?.content ?? "");
        setTimeout(() => { noteReady.current = true; }, 0);
      }
      const status = statusResponse.ok ? await statusResponse.json() : { connected: false, configured: false };
      const calendarData = calendarResponse.ok ? await calendarResponse.json() : { connected: false, events: [] };
      setCalendar({ ...status, ...calendarData });
      setEvents(calendarData.events ?? []);
    } finally { setLoading(false); }
  }, [date]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadDay(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadDay]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);
  useEffect(() => {
    const updateGreeting = () => setGreeting(greetingForLocalHour(new Date().getHours()));
    updateGreeting();
    const interval = window.setInterval(updateGreeting, 60_000);
    return () => window.clearInterval(interval);
  }, []);
  useEffect(() => {
    if (!noteReady.current) return;
    setSaveState("saving");
    const timeout = setTimeout(async () => {
      const response = await fetch("/api/notes", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ noteDate: isoDate(date), title: noteTitle, content: noteContent }) });
      setSaveState(response.ok ? "saved" : "failed");
    }, 700);
    return () => clearTimeout(timeout);
  }, [noteTitle, noteContent, date]);

  const completed = tasks.filter((task) => task.status === "completed").length;
  const statusCounts: Record<TaskStatus, number> = {
    not_started: tasks.filter((task) => task.status === "not_started").length,
    in_progress: tasks.filter((task) => task.status === "in_progress").length,
    completed,
  };
  const pending = tasks.length - completed;
  const highPriority = tasks.filter((task) => task.priority === "high" && task.status !== "completed").length;
  const progress = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;
  const visibleTasks = tasks.filter((task) => (statusFilter === "all" || task.status === statusFilter) && `${task.title} ${task.description} ${task.category}`.toLowerCase().includes(query.toLowerCase()));
  const nextEvent = useMemo(() => events.find((event) => event.allDay || new Date(event.end) > new Date()), [events]);

  async function addTask(form: FormData) {
    const payload = { title: String(form.get("title")), description: String(form.get("description") ?? ""), taskDate: isoDate(date), dueTime: form.get("dueTime") || null, priority: form.get("priority"), status: "not_started", category: form.get("category") };
    const response = await fetch("/api/tasks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    if (response.ok) {
      const created = (await response.json()).task as Task;
      setTasks((current) => sortTasksByImportance([...current, created]));
      setShowTaskForm(false);
    }
  }

  async function updateTask(task: Task, changes: Partial<Task>) {
    const response = await fetch("/api/tasks", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: task.id, ...changes }) });
    if (response.ok) {
      const updated = (await response.json()).task as Task;
      setTasks((current) => sortTasksByImportance(current.map((item) => item.id === task.id ? updated : item)));
      setSelectedTask((current) => current?.id === updated.id ? updated : current);
      return updated;
    }
    return null;
  }

  async function saveTaskChanges(task: Task, form: FormData) {
    const updated = await updateTask(task, {
      title: String(form.get("title")),
      description: String(form.get("description") ?? ""),
      dueTime: form.get("dueTime") ? String(form.get("dueTime")) : null,
      priority: String(form.get("priority")) as Task["priority"],
      category: String(form.get("category")),
    });
    if (updated) setSelectedTask(updated);
    return Boolean(updated);
  }

  async function removeTask(id: number) {
    const response = await fetch(`/api/tasks?id=${id}`, { method: "DELETE" });
    if (response.ok) {
      setTasks((current) => current.filter((task) => task.id !== id));
      setSelectedTask((current) => current?.id === id ? null : current);
    }
  }

  const panels = {
    events: <EventsPanel events={events} calendar={calendar} loading={loading} onRefresh={loadDay} />,
    tasks: <TasksPanel tasks={visibleTasks} totalTasks={tasks.length} statusCounts={statusCounts} query={query} setQuery={setQuery} statusFilter={statusFilter} setStatusFilter={setStatusFilter} onStatusChange={(task, status) => updateTask(task, { status })} onToggle={(task) => updateTask(task, { status: task.status === "completed" ? "not_started" : "completed" })} onOpen={setSelectedTask} onDelete={removeTask} onAdd={() => setShowTaskForm(true)} />,
    notes: <NotesPanel title={noteTitle} content={noteContent} setTitle={setNoteTitle} setContent={setNoteContent} saveState={saveState} />,
  };

  return (
    <div className="site-layout">
      <AppSidebar active="dashboard" />
      <main className="app-shell site-content">
      <header className="topbar">
        <div className="brand"><div className="brand-mark"><CheckCircle2 /></div><div><strong>Daily Dashboard</strong><span>Academic workspace</span></div></div>
        <div className="date-nav" aria-label="Date navigation">
          <button className="icon-button" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day"><ChevronLeft /></button>
          <button className="date-button" onClick={() => setDate(new Date())}><span>{format(date, "EEEE")}</span><strong>{format(date, "d MMMM yyyy")}</strong></button>
          <button className="icon-button" onClick={() => setDate(addDays(date, 1))} aria-label="Next day"><ChevronRight /></button>
          {!isToday(date) && <button className="today-button" onClick={() => setDate(new Date())}>Today</button>}
          <input className="date-picker" type="date" value={isoDate(date)} onChange={(event) => setDate(parseISO(event.target.value))} aria-label="Choose date" />
        </div>
        <div className="profile"><button className="icon-button" onClick={() => setTheme(theme === "light" ? "dark" : "light")} aria-label="Toggle theme">{theme === "light" ? <Moon /> : <Sun />}</button><div className="avatar">{displayName.slice(0, 1).toUpperCase()}</div><div><strong>{displayName}</strong><span>{email}</span></div><a className="icon-button" href="/api/google/logout" title="Sign out" aria-label="Sign out"><LogOut /></a></div>
      </header>

      <section className="welcome">
        <div><p>{isToday(date) ? "Today" : format(date, "EEEE")}</p><h1>{isToday(date) ? `${greeting}, ${displayName.split(" ")[0]}` : format(date, "MMMM d")}</h1><span>{loading ? "Loading your day…" : pending ? `${pending} task${pending === 1 ? "" : "s"} need your attention.` : "Your task list is clear."}</span></div>
        <div className="progress-ring" style={{ "--progress": `${progress * 3.6}deg` } as React.CSSProperties}><div><strong>{progress}%</strong><span>complete</span></div></div>
      </section>

      <section className="stats-grid">
        <Stat icon={<CalendarDays />} label="Events" value={events.length} tone="blue" />
        <Stat icon={<ListTodo />} label="Pending tasks" value={pending} tone="cyan" />
        <Stat icon={<Check />} label="Completed" value={completed} tone="green" />
        <Stat icon={<Clock3 />} label="High priority" value={highPriority} tone="amber" />
      </section>

      {nextEvent && <section className="next-up"><div><span>Next up</span><strong>{nextEvent.title}</strong></div><span>{nextEvent.allDay ? "All day" : format(new Date(nextEvent.start), "h:mm a")}</span></section>}

      <nav className="mobile-tabs">
        {(["overview", "events", "tasks", "notes"] as const).map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item === "overview" ? <CheckCircle2 /> : item === "events" ? <CalendarDays /> : item === "tasks" ? <ListTodo /> : <NotebookPen />}<span>{item}</span></button>)}
      </nav>

      <section className={`dashboard-grid tab-${tab}`}>
        <div className="panel-slot events-slot">{panels.events}</div>
        <div className="panel-slot tasks-slot">{panels.tasks}</div>
        <div className="panel-slot notes-slot">{panels.notes}</div>
      </section>

      {showTaskForm && <TaskDialog date={date} onClose={() => setShowTaskForm(false)} onSubmit={addTask} />}
      {selectedTask && <TaskDetailDialog task={selectedTask} onClose={() => setSelectedTask(null)} onSave={(form) => saveTaskChanges(selectedTask, form)} onDelete={removeTask} />}
      </main>
    </div>
  );
}

function Stat({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: string }) { return <article className="stat-card"><div className={`stat-icon ${tone}`}>{icon}</div><div><strong>{value}</strong><span>{label}</span></div></article>; }

function PanelHeader({ icon, title, count, action }: { icon: React.ReactNode; title: string; count?: number; action?: React.ReactNode }) { return <header className="panel-header"><div>{icon}<h2>{title}</h2>{count !== undefined && <span className="count">{count}</span>}</div>{action}</header>; }

function EventsPanel({ events, calendar, loading, onRefresh }: { events: EventItem[]; calendar: CalendarState; loading: boolean; onRefresh: () => void }) {
  return <section className="panel"><PanelHeader icon={<CalendarDays />} title="Calendar" count={events.length} action={<button className="icon-button small" onClick={onRefresh} aria-label="Refresh calendar"><RefreshCw className={loading ? "spin" : ""} /></button>} />
    {!calendar.connected ? <div className="empty-state"><div className="empty-icon"><Link2 /></div><strong>Connect Google Calendar</strong><p>{calendar.configured === false ? "Calendar credentials need to be configured by the site owner." : "Read-only access keeps your schedule synchronized."}</p>{calendar.configured !== false && <a className="primary-button" href="/api/google/connect">Connect calendar</a>}</div> : events.length === 0 ? <div className="empty-state compact"><strong>No events today</strong><p>Your calendar is clear for this date.</p></div> : <div className="event-list">{events.map((event) => <article className="event-card" key={event.id}><div className="event-time">{event.allDay ? <><strong>ALL</strong><span>DAY</span></> : <><strong>{format(new Date(event.start), "h:mm")}</strong><span>{format(new Date(event.start), "a")}</span></>}</div><div className="event-detail"><strong>{event.title}</strong>{event.location && <span><MapPin />{event.location}</span>}{event.meetingUrl && <a href={event.meetingUrl} target="_blank" rel="noreferrer"><Link2 />Join meeting</a>}</div>{event.url && <a className="icon-button small" href={event.url} target="_blank" rel="noreferrer" aria-label="Open in Google Calendar"><ExternalLink /></a>}</article>)}</div>}
  </section>;
}

function TasksPanel({ tasks, totalTasks, statusCounts, query, setQuery, statusFilter, setStatusFilter, onStatusChange, onToggle, onOpen, onDelete, onAdd }: { tasks: Task[]; totalTasks: number; statusCounts: Record<TaskStatus, number>; query: string; setQuery: (value: string) => void; statusFilter: string; setStatusFilter: (value: string) => void; onStatusChange: (task: Task, status: TaskStatus) => void; onToggle: (task: Task) => void; onOpen: (task: Task) => void; onDelete: (id: number) => void; onAdd: () => void }) {
  return <section className="panel"><PanelHeader icon={<ListTodo />} title="Tasks" count={tasks.length} action={<button className="primary-button compact" onClick={onAdd}><Plus />Add task</button>} />
    <div className="task-tools"><label className="task-search"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search tasks" /></label><label className="status-filter"><span>Filter by status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter tasks by status"><option value="all">All statuses ({totalTasks})</option><option value="not_started">Not started ({statusCounts.not_started})</option><option value="in_progress">In progress ({statusCounts.in_progress})</option><option value="completed">Completed ({statusCounts.completed})</option></select></label></div>
    {tasks.length === 0 ? <div className="empty-state compact"><strong>No matching tasks</strong><p>Add a task or adjust your filters.</p></div> : <div className="task-list">{tasks.map((task) => <article className={`task-row status-${task.status} ${task.status === "completed" ? "done" : ""}`} key={task.id}><button className="check-button" onClick={() => onToggle(task)} aria-label={task.status === "completed" ? "Reopen task" : "Complete task"}>{task.status === "completed" && <Check />}</button><button type="button" className="task-content task-open-button" onClick={() => onOpen(task)} aria-label={`Open details for ${task.title}`}><strong>{task.title}</strong><span><i className={`priority-dot ${task.priority}`} />{task.category}{task.dueTime ? ` · ${task.dueTime}` : ""}</span></button><label className={`task-status ${task.status}`}><span className="sr-only">Status for {task.title}</span><select value={task.status} onChange={(event) => onStatusChange(task, event.target.value as TaskStatus)} aria-label={`Change status for ${task.title}`}><option value="not_started">{statusLabels.not_started}</option><option value="in_progress">{statusLabels.in_progress}</option><option value="completed">{statusLabels.completed}</option></select></label><button className="icon-button small danger" onClick={() => onDelete(task.id)} aria-label="Delete task"><Trash2 /></button></article>)}</div>}
  </section>;
}

function NotesPanel({ title, content, setTitle, setContent, saveState }: { title: string; content: string; setTitle: (value: string) => void; setContent: (value: string) => void; saveState: string }) {
  return <section className="panel notes-panel"><PanelHeader icon={<NotebookPen />} title="Notes" action={<span className={`save-status ${saveState}`}>{saveState === "saving" ? "Saving…" : saveState === "failed" ? "Save failed" : saveState === "saved" ? "Saved" : ""}</span>} /><input className="note-title" value={title} onChange={(event) => setTitle(event.target.value)} aria-label="Note title" /><textarea value={content} onChange={(event) => setContent(event.target.value)} placeholder="Write reflections, meeting summaries, or follow-up items…" aria-label="Daily notes" /><footer><span>{content.trim() ? content.trim().split(/\s+/).length : 0} words</span><span>Autosaved securely</span></footer></section>;
}

function TaskDialog({ date, onClose, onSubmit }: { date: Date; onClose: () => void; onSubmit: (form: FormData) => void }) {
  return <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><form className="task-dialog" action={onSubmit}><header><div><p>New task</p><h2>{format(date, "EEEE, d MMMM")}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X /></button></header><label>Task title<input name="title" required maxLength={180} autoFocus placeholder="e.g. Review research proposal" /></label><label>Description<textarea name="description" rows={3} placeholder="Optional details" /></label><div className="form-grid"><label>Due time<input name="dueTime" type="time" /></label><label>Priority<select name="priority" defaultValue="medium"><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label></div><label>Category<select name="category" defaultValue="Academic">{categories.map((category) => <option key={category}>{category}</option>)}</select></label><button className="primary-button" type="submit"><Plus />Add task</button></form></div>;
}

function TaskDetailDialog({ task, onClose, onSave, onDelete }: { task: Task; onClose: () => void; onSave: (form: FormData) => Promise<boolean>; onDelete: (id: number) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save(form: FormData) {
    setSaving(true);
    const saved = await onSave(form);
    setSaving(false);
    if (saved) setEditing(false);
  }

  async function deleteTask() {
    if (!window.confirm(`Delete “${task.title}”? This action cannot be undone.`)) return;
    await onDelete(task.id);
  }

  return <div className="dialog-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    {editing ? <form className="task-dialog" action={save}>
      <header><div><p>Edit task</p><h2>{task.title}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X /></button></header>
      <label>Task title<input name="title" required maxLength={180} autoFocus defaultValue={task.title} /></label>
      <label>Description<textarea name="description" rows={5} defaultValue={task.description} placeholder="Add the steps or outcome required for this task" /></label>
      <div className="form-grid"><label>Due time<input name="dueTime" type="time" defaultValue={task.dueTime ?? ""} /></label><label>Priority<select name="priority" defaultValue={task.priority}><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label></div>
      <label>Category<select name="category" defaultValue={task.category}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
      <div className="dialog-actions"><button type="button" className="secondary-button" onClick={() => setEditing(false)}>Cancel</button><button className="primary-button" type="submit" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button></div>
    </form> : <section className="task-dialog task-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="task-detail-title">
      <header><div><p>Task details</p><h2 id="task-detail-title">{task.title}</h2></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close"><X /></button></header>
      <div className="task-description"><span>Description</span><p>{task.description.trim() || "No description was added to this task."}</p></div>
      <div className="detail-grid"><div><span>Due time</span><strong>{task.dueTime || "No due time"}</strong></div><div><span>Priority</span><strong className={`priority-text ${task.priority}`}>{priorityLabels[task.priority]}</strong></div><div><span>Category</span><strong>{task.category}</strong></div><div><span>Status</span><strong>{statusLabels[task.status]}</strong></div></div>
      <div className="dialog-actions detail-actions"><button type="button" className="danger-button" onClick={deleteTask}><Trash2 />Delete</button><button type="button" className="primary-button" onClick={() => setEditing(true)}><Pencil />Edit task</button></div>
    </section>}
  </div>;
}
