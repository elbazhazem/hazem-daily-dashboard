import { CalendarDays, CheckCircle2, LockKeyhole } from "lucide-react";

export default function GoogleLogin({ error }: { error?: string }) {
  const message = error === "error"
    ? "Google sign-in could not be completed. Please try again."
    : null;

  return (
    <main className="login-shell">
      <section className="login-card">
        <div className="login-brand"><span><CheckCircle2 /></span><strong>Daily Dashboard</strong></div>
        <div className="login-visual"><CalendarDays /><span>Calendar · Tasks · Notes</span></div>
        <div className="login-copy">
          <p>Private academic workspace</p>
          <h1>Plan the day from one focused view.</h1>
          <span>Sign in with the Google account whose calendar you want to use. Calendar access is read-only.</span>
        </div>
        {message && <div className="login-error" role="alert">{message}</div>}
        <a className="google-button" href="/api/google/connect">
          <span className="google-mark" aria-hidden="true">G</span>
          Continue with Google
        </a>
        <div className="login-security"><LockKeyhole /><span>Your dashboard data is isolated by Google account.</span></div>
      </section>
    </main>
  );
}
