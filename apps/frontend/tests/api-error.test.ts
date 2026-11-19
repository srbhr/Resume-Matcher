import { describe, expect, it } from 'vitest';
import { ApiError, apiError } from '@/lib/api/client';

const FALLBACK = 'Failed to do the thing (status 500).';

const json = (body: unknown, status = 500) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

describe('apiError: one rule for every failed lib/api response', () => {
  it.each([
    {
      name: 'a string detail is the message',
      response: json({ detail: 'Resume not found' }, 404),
      message: 'Resume not found',
      status: 404,
      code: undefined,
    },
    {
      name: 'an empty string detail falls back',
      response: json({ detail: '' }),
      message: FALLBACK,
      status: 500,
      code: undefined,
    },
    {
      name: "a validation error list joins each item's msg",
      response: json(
        {
          detail: [
            { loc: ['body', 'title'], msg: 'Field required', type: 'missing' },
            { loc: ['body', 'n'], msg: 'Input should be a valid integer', type: 'int' },
          ],
        },
        422
      ),
      message: 'Field required; Input should be a valid integer',
      status: 422,
      code: undefined,
    },
    {
      name: 'a list with no msg falls back',
      response: json({ detail: [{ loc: ['x'] }] }, 422),
      message: FALLBACK,
      status: 422,
      code: undefined,
    },
    {
      name: 'an object detail falls back and exposes its code',
      response: json({ detail: { code: 'missing_base_url', field: 'api_base' } }, 422),
      message: FALLBACK,
      status: 422,
      code: 'missing_base_url',
    },
    {
      name: 'an object detail without a code has none',
      response: json({ detail: { field: 'api_base' } }, 422),
      message: FALLBACK,
      status: 422,
      code: undefined,
    },
    {
      name: 'a non-JSON body (proxy or crash page) falls back',
      response: new Response('<html>502 Bad Gateway</html>', { status: 502 }),
      message: FALLBACK,
      status: 502,
      code: undefined,
    },
    {
      name: 'an empty body falls back',
      response: new Response(null, { status: 503 }),
      message: FALLBACK,
      status: 503,
      code: undefined,
    },
  ])('$name', async ({ response, message, status, code }) => {
    const error = await apiError(response, FALLBACK);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe(message);
    expect(error.status).toBe(status);
    expect(error.code).toBe(code);
  });

  it('keeps the structured detail for callers that branch on it', async () => {
    const detail = { code: 'missing_placeholders', field: 'cover_letter_prompt', missing: ['x'] };
    const error = await apiError(json({ detail }, 422), FALLBACK);
    expect(error.detail).toEqual(detail);
  });
});
