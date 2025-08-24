import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

// This route depends on per-request auth cookies. Disable static optimization/caching.
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';
export const runtime = 'nodejs';

// Whitelist the backend origin to avoid open proxy
const defaultBackend = process.env.NODE_ENV === 'development'
  ? 'http://localhost:8000'
  : 'https://resume-matcher-backend-j06k.onrender.com';
const BACKEND_BASE = (process.env.NEXT_PUBLIC_API_BASE || process.env.NEXT_PUBLIC_API_URL || defaultBackend).replace(/\/$/, '');

export async function GET(req: NextRequest, ctx: any) {
  return proxy(req, ctx?.params);
}

export async function POST(req: NextRequest, ctx: any) {
  return proxy(req, ctx?.params);
}

export async function PUT(req: NextRequest, ctx: any) {
  return proxy(req, ctx?.params);
}

export async function PATCH(req: NextRequest, ctx: any) {
  return proxy(req, ctx?.params);
}

export async function DELETE(req: NextRequest, ctx: any) {
  return proxy(req, ctx?.params);
}

async function proxy(req: NextRequest, params: { path: string[] } | undefined) {
  // Only allow forwarding to /api/v1/*
  const joined = (params?.path ?? []).join('/');
  if (!joined.startsWith('api/v1/')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const a = await auth();
  // Prefer a Clerk JWT Template for backend verification. Configure CLERK_JWT_TEMPLATE in env (e.g., "backend").
  // Fall back to 'default' template if not provided.
  const template = process.env.CLERK_JWT_TEMPLATE || 'default';
  const token = await a.getToken({ template }).catch(() => null);
  const url = `${BACKEND_BASE}/${joined}` + (req.nextUrl.search || '');
  // If this is a protected POST endpoint and there is no token, return 401 directly
  const isProtectedPost = req.method !== 'GET' && (
    joined.startsWith('api/v1/resumes/upload') ||
    joined.startsWith('api/v1/resumes/improve') ||
    joined.startsWith('api/v1/jobs/upload') ||
    joined.startsWith('api/v1/match') ||
    joined.startsWith('api/v1/auth')
  );
  if (isProtectedPost && !token) {
  return NextResponse.json({ detail: 'Missing bearer token' }, { status: 401 });
  }

  const headers = new Headers(req.headers);
  headers.delete('host');
  headers.delete('x-forwarded-host');
  headers.delete('x-forwarded-proto');
  headers.delete('content-length'); // Let node-fetch compute length for streamed body
  headers.set('accept', 'application/json');
  if (token) headers.set('authorization', `Bearer ${token}`);

  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : (req.body as any);
  const init: RequestInit & { duplex?: 'half' } = {
    method: req.method,
    headers,
    body,
    // Required by Node 18+ when streaming a request body
    ...(body ? { duplex: 'half' as const } : {}),
    cache: 'no-store',
    redirect: 'manual',
  };

  const res = await fetch(url, init);
  const resHeaders = new Headers(res.headers);
  // Remove hop-by-hop headers
  resHeaders.delete('transfer-encoding');
  resHeaders.delete('connection');
  return new NextResponse(res.body, { status: res.status, headers: resHeaders });
}
