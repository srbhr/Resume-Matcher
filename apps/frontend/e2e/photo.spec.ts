import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { DEFAULT_TEMPLATE_SETTINGS, TEMPLATE_OPTIONS } from '../lib/types/template-settings';

/**
 * Photo CVs in a real browser: in every template the photo sits in the
 * header's top-right corner at 35:45 and covers none of the header's text.
 * jsdom can't measure layout, so this is the layout check. Host: the builder's
 * live preview (the same CSS as the PDF), every /api/v1 call stubbed.
 */

const PHOTO = `data:image/jpeg;base64,${readFileSync(path.join(__dirname, 'fixtures/photo.jpg')).toString('base64')}`;

const RESUME = {
  personalInfo: {
    name: 'Ada Augusta Lovelace',
    title: 'Mathematician and Analytical Engine Programmer',
    email: 'ada@example.com',
    phone: '+44 20 7946 0000',
    location: 'London, United Kingdom',
    website: 'https://ada.example.com',
    linkedin: 'https://linkedin.com/in/ada',
    github: 'https://github.com/ada',
  },
  summary: 'Wrote the first published algorithm for a machine.',
  workExperience: [],
  education: [],
  personalProjects: [],
  additional: {},
};

for (const { id: template } of TEMPLATE_OPTIONS) {
  test(`the ${template} template places the photo top right without covering text`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1600, height: 1100 });
    const stubs: Record<string, unknown> = {
      '/status': {
        status: 'ready',
        llm_configured: true,
        llm_healthy: true,
        agent_mode: false,
        has_master_resume: true,
        database_stats: {
          total_resumes: 1,
          total_jobs: 0,
          total_improvements: 0,
          has_master_resume: true,
        },
      },
      '/config/language': { ui_language: 'en', content_language: 'en' },
      '/config/llm-api-key': {
        provider: 'openai',
        model: 'gpt-4o-mini',
        api_key: '',
        api_base: null,
        reasoning_effort: null,
      },
      '/resumes': {
        request_id: 'req',
        data: {
          resume_id: 'res-1',
          raw_resume: {
            id: 1,
            content: '',
            content_type: 'md',
            created_at: '2026-01-01T00:00:00Z',
            processing_status: 'ready',
          },
          processed_resume: RESUME,
          parent_id: null,
          title: 'r',
          template_settings: { ...DEFAULT_TEMPLATE_SETTINGS, template },
        },
      },
      '/resumes/res-1/photo': { photo: PHOTO },
    };
    await page.route('**/api/v1/**', (route) => {
      const path = new URL(route.request().url()).pathname.replace(/^\/api\/v1/, '');
      if (path in stubs) return route.fulfill({ json: stubs[path] });
      testInfo.annotations.push({ type: 'unstubbed', description: path });
      return route.fulfill({ status: 404, json: { detail: 'not stubbed' } });
    });
    await page.goto('/builder?id=res-1');

    // The page the user sees, not the preview's measuring copy: that copy is
    // inert, transparent and off screen, but Playwright still counts it visible.
    const photo = page.locator('img[data-resume-photo]:not([inert] img)').first();
    await expect(photo).toBeVisible();
    await expect(photo).toHaveJSProperty('complete', true);

    const layout = await photo.evaluate((img) => {
      const header = img.parentElement as HTMLElement;
      const box = img.getBoundingClientRect();
      const frame = header.getBoundingClientRect();
      // Every text run in the header, measured line box by line box.
      const covered: string[] = [];
      const walker = document.createTreeWalker(header, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent?.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const line of Array.from(range.getClientRects())) {
          const overlaps =
            line.left < box.right - 0.5 &&
            line.right > box.left + 0.5 &&
            line.top < box.bottom - 0.5 &&
            line.bottom > box.top + 0.5;
          if (overlaps) covered.push(node.textContent.trim().slice(0, 40));
        }
      }
      return {
        covered,
        rightGap: frame.right - box.right,
        topGap: box.top - frame.top,
        ratio: box.width / box.height,
        // Room below the photo for the header's bottom padding and rule, so it
        // never sits on the line under the header.
        clearOfRule: (() => {
          const style = getComputedStyle(header);
          // The preview is zoomed with a CSS transform: client rects are scaled,
          // computed padding is not.
          const scale = frame.height / header.offsetHeight;
          const below = parseFloat(style.paddingBottom) + parseFloat(style.borderBottomWidth);
          return frame.bottom - below * scale - box.bottom;
        })(),
      };
    });

    await photo.locator('..').screenshot({ path: testInfo.outputPath(`photo-${template}.png`) });
    expect(layout.covered, 'header text under the photo').toEqual([]);
    expect(Math.abs(layout.rightGap)).toBeLessThan(1);
    expect(Math.abs(layout.topGap)).toBeLessThan(1);
    expect(layout.ratio).toBeCloseTo(35 / 45, 2);
    expect(layout.clearOfRule, 'photo overlaps the header padding or rule').toBeGreaterThan(-0.5);
  });
}
