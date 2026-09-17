import GoogleLogin from "../login";
import { getGoogleSession } from "../google-session";
import WeeklyReviewDashboard from "./weekly-review-dashboard";

export const dynamic = "force-dynamic";

export default async function WeeklyReviewPage({ searchParams }: { searchParams: Promise<{ auth?: string }> }) {
  const session = await getGoogleSession();
  if (!session) return <GoogleLogin error={(await searchParams).auth} />;
  return <WeeklyReviewDashboard displayName={session.name} email={session.email} />;
}
