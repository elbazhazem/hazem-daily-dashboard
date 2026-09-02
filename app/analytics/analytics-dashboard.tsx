"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { addDays, eachDayOfInterval, format, parseISO, startOfDay } from "date-fns";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, CalendarRange, ChartNoAxesCombined, CheckCircle2, Clock3, FileDown, FileText, Gauge, ListTodo, Moon, RefreshCw, Sun, Target, TrendingUp } from "lucide-react";
import AppSidebar from "../../components/app-sidebar";

type Task = { id: number; title: string; taskDate: string; priority: "high" | "medium" | "low"; status: "not_started" | "in_progress" | "completed"; category: string; createdAt: string; completedAt: string | null };
type Note = { noteDate: string; content: string };
type CalendarDay = { date: string; eventCount: number; meetingMinutes: number };
type AnalyticsResponse = { start: string; end: string; tasks: Task[]; notes: Note[]; calendar: CalendarDay[]; calendarConnected: boolean; previous: { totalTasks: number; completedTasks: number; completionRate: number } };
type Period = "7" | "30" | "90" | "custom";
type AnalyticsView = "overview" | "performance" | "workload" | "report";

const statusColors = ["#8997a2", "#2f80c1", "#0d9aa1"];
const statusLabels = { not_started: "Not started", in_progress: "In progress", completed: "Completed" } as const;
const emptyData: AnalyticsResponse = { start: "", end: "", tasks: [], notes: [], calendar: [], calendarConnected: false, previous: { totalTasks: 0, completedTasks: 0, completionRate: 0 } };

function dateValue(date: Date) { return format(date, "yyyy-MM-dd"); }
function hoursLabel(hours: number) { return hours < 24 ? `${hours.toFixed(1)}h` : `${(hours / 24).toFixed(1)}d`; }

export default function AnalyticsDashboard({ displayName, email }: { displayName: string; email: string }) {
  const today = startOfDay(new Date());
  const [period, setPeriod] = useState<Period>("30");
  const [start, setStart] = useState(dateValue(addDays(today, -29)));
  const [end, setEnd] = useState(dateValue(today));
  const [data, setData] = useState<AnalyticsResponse>(emptyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [view, setView] = useState<AnalyticsView>("overview");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/analytics?start=${start}&end=${end}`);
      if (!response.ok) throw new Error("Analytics could not be loaded for this period.");
      setData(await response.json());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Analytics could not be loaded.");
    } finally { setLoading(false); }
  }, [start, end]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  function chooseView(nextView: AnalyticsView) {
    setView(nextView);
    window.history.replaceState(null, "", `#${nextView}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function choosePeriod(value: Period) {
    setPeriod(value);
    if (value !== "custom") {
      setEnd(dateValue(today));
      setStart(dateValue(addDays(today, -(Number(value) - 1))));
    }
  }

  const analysis = useMemo(() => {
    const completed = data.tasks.filter((task) => task.status === "completed");
    const open = data.tasks.length - completed.length;
    const highPriorityBacklog = data.tasks.filter((task) => task.priority === "high" && task.status !== "completed").length;
    const completionRate = data.tasks.length ? Math.round((completed.length / data.tasks.length) * 100) : 0;
    const durations = completed.filter((task) => task.completedAt).map((task) => Math.max(0, (new Date(task.completedAt!).getTime() - new Date(task.createdAt).getTime()) / 3_600_000));
    const averageHours = durations.length ? durations.reduce((sum, value) => sum + value, 0) / durations.length : 0;
    const status = (["not_started", "in_progress", "completed"] as const).map((key) => ({ name: statusLabels[key], value: data.tasks.filter((task) => task.status === key).length }));
    const categories = [...new Set(data.tasks.map((task) => task.category))].map((category) => {
      const tasks = data.tasks.filter((task) => task.category === category);
      const done = tasks.filter((task) => task.status === "completed").length;
      return { category, total: tasks.length, completed: done, rate: tasks.length ? Math.round(done / tasks.length * 100) : 0 };
    }).sort((a, b) => b.total - a.total);
    const priority = (["high", "medium", "low"] as const).map((level) => ({
      priority: level[0].toUpperCase() + level.slice(1),
      notStarted: data.tasks.filter((task) => task.priority === level && task.status === "not_started").length,
      inProgress: data.tasks.filter((task) => task.priority === level && task.status === "in_progress").length,
      completed: data.tasks.filter((task) => task.priority === level && task.status === "completed").length,
    }));
    const calendarMap = new Map(data.calendar.map((item) => [item.date, item]));
    const days = data.start && data.end ? eachDayOfInterval({ start: parseISO(data.start), end: parseISO(data.end) }) : [];
    const daily = days.map((day) => {
      const date = dateValue(day);
      const calendar = calendarMap.get(date);
      return {
        date,
        label: format(day, days.length > 45 ? "MMM d" : "EEE d"),
        created: data.tasks.filter((task) => task.createdAt.slice(0, 10) === date).length,
        completed: data.tasks.filter((task) => task.completedAt?.slice(0, 10) === date).length,
        scheduled: data.tasks.filter((task) => task.taskDate === date).length,
        events: calendar?.eventCount ?? 0,
        meetingHours: Number(((calendar?.meetingMinutes ?? 0) / 60).toFixed(1)),
      };
    });
    const noteWords = data.notes.reduce((sum, note) => sum + (note.content.trim() ? note.content.trim().split(/\s+/).length : 0), 0);
    const meetingMinutes = data.calendar.reduce((sum, item) => sum + item.meetingMinutes, 0);
    const mostProductive = [...daily].sort((a, b) => b.completed - a.completed)[0];
    const rateDelta = completionRate - data.previous.completionRate;
    return { completed: completed.length, open, highPriorityBacklog, completionRate, averageHours, status, categories, priority, daily, noteWords, meetingMinutes, mostProductive, rateDelta };
  }, [data]);

  const periodLabel = data.start && data.end ? `${format(parseISO(data.start), "d MMM yyyy")} – ${format(parseISO(data.end), "d MMM yyyy")}` : "Selected period";

  return (
    <div className="site-layout">
      <AppSidebar active="analytics" />
      <main className="site-content analytics-shell">
        <header className="analytics-topbar">
          <div><p>Performance intelligence</p><h1>Analytics &amp; Reports</h1><span>Measure progress, workload, and focus using your dashboard data.</span></div>
          <div className="analytics-profile"><button className="icon-button" onClick={() => setTheme(theme === "light" ? "dark" : "light")} aria-label="Toggle theme">{theme === "light" ? <Moon /> : <Sun />}</button><div className="avatar">{displayName.slice(0, 1).toUpperCase()}</div><div><strong>{displayName}</strong><span>{email}</span></div></div>
        </header>

        <nav className="analytics-section-nav" aria-label="Analytics sections">
          <button className={view === "overview" ? "active" : ""} onClick={() => chooseView("overview")} aria-current={view === "overview" ? "page" : undefined}><Gauge /><span><strong>Overview</strong><small>Key indicators</small></span></button>
          <button className={view === "performance" ? "active" : ""} onClick={() => chooseView("performance")} aria-current={view === "performance" ? "page" : undefined}><ChartNoAxesCombined /><span><strong>Task performance</strong><small>Categories &amp; priorities</small></span></button>
          <button className={view === "workload" ? "active" : ""} onClick={() => chooseView("workload")} aria-current={view === "workload" ? "page" : undefined}><CalendarRange /><span><strong>Workload &amp; focus</strong><small>Calendar &amp; notes</small></span></button>
          <button className={view === "report" ? "active" : ""} onClick={() => chooseView("report")} aria-current={view === "report" ? "page" : undefined}><FileText /><span><strong>Productivity report</strong><small>Period summary</small></span></button>
        </nav>

        <section className="analytics-controls" aria-label="Analytics date range">
          <div className="period-pills">{(["7", "30", "90", "custom"] as Period[]).map((value) => <button key={value} className={period === value ? "active" : ""} onClick={() => choosePeriod(value)}>{value === "custom" ? "Custom" : `${value} days`}</button>)}</div>
          <div className="custom-range"><label>From<input type="date" value={start} max={end} onChange={(event) => { setPeriod("custom"); setStart(event.target.value); }} /></label><label>To<input type="date" value={end} min={start} onChange={(event) => { setPeriod("custom"); setEnd(event.target.value); }} /></label><button className="icon-button" onClick={load} aria-label="Refresh analytics"><RefreshCw className={loading ? "spin" : ""} /></button><button className="primary-button" onClick={() => window.print()}><FileDown />Print / Save PDF</button></div>
        </section>

        {error && <div className="analytics-error" role="alert"><AlertTriangle />{error}</div>}
        {view === "overview" && <div className="analytics-view" aria-busy={loading}>
          <header className="analytics-view-heading"><div><span>Overview</span><h2>Your performance at a glance</h2></div><p>{periodLabel}</p></header>
          <section className="analytics-kpis">
            <Kpi icon={<Target />} label="Completion rate" value={`${analysis.completionRate}%`} note={`${analysis.rateDelta >= 0 ? "+" : ""}${analysis.rateDelta} pts vs previous period`} tone="teal" />
            <Kpi icon={<CheckCircle2 />} label="Completed tasks" value={analysis.completed} note={`of ${data.tasks.length} scheduled`} tone="green" />
            <Kpi icon={<ListTodo />} label="Open tasks" value={analysis.open} note={`${analysis.highPriorityBacklog} high priority`} tone="blue" />
            <Kpi icon={<Clock3 />} label="Avg. completion time" value={analysis.averageHours ? hoursLabel(analysis.averageHours) : "—"} note="Created to completed" tone="amber" />
            <Kpi icon={<TrendingUp />} label="High-priority backlog" value={analysis.highPriorityBacklog} note={analysis.highPriorityBacklog ? "Needs attention" : "Under control"} tone="red" />
          </section>
          <section className="analytics-grid overview-grid">
            <ChartCard title="Completion trend" description="Tasks created and completed each day">
              <ResponsiveContainer width="100%" height={280}><AreaChart data={analysis.daily}><defs><linearGradient id="completedFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#0d9aa1" stopOpacity={0.35}/><stop offset="95%" stopColor="#0d9aa1" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={24} /><YAxis allowDecimals={false} width={28} /><Tooltip /><Legend /><Area type="monotone" dataKey="completed" name="Completed" stroke="#0d9aa1" fill="url(#completedFill)" strokeWidth={2.5} /><Area type="monotone" dataKey="created" name="Created" stroke="#2f80c1" fill="transparent" strokeWidth={2} /></AreaChart></ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Status distribution" description="Current state of tasks in the selected period">
              <ResponsiveContainer width="100%" height={280}><PieChart><Pie data={analysis.status} dataKey="value" nameKey="name" innerRadius={62} outerRadius={92} paddingAngle={3}>{analysis.status.map((entry, index) => <Cell key={entry.name} fill={statusColors[index]} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer>
            </ChartCard>
          </section>
        </div>}

        {view === "performance" && <div className="analytics-view" aria-busy={loading}>
          <header className="analytics-view-heading"><div><span>Task performance</span><h2>Delivery by category and priority</h2></div><p>{periodLabel}</p></header>
          <section className="analytics-grid">
            <ChartCard title="Category performance" description="Volume and completion rate by work area">
              <ResponsiveContainer width="100%" height={300}><BarChart data={analysis.categories} layout="vertical" margin={{ left: 12 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" allowDecimals={false} /><YAxis dataKey="category" type="category" width={96} tick={{ fontSize: 11 }} /><Tooltip /><Legend /><Bar dataKey="total" name="Total" fill="#cbd9e2" radius={[0, 5, 5, 0]} /><Bar dataKey="completed" name="Completed" fill="#0d9aa1" radius={[0, 5, 5, 0]} /></BarChart></ResponsiveContainer>
            </ChartCard>
            <ChartCard title="Priority versus status" description="Are the most important tasks moving forward?">
              <ResponsiveContainer width="100%" height={300}><BarChart data={analysis.priority}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="priority" /><YAxis allowDecimals={false} width={28} /><Tooltip /><Legend /><Bar dataKey="notStarted" stackId="status" name="Not started" fill="#8997a2" /><Bar dataKey="inProgress" stackId="status" name="In progress" fill="#2f80c1" /><Bar dataKey="completed" stackId="status" name="Completed" fill="#0d9aa1" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer>
            </ChartCard>
          </section>
          <section className="data-limits">
            <div><AlertTriangle /><div><h2>Current data limits</h2><p>Rollover history, time spent in each status, and actual work duration cannot yet be measured reliably because those events are not stored.</p></div></div>
            <span>Future data model: original_due_date · rollover_count · started_at · status_history · estimated_duration · actual_duration · completed_on_time · task_history</span>
          </section>
        </div>}

        {view === "workload" && <div className="analytics-view" aria-busy={loading}>
          <header className="analytics-view-heading"><div><span>Workload &amp; focus</span><h2>Calendar pressure and documentation habits</h2></div><p>{periodLabel}</p></header>
          <section className="analytics-grid">
            <ChartCard title="Calendar workload" description="Scheduled tasks, events, and meeting hours" wide>
              <ResponsiveContainer width="100%" height={300}><ComposedChart data={analysis.daily}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={24} /><YAxis yAxisId="count" allowDecimals={false} width={28} /><YAxis yAxisId="hours" orientation="right" width={34} /><Tooltip /><Legend /><Bar yAxisId="count" dataKey="scheduled" name="Tasks" fill="#0b3b60" radius={[4, 4, 0, 0]} /><Bar yAxisId="count" dataKey="events" name="Events" fill="#51c9cf" radius={[4, 4, 0, 0]} /><Area yAxisId="hours" type="monotone" dataKey="meetingHours" name="Meeting hours" stroke="#d89425" fill="transparent" strokeWidth={2} /></ComposedChart></ResponsiveContainer>
              {!data.calendarConnected && <p className="chart-note">Connect Google Calendar from the daily workspace to include events and meeting duration.</p>}
            </ChartCard>
          </section>
          <section className="focus-summary">
            <ReportItem label="Calendar load" value={`${data.calendar.reduce((sum, item) => sum + item.eventCount, 0)} events`} detail={`${(analysis.meetingMinutes / 60).toFixed(1)} meeting hours recorded.`} />
            <ReportItem label="Documentation" value={`${data.notes.length} active note days`} detail={`${analysis.noteWords} words captured in daily notes.`} />
            <ReportItem label="Strongest day" value={analysis.mostProductive?.completed ? format(parseISO(analysis.mostProductive.date), "EEEE, d MMM") : "Not enough completions"} detail={analysis.mostProductive?.completed ? `${analysis.mostProductive.completed} tasks completed on the strongest day.` : "Complete tasks to establish a daily pattern."} />
          </section>
        </div>}

        {view === "report" && <div className="analytics-view" aria-busy={loading}>
          <header className="analytics-view-heading"><div><span>Productivity report</span><h2>Decision-ready period summary</h2></div><p>{periodLabel}</p></header>
          <section className="report-card">
            <header><div><p>Productivity report</p><h2>{periodLabel}</h2></div><span>{data.tasks.length} tasks analysed</span></header>
            <div className="report-summary">
              <ReportItem label="Delivery" value={`${analysis.completed} completed`} detail={`${analysis.completionRate}% completion rate; ${analysis.open} remain open.`} />
              <ReportItem label="Focus" value={`${analysis.highPriorityBacklog} high-priority open`} detail={analysis.highPriorityBacklog ? "Review these items before accepting additional work." : "No high-priority backlog in this period."} />
              <ReportItem label="Calendar load" value={`${data.calendar.reduce((sum, item) => sum + item.eventCount, 0)} events`} detail={`${(analysis.meetingMinutes / 60).toFixed(1)} meeting hours recorded.`} />
              <ReportItem label="Documentation" value={`${data.notes.length} active note days`} detail={`${analysis.noteWords} words captured in daily notes.`} />
              <ReportItem label="Productivity pattern" value={analysis.mostProductive?.completed ? format(parseISO(analysis.mostProductive.date), "EEEE, d MMM") : "Not enough completions"} detail={analysis.mostProductive?.completed ? `${analysis.mostProductive.completed} tasks completed on the strongest day.` : "Complete tasks to establish a daily pattern."} />
              <ReportItem label="Period comparison" value={`${analysis.rateDelta >= 0 ? "+" : ""}${analysis.rateDelta} points`} detail={`Previous period completion rate: ${data.previous.completionRate}%.`} />
            </div>
          </section>
        </div>}
      </main>
    </div>
  );
}

function Kpi({ icon, label, value, note, tone }: { icon: React.ReactNode; label: string; value: string | number; note: string; tone: string }) {
  return <article className="analytics-kpi"><div className={`kpi-icon ${tone}`}>{icon}</div><div><span>{label}</span><strong>{value}</strong><small>{note}</small></div></article>;
}

function ChartCard({ title, description, wide = false, children }: { title: string; description: string; wide?: boolean; children: React.ReactNode }) {
  return <article className={`chart-card ${wide ? "wide" : ""}`}><header><h2>{title}</h2><p>{description}</p></header><div className="chart-body">{children}</div></article>;
}

function ReportItem({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article><span>{label}</span><strong>{value}</strong><p>{detail}</p></article>;
}
