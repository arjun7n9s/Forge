import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(_request: NextRequest) {
  const response = NextResponse.next();
  const token = process.env.NEXT_PUBLIC_ORIGIN_TOKEN?.trim();
  if (token) response.headers.set('Origin-Trial', token);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
