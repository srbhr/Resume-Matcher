/**
 * API Proxy Route
 *
 * This catch-all route proxies all /api/* requests to the backend server.
 * This eliminates CORS issues by making the frontend the single entry point.
 *
 * Flow:
 * Browser → Next.js /api/* (same-origin, no CORS) → Backend (server-to-server, no CORS)
 */

import { NextRequest, NextResponse } from 'next/server';

// Backend URL - only needs to be accessible from Next.js server, not from browser
const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

/**
 * Proxy all HTTP methods to backend
 */
async function proxyRequest(
  request: NextRequest,
  context: { params: Promise<{ proxy: string[] }> }
): Promise<NextResponse> {
  try {
    const { proxy } = await context.params;
    const path = proxy.join('/');

    // Build backend URL
    const backendUrl = `${BACKEND_URL}/api/v1/${path}`;

    // Add query parameters if present
    const searchParams = request.nextUrl.searchParams.toString();
    const url = searchParams ? `${backendUrl}?${searchParams}` : backendUrl;

    // Copy body for methods that support it
    let body: FormData | string | ArrayBuffer | undefined = undefined;
    let isFormData = false;

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      // For form data (file uploads)
      if (request.headers.get('content-type')?.includes('multipart/form-data')) {
        body = await request.formData();
        isFormData = true;
      }
      // For JSON
      else if (request.headers.get('content-type')?.includes('application/json')) {
        const text = await request.text();
        body = text || undefined;
      }
      // For other content types
      else {
        body = await request.arrayBuffer();
      }
    }

    // Copy headers from incoming request
    const headers = new Headers();
    request.headers.forEach((value: string, key: string) => {
      const lowerKey = key.toLowerCase();
      // Skip host header to avoid conflicts
      if (lowerKey === 'host') {
        return;
      }
      // Skip content-type and content-length for FormData - let fetch recalculate
      if (isFormData && (lowerKey === 'content-type' || lowerKey === 'content-length')) {
        return;
      }
      headers.set(key, value);
    });

    // Make request to backend
    const response = await fetch(url, {
      method: request.method,
      headers,
      body,
      // Don't follow redirects automatically
      redirect: 'manual',
      // Add duplex for streaming body
      ...(body && { duplex: 'half' as any }),
    });

    // Copy response headers
    const responseHeaders = new Headers(response.headers);

    // Remove CORS headers since we're now same-origin
    responseHeaders.delete('access-control-allow-origin');
    responseHeaders.delete('access-control-allow-methods');
    responseHeaders.delete('access-control-allow-headers');
    responseHeaders.delete('access-control-allow-credentials');

    // Return proxied response
    return new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });

  } catch (error) {
    console.error('[API Proxy Error]', error);
    return NextResponse.json(
      {
        error: 'Failed to proxy request to backend',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 502 }
    );
  }
}

// Export handlers for all HTTP methods
export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
export const PATCH = proxyRequest;
export const DELETE = proxyRequest;
export const OPTIONS = proxyRequest;

