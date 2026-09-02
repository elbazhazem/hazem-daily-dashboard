import GoogleLogin from "../login";
import { getGoogleSession } from "../google-session";
import AnalyticsDashboard from "./analytics-dashboard";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage({ searchParams }: { searchParams: Promise<{ auth?: string }> }) {
  const session = await getGoogleSession();
  if (!session) {
    const params = await searchParams;
    return <GoogleLogin error={params.auth} />;
  }
  return <AnalyticsDashboard displayName={session.name} email={session.email} />;
}
