import Dashboard from "./dashboard";
import GoogleLogin from "./login";
import { getGoogleSession } from "./google-session";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ auth?: string }> }) {
  const session = await getGoogleSession();
  if (!session) {
    const params = await searchParams;
    return <GoogleLogin error={params.auth} />;
  }
  return <Dashboard displayName={session.name} email={session.email} />;
}
