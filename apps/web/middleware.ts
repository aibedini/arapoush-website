import { NextResponse, type NextRequest } from "next/server";
import { defaultLocale, isLocale } from "@/lib/i18n/config";

// Sends locale-less paths to the default (Persian) site.
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const first = pathname.split("/")[1] ?? "";
  if (isLocale(first)) return NextResponse.next();

  const url = request.nextUrl.clone();
  url.pathname = `/${defaultLocale}${pathname === "/" ? "" : pathname}`;
  // Permanent: the mapping never changes (search engines pass ranking straight through).
  return NextResponse.redirect(url, 308);
}

export const config = {
  // /api (OPEX webhooks, preview) and /media (OPEX uploads) are not localized pages.
  matcher: ["/((?!_next/|images/|media/|api/|favicon|.*\\..*).*)"],
};
