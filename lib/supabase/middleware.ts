import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getUser() always makes a request to the Auth server. That can hold the
  // entire App Router response in its loading shell when the service or the
  // local connection is slow. getClaims() is the recommended SSR guard: it
  // validates the JWT locally (using cached signing keys where available).
  const { data } = await supabase.auth.getClaims();

  const isAuthPage =
    request.nextUrl.pathname.startsWith('/login') ||
    request.nextUrl.pathname.startsWith('/sign-up');
  const isAuthCallback = request.nextUrl.pathname.startsWith('/auth');
  const isApiRoute = request.nextUrl.pathname.startsWith('/api');
  const isPublicRoute = request.nextUrl.pathname === '/';
  const isPublicAsset =
    request.nextUrl.pathname === '/sw.js' ||
    request.nextUrl.pathname === '/manifest.webmanifest';

  if (
    !data?.claims?.sub &&
    !isAuthPage &&
    !isAuthCallback &&
    !isApiRoute &&
    !isPublicRoute &&
    !isPublicAsset
  ) {
    const nextPath = request.nextUrl.pathname + request.nextUrl.search;
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = '';
    url.searchParams.set('next', nextPath);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
