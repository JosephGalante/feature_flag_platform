import {cookies} from "next/headers";
import {redirect} from "next/navigation";
import {SESSION_COOKIE_NAME, getCurrentAdmin} from "../lib/admin-api";

export default async function HomePage() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionCookie) {
    redirect("/login");
  }

  const admin = await getCurrentAdmin(sessionCookie).catch(() => {
    redirect("/login?error=api_unavailable");
  });

  redirect(admin ? "/console" : "/login?error=session_expired");
}
