import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'your-secret-key-change-this'
);

async function verifyAuth(token: string): Promise<boolean> {
  try {
    await jwtVerify(token, JWT_SECRET);
    return true;
  } catch (error) {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const token = request.cookies.get('auth-token')?.value;
  const { pathname } = request.nextUrl;

  // Verify token
  const isAuthenticated = token ? await verifyAuth(token) : false;

  // Define route types
  const protectedRoutes = ['/dashboard', '/vault', '/settings', '/profile'];
  const authRoutes = ['/auth', '/login', '/signup'];
  const publicRoutes = ['/auth'];

  const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route));
  const isAuthRoute = authRoutes.some(route => pathname.startsWith(route));
  const isPublicRoute = pathname === '/';

  console.log('Middleware:', { pathname, isAuthenticated, token: !!token });

  // RULE 1: Protected routes require authentication
  if (isProtectedRoute && !isAuthenticated) {
    console.log('Redirecting to /auth - not authenticated');
    const url = new URL('/auth', request.url);
    return NextResponse.redirect(url);
  }

  // RULE 2: Auth routes should redirect authenticated users to dashboard
  if (isAuthRoute && isAuthenticated) {
    console.log('Redirecting to /dashboard - already authenticated');
    const url = new URL('/dashboard', request.url);
    return NextResponse.redirect(url);
  }

  // RULE 3: Home page (/) redirects authenticated users to dashboard
  if (isPublicRoute && isAuthenticated) {
    console.log('Redirecting to /dashboard - authenticated user on home');
    const url = new URL('/dashboard', request.url);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api routes (handled separately)
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};