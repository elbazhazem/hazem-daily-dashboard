"use client";

import { useEffect, useState } from "react";
import { BarChart3, CheckCircle2, LayoutDashboard, Menu, X } from "lucide-react";
import Link from "next/link";

export default function AppSidebar({ active }: { active: "dashboard" | "analytics" }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 901px)");
    const applyViewportPreference = () => {
      if (desktop.matches) setOpen(window.localStorage.getItem("dashboard-sidebar-open") !== "false");
      else setOpen(false);
    };
    applyViewportPreference();
    desktop.addEventListener("change", applyViewportPreference);
    return () => desktop.removeEventListener("change", applyViewportPreference);
  }, []);

  function toggleSidebar() {
    setOpen((current) => {
      const next = !current;
      if (window.matchMedia("(min-width: 901px)").matches) {
        window.localStorage.setItem("dashboard-sidebar-open", String(next));
      }
      return next;
    });
  }

  return (
    <>
      <button className="sidebar-toggle" type="button" onClick={toggleSidebar} aria-label={open ? "Hide navigation menu" : "Show navigation menu"} aria-expanded={open} aria-controls="app-navigation">
        {open ? <X /> : <Menu />}
      </button>
      <button className={`sidebar-overlay ${open ? "visible" : ""}`} type="button" onClick={toggleSidebar} aria-label="Close navigation menu" tabIndex={open ? 0 : -1} />
      <aside id="app-navigation" className={`app-sidebar ${open ? "open" : "closed"}`} aria-label="Main navigation" aria-hidden={!open}>
        <Link className="sidebar-brand" href="/" aria-label="Daily Dashboard home" tabIndex={open ? 0 : -1}>
          <span><CheckCircle2 /></span>
          <div><strong>Daily Dashboard</strong><small>Academic workspace</small></div>
        </Link>
        <nav>
          <Link className={active === "dashboard" ? "active" : ""} href="/" aria-current={active === "dashboard" ? "page" : undefined} tabIndex={open ? 0 : -1}>
            <LayoutDashboard /><span>Daily workspace</span>
          </Link>
          <Link className={active === "analytics" ? "active" : ""} href="/analytics" aria-current={active === "analytics" ? "page" : undefined} tabIndex={open ? 0 : -1}>
            <BarChart3 /><span>Analytics &amp; Reports</span>
          </Link>
        </nav>
        <div className="sidebar-foot">
          <BarChart3 />
          <span>Turn daily activity into actionable productivity insight.</span>
        </div>
      </aside>
    </>
  );
}
