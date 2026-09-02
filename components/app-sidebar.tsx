"use client";

import { BarChart3, CheckCircle2, LayoutDashboard } from "lucide-react";
import Link from "next/link";

export default function AppSidebar({ active }: { active: "dashboard" | "analytics" }) {
  return (
    <aside className="app-sidebar" aria-label="Main navigation">
      <Link className="sidebar-brand" href="/" aria-label="Daily Dashboard home">
        <span><CheckCircle2 /></span>
        <div><strong>Daily Dashboard</strong><small>Academic workspace</small></div>
      </Link>
      <nav>
        <Link className={active === "dashboard" ? "active" : ""} href="/" aria-current={active === "dashboard" ? "page" : undefined}>
          <LayoutDashboard /><span>Daily workspace</span>
        </Link>
        <Link className={active === "analytics" ? "active" : ""} href="/analytics" aria-current={active === "analytics" ? "page" : undefined}>
          <BarChart3 /><span>Analytics &amp; Reports</span>
        </Link>
      </nav>
      <div className="sidebar-foot">
        <BarChart3 />
        <span>Turn daily activity into actionable productivity insight.</span>
      </div>
    </aside>
  );
}
