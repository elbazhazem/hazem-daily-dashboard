"use client";

import { useCallback, useEffect, useState } from "react";
import { addDays, format, parseISO, startOfWeek } from "date-fns";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, BookOpenCheck, BrainCircuit, ChevronLeft, ChevronRight, CircleGauge, FileDown, Flag, Lightbulb, ListChecks, Moon, NotebookText, RefreshCw, Sparkles, Sun, Target, TrendingUp } from "lucide-react";
import AppSidebar from "../../components/app-sidebar";

type Review = {
  start: string;
  end: string;
  metrics: { completionRate: number; strategicProgress: number; rolloverRate: number; momentumScore: number; completionDelta: number; completed: number; total: number; open: number; productiveDays: number; noteDays: number; highPriorityBacklog: number };
  daily: Array<{ date: string; planned: number; completed: number; rolledOver: number }>;
  categories: Array<{ name: string; total: number; completed: number; rate: number }>;
  insights: { achievement: string; blocker: string; lesson: string; mostProductiveDate: string | null; mostProductiveCount: number };
  summary: string;
  actionPlan: { continue: string; improve: string; focus: string };
  methodology: string[];
};

type View = "summary" | "progress" | "insights" | "plan";
const categoryColors = ["#0d9aa1", "#2f80c1", "#7357c7", "#d89425", "#4f7d63", "#d35c6e"];

function dateValue(date: Date) { return format(date, "yyyy-MM-dd"); }
function currentWeekStart() { return dateValue(startOfWeek(new Date(), { weekStartsOn: 1 })); }
function shiftWeek(start: string, amount: number) { return dateValue(addDays(parseISO(start), amount * 7)); }
function deltaLabel(value: number) { return `${value >= 0 ? "+" : ""}${value} pts vs last week`; }

export default function WeeklyReviewDashboard({ displayName, email }: { displayName: string; email: string }) {
  const [weekStart, setWeekStart] = useState(currentWeekStart);
  const [review, setReview] = useState<Review | null>(null);
  const [view, setView] = useState<View>("summary");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/weekly-review?start=${weekStart}`);
      if (!response.ok) throw new Error("The weekly review could not be loaded.");
      setReview(await response.json());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The weekly review could not be loaded.");
    } finally { setLoading(false); }
  }, [weekStart]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);

  const periodLabel = review ? `${format(parseISO(review.start), "d MMM")} – ${format(parseISO(review.end), "d MMM yyyy")}` : "Selected week";
  const chartDays = review?.daily.map((day) => ({ ...day, label: format(parseISO(day.date), "EEE") })) ?? [];

  return (
    <div className="site-layout">
      <AppSidebar active="weekly" />
      <main className="site-content analytics-shell weekly-shell">
        <header className="analytics-topbar weekly-topbar">
          <div><p>Explainable progress intelligence</p><h1>Weekly Review</h1><span>Turn daily tasks and notes into a clear, practical plan for steady progress.</span></div>
          <div className="analytics-profile"><button className="icon-button" onClick={() => setTheme(theme === "light" ? "dark" : "light")} aria-label="Toggle theme">{theme === "light" ? <Moon /> : <Sun />}</button><div className="avatar">{displayName.slice(0, 1).toUpperCase()}</div><div><strong>{displayName}</strong><span>{email}</span></div></div>
        </header>

        <section className="weekly-period" aria-label="Select week">
          <button className="icon-button" onClick={() => setWeekStart(shiftWeek(weekStart, -1))} aria-label="Previous week"><ChevronLeft /></button>
          <div><span>Week</span><strong>{periodLabel}</strong></div>
          <button className="icon-button" onClick={() => setWeekStart(shiftWeek(weekStart, 1))} disabled={weekStart >= currentWeekStart()} aria-label="Next week"><ChevronRight /></button>
          <button className="secondary-button" onClick={() => setWeekStart(currentWeekStart())}>Current week</button>
          <button className="icon-button" onClick={load} aria-label="Refresh weekly review"><RefreshCw className={loading ? "spin" : ""} /></button>
          <button className="primary-button" onClick={() => window.print()}><FileDown />Print / Save PDF</button>
        </section>

        <nav className="analytics-section-nav weekly-nav" aria-label="Weekly review sections">
          <ReviewTab active={view === "summary"} icon={<CircleGauge />} title="Summary" subtitle="Score & direction" onClick={() => setView("summary")} />
          <ReviewTab active={view === "progress"} icon={<TrendingUp />} title="Progress" subtitle="Tasks & categories" onClick={() => setView("progress")} />
          <ReviewTab active={view === "insights"} icon={<NotebookText />} title="Notes insights" subtitle="Signals & evidence" onClick={() => setView("insights")} />
          <ReviewTab active={view === "plan"} icon={<ListChecks />} title="Action plan" subtitle="Next week" onClick={() => setView("plan")} />
        </nav>

        {error && <div className="analytics-error" role="alert"><AlertTriangle />{error}</div>}
        {!review && !error && <div className="weekly-loading">Building the weekly review…</div>}

        {review && view === "summary" && <section className="analytics-view" aria-busy={loading}>
          <div className="weekly-signal"><Sparkles /><span><strong>{review.metrics.productiveDays} productive day{review.metrics.productiveDays === 1 ? "" : "s"}</strong> · {deltaLabel(review.metrics.completionDelta)}</span></div>
          <div className="weekly-kpis">
            <Metric icon={<Target />} label="Completion rate" value={`${review.metrics.completionRate}%`} note={`${review.metrics.completed} of ${review.metrics.total} tasks`} tone="teal" />
            <Metric icon={<Flag />} label="Strategic progress" value={`${review.metrics.strategicProgress}%`} note="Priority weighted" tone="blue" />
            <Metric icon={<RefreshCw />} label="Rollover rate" value={`${review.metrics.rolloverRate}%`} note="Lower is better" tone="amber" />
            <Metric icon={<BrainCircuit />} label="Momentum score" value={`${review.metrics.momentumScore} / 100`} note="Six transparent factors" tone="violet" />
          </div>
          <div className="weekly-summary-grid">
            <article className="weekly-summary-card"><header><BookOpenCheck /><div><span>Weekly summary</span><h2>What the data says</h2></div></header><p>{review.summary}</p><div className="weekly-summary-facts"><span><strong>{review.metrics.open}</strong> open tasks</span><span><strong>{review.metrics.highPriorityBacklog}</strong> high-priority backlog</span><span><strong>{review.metrics.noteDays}</strong> note days</span></div></article>
            <article className="weekly-mini-chart"><header><h2>Daily progress</h2><p>Planned and completed tasks</p></header><ResponsiveContainer width="100%" height={250}><LineChart data={chartDays}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="label"/><YAxis allowDecimals={false} width={28}/><Tooltip/><Legend/><Line type="monotone" dataKey="planned" name="Planned" stroke="#2f80c1" strokeWidth={2}/><Line type="monotone" dataKey="completed" name="Completed" stroke="#0d9aa1" strokeWidth={3}/></LineChart></ResponsiveContainer></article>
          </div>
        </section>}

        {review && view === "progress" && <section className="analytics-view">
          <header className="analytics-view-heading"><div><span>Progress</span><h2>Delivery, carry-over, and focus</h2></div><p>{periodLabel}</p></header>
          <div className="weekly-chart-grid">
            <article className="chart-card"><header><h2>Planned vs completed vs rolled over</h2><p>Daily task movement during the selected week</p></header><ResponsiveContainer width="100%" height={310}><BarChart data={chartDays}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="label"/><YAxis allowDecimals={false} width={28}/><Tooltip/><Legend/><Bar dataKey="planned" name="Planned" fill="#2f80c1" radius={[5,5,0,0]}/><Bar dataKey="completed" name="Completed" fill="#0d9aa1" radius={[5,5,0,0]}/><Bar dataKey="rolledOver" name="Rolled over" fill="#d89425" radius={[5,5,0,0]}/></BarChart></ResponsiveContainer></article>
            <article className="chart-card"><header><h2>Focus by category</h2><p>Share of scheduled tasks</p></header>{review.categories.length ? <ResponsiveContainer width="100%" height={310}><PieChart><Pie data={review.categories} dataKey="total" nameKey="name" innerRadius={62} outerRadius={96} paddingAngle={3}>{review.categories.map((category, index) => <Cell key={category.name} fill={categoryColors[index % categoryColors.length]}/>)}</Pie><Tooltip/><Legend/></PieChart></ResponsiveContainer> : <Empty message="No categorized tasks in this week."/>}</article>
          </div>
          <div className="category-progress-list">{review.categories.map((category) => <article key={category.name}><div><strong>{category.name}</strong><span>{category.completed} of {category.total} completed</span></div><div className="category-meter"><i style={{ width: `${category.rate}%` }}/></div><b>{category.rate}%</b></article>)}</div>
        </section>}

        {review && view === "insights" && <section className="analytics-view">
          <header className="analytics-view-heading"><div><span>Notes insights</span><h2>Signals extracted with visible rules</h2></div><p>{review.metrics.noteDays} days with notes</p></header>
          <div className="insight-cards">
            <Insight icon={<Target />} title="Top achievement" text={review.insights.achievement} tone="positive" />
            <Insight icon={<AlertTriangle />} title="Recurring blocker" text={review.insights.blocker} tone="warning" />
            <Insight icon={<Lightbulb />} title="Key lesson" text={review.insights.lesson} tone="learning" />
          </div>
          <article className="evidence-card"><header><BrainCircuit /><div><h2>How this review is calculated</h2><p>Every score and recommendation can be traced to a rule.</p></div></header><ol>{review.methodology.map((item) => <li key={item}>{item}</li>)}</ol></article>
        </section>}

        {review && view === "plan" && <section className="analytics-view">
          <header className="analytics-view-heading"><div><span>Action plan</span><h2>Three decisions for the next week</h2></div><p>Based on {periodLabel}</p></header>
          <div className="action-plan-grid">
            <Action number="01" title="Continue" text={review.actionPlan.continue} tone="continue" />
            <Action number="02" title="Improve" text={review.actionPlan.improve} tone="improve" />
            <Action number="03" title="Focus" text={review.actionPlan.focus} tone="focus" />
          </div>
          <article className="weekly-commitment"><Flag /><div><span>Recommended planning limit</span><h2>Define three essential outcomes before adding optional tasks.</h2><p>This keeps the plan measurable and protects strategic work from a growing backlog.</p></div></article>
        </section>}
      </main>
    </div>
  );
}

function ReviewTab({ active, icon, title, subtitle, onClick }: { active: boolean; icon: React.ReactNode; title: string; subtitle: string; onClick: () => void }) { return <button className={active ? "active" : ""} onClick={onClick} aria-current={active ? "page" : undefined}>{icon}<span><strong>{title}</strong><small>{subtitle}</small></span></button>; }
function Metric({ icon, label, value, note, tone }: { icon: React.ReactNode; label: string; value: string; note: string; tone: string }) { return <article className="weekly-metric"><div className={`weekly-metric-icon ${tone}`}>{icon}</div><div><span>{label}</span><strong>{value}</strong><small>{note}</small></div></article>; }
function Insight({ icon, title, text, tone }: { icon: React.ReactNode; title: string; text: string; tone: string }) { return <article className={`insight-card ${tone}`}><div>{icon}</div><span>{title}</span><p>{text}</p></article>; }
function Action({ number, title, text, tone }: { number: string; title: string; text: string; tone: string }) { return <article className={`action-card ${tone}`}><span>{number}</span><div><h2>{title}</h2><p>{text}</p></div></article>; }
function Empty({ message }: { message: string }) { return <div className="weekly-empty">{message}</div>; }
