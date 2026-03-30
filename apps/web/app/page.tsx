import {cookies} from "next/headers";
import {redirect} from "next/navigation";
import {SESSION_COOKIE_NAME, getCurrentAdmin} from "../lib/admin-api";
import {buildAuthEntryHref} from "../lib/demo-mode";

export default async function HomePage() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionCookie) {
    redirect(buildAuthEntryHref());
  }

  const admin = await getCurrentAdmin(sessionCookie).catch(() => {
    redirect(buildAuthEntryHref({error: "api_unavailable"}));
  });

  redirect(admin ? "/console" : buildAuthEntryHref());
}
