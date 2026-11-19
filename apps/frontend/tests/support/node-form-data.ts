import { File as NodeFile } from 'node:buffer';
import { vi } from 'vitest';

/**
 * jsdom replaces FormData and File with its own, which Node's fetch can't send:
 * MSW then sees the multipart stream close early. Specs that upload a file
 * install Node's own FormData (taken from Node's Response, which jsdom leaves
 * alone) and build files with `nodeFile`. Browsers have one realm, so the app
 * code is unchanged.
 */
export async function installNodeFormData(): Promise<void> {
  const parsed = await new Response(new URLSearchParams('probe=1')).formData();
  vi.stubGlobal('FormData', parsed.constructor);
}

export function nodeFile(content: string, name: string, type: string): File {
  return new NodeFile([content], name, { type }) as unknown as File;
}
