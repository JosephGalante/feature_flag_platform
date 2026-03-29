"use server";

import {cookies} from "next/headers";
import {redirect} from "next/navigation";
import {SESSION_COOKIE_NAME, loginAsAdmin, readCookieValue} from "../lib/admin-api";

function readEmail(formData: FormData): string {
  const rawValue = formData.get("email");
  return typeof rawValue === "string" ? rawValue.trim() : "";
}

export async function loginAction(formData: FormData): Promise<void> {
  const email = readEmail(formData);

  if (email.length === 0) {
    redirect("/login?error=missing_email");
  }

  const result = await loginAsAdmin(email).catch(() => {
    redirect("/login?error=api_unavailable");
  });

  if (result.status === 401) {
    redirect("/login?error=invalid_credentials");
  }

  if (result.status !== 200) {
    redirect("/login?error=api_unavailable");
  }

  const cookieValue = readCookieValue(result.setCookieHeader, SESSION_COOKIE_NAME);

  if (!cookieValue) {
    redirect("/login?error=session_cookie_missing");
  }

  const cookieStore = await cookies();
  cookieStore.set({
    name: SESSION_COOKIE_NAME,
    value: cookieValue,
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  redirect("/console");
}

export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  redirect("/login");
}
