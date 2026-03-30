import {SESSION_COOKIE_NAME, loginAsAdmin, readCookieValue} from "@/lib/admin-api";
import {isReadOnlyDemoEnabled, readDemoAdminEmail} from "@/lib/demo-mode";
import {type NextRequest, NextResponse} from "next/server";

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!isReadOnlyDemoEnabled()) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const result = await loginAsAdmin(readDemoAdminEmail()).catch(() => null);

  if (!result) {
    return NextResponse.redirect(new URL("/login?error=api_unavailable", request.url));
  }

  if (result.status === 401) {
    return NextResponse.redirect(new URL("/login?error=invalid_credentials", request.url));
  }

  if (result.status !== 200) {
    return NextResponse.redirect(new URL("/login?error=api_unavailable", request.url));
  }

  const cookieValue = readCookieValue(result.setCookieHeader, SESSION_COOKIE_NAME);

  if (!cookieValue) {
    return NextResponse.redirect(new URL("/login?error=session_cookie_missing", request.url));
  }

  const response = NextResponse.redirect(new URL("/console", request.url));

  response.cookies.set({
    httpOnly: true,
    name: SESSION_COOKIE_NAME,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    value: cookieValue,
  });

  return response;
}
