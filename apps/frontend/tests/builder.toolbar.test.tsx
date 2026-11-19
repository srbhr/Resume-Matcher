import { fireEvent, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startMsw } from './support/msw';
import { installDomShims, removeDomShims } from './support/dom-shims';
import {
  API,
  SERVER_RESUME,
  backgroundHandlers,
  en,
  renderBuilder,
  resumeBody,
  route,
} from './support/builder-page';

/**
 * The builder's header toolbar: the resume download and the community links.
 * Real page, layout and toaster; MSW answers the network.
 */

vi.mock('next/navigation', async () => (await import('./support/navigation')).navigation);

let pdfRequests = 0;

const server = startMsw();

beforeEach(() => {
  installDomShims();
  localStorage.clear();
  route.search = 'id=a';
  pdfRequests = 0;
  // Saving a PDF uses two browser APIs jsdom lacks: blob URLs and link clicks.
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:pdf'),
  });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  server.use(
    ...backgroundHandlers(),
    http.get(`${API}/resumes`, () => HttpResponse.json(resumeBody(SERVER_RESUME))),
    http.get(`${API}/resumes/:id/pdf`, () => {
      pdfRequests += 1;
      return new HttpResponse(new Blob(['%PDF']), {
        headers: { 'Content-Type': 'application/pdf' },
      });
    })
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  removeDomShims();
});

describe('builder resume download', () => {
  it('confirms a finished download with a toast, not a dialog to dismiss (#1091)', async () => {
    renderBuilder();
    await screen.findByDisplayValue('Ada Lovelace');

    fireEvent.click(screen.getByRole('button', { name: en.common.download }));

    expect(await screen.findByText(en.builder.alerts.downloadSuccess)).toBeInTheDocument();
    expect(pdfRequests).toBe(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('builder community links', () => {
  it('puts Join Discord and Star on GitHub in the header toolbar, with no footer bar', async () => {
    renderBuilder();
    await screen.findByDisplayValue('Ada Lovelace');

    const discord = screen.getByRole('link', { name: en.community.joinDiscord });
    const star = screen.getByRole('link', { name: en.community.starOnGithub });
    expect(discord).toHaveAttribute('href', 'https://dsc.gg/resume-matcher');
    expect(star).toHaveAttribute('href', 'https://github.com/srbhr/Resume-Matcher');
    // In the page header (the toolbar), not the resume canvas.
    const header = discord.closest('header');
    expect(header).not.toBeNull();
    expect(header).toContainElement(star);
    // Below 2xl the label collapses to an icon; the tooltip still names it.
    expect(discord).toHaveAttribute('title', en.community.joinDiscord);
    expect(screen.queryByRole('contentinfo')).toBeNull();
  });
});
