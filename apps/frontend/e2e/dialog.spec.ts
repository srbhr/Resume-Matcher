import { expect, test, type Locator, type Page } from '@playwright/test';
import en from '../messages/en.json';

/**
 * The dialog contract: what a user can observe about a dialog, written so the
 * same spec passes before and after `components/ui/dialog.tsx` moves to the
 * native `<dialog>` element. It names no implementation detail (no portal, no
 * aria-modal attribute, no class names): only roles, focus, keys, pointer
 * hits and pixels.
 *
 * Host: /builder, with every API call stubbed in the browser.
 */

const RESUME = {
  personalInfo: { name: 'Ada Lovelace', email: 'ada@example.com' },
  summary: 'Real summary from the server',
  workExperience: [],
  education: [],
  personalProjects: [],
  additional: {},
};

const STUBS: Record<string, unknown> = {
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
    },
  },
};

/** Answer every /api/v1 call in the browser; note any the stubs don't cover. */
async function stubApi(page: Page, resume: unknown = RESUME) {
  const resumes = STUBS['/resumes'] as { data: Record<string, unknown> };
  const stubs = {
    ...STUBS,
    '/resumes': { ...resumes, data: { ...resumes.data, processed_resume: resume } },
  };
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api\/v1/, '');
    if (path in stubs) return route.fulfill({ json: stubs[path as keyof typeof stubs] });
    test.info().annotations.push({ type: 'unstubbed', description: path });
    return route.fulfill({ status: 404, json: { detail: 'not stubbed' } });
  });
}

async function openBuilder(page: Page) {
  await stubApi(page);
  await page.goto('/builder?id=res-1');
  await expect(page.getByLabel(en.resume.personalInfo.name)).toHaveValue('Ada Lovelace');
}

const focusIsInside = (dialog: Locator) =>
  dialog.evaluate((el) => el.contains(document.activeElement));

/** Whether a pointer at the centre of `target` would hit `target`. */
async function pointerReaches(page: Page, target: Locator) {
  const box = await target.boundingBox();
  if (!box) return false;
  const handle = await target.elementHandle();
  return page.evaluate(
    ([x, y, el]) => {
      const hit = document.elementFromPoint(x as number, y as number);
      return Boolean(hit && (el as Element).contains(hit));
    },
    [box.x + box.width / 2, box.y + box.height / 2, handle] as const
  );
}

test.describe('dialog contract', () => {
  test.beforeEach(async ({ page }) => {
    await openBuilder(page);
  });

  test('opens as a modal: focus moves in and stays in, the page behind takes no pointer', async ({
    page,
  }) => {
    const trigger = page.getByRole('button', {
      name: en.builder.customSections.addCustomSectionButton,
    });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: en.builder.customSections.dialogTitle });
    await expect(dialog).toBeVisible();
    await expect.poll(() => focusIsInside(dialog)).toBe(true);

    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press('Tab');
      expect(await focusIsInside(dialog)).toBe(true);
    }
    for (let i = 0; i < 4; i += 1) {
      await page.keyboard.press('Shift+Tab');
      expect(await focusIsInside(dialog)).toBe(true);
    }

    const behind = page.getByRole('button', { name: en.nav.backToDashboard, includeHidden: true });
    expect(await pointerReaches(page, behind)).toBe(false);
  });

  test('Escape closes it and focus returns to the trigger', async ({ page }) => {
    const trigger = page.getByRole('button', {
      name: en.builder.customSections.addCustomSectionButton,
    });
    await trigger.click();
    const dialog = page.getByRole('dialog', { name: en.builder.customSections.dialogTitle });
    await expect(dialog).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('a click outside it closes it', async ({ page }) => {
    await page
      .getByRole('button', { name: en.builder.customSections.addCustomSectionButton })
      .click();
    const dialog = page.getByRole('dialog', { name: en.builder.customSections.dialogTitle });
    await expect(dialog).toBeVisible();

    await page.mouse.click(4, 4);
    await expect(dialog).toBeHidden();
  });

  test('a press that starts inside and ends outside does not close it', async ({ page }) => {
    await page
      .getByRole('button', { name: en.builder.customSections.addCustomSectionButton })
      .click();
    const dialog = page.getByRole('dialog', { name: en.builder.customSections.dialogTitle });
    const input = dialog.getByLabel(en.builder.customSections.sectionNameLabel);
    const box = await input.boundingBox();
    if (!box) throw new Error('section name input has no box');

    // Selecting text and letting go past the panel's edge.
    await page.mouse.move(box.x + 10, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(4, 4);
    await page.mouse.up();
    await expect(dialog).toBeVisible();
  });

  test('keeps the Swiss look', async ({ page }) => {
    await page
      .getByRole('button', { name: en.builder.customSections.addCustomSectionButton })
      .click();
    await expect(
      page.getByRole('dialog', { name: en.builder.customSections.dialogTitle })
    ).toBeVisible();
    // The first approved run records the baseline; the run after the swap compares.
    // Near zero: a colour change or a 1px shift of the panel must fail.
    await expect(page).toHaveScreenshot('add-section-dialog.png', { maxDiffPixels: 10 });
  });
});

test.describe('dialog contract: a phone-width viewport', () => {
  test.use({ viewport: { width: 375, height: 740 } });

  test('keeps its gutter and look', async ({ page }) => {
    await openBuilder(page);
    await page
      .getByRole('button', { name: en.builder.customSections.addCustomSectionButton })
      .click();
    const dialog = page.getByRole('dialog', { name: en.builder.customSections.dialogTitle });
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box?.x).toBeGreaterThanOrEqual(16);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(375 - 16);
    await expect(page).toHaveScreenshot('add-section-dialog-375.png', { maxDiffPixels: 10 });
  });
});

test.describe('dialog contract: a forced choice', () => {
  test.beforeEach(async ({ page }) => {
    // A browser draft that differs from the server copy opens the recovery dialog.
    await page.addInitScript(
      (draft) => {
        localStorage.setItem('resume_builder_draft:res-1', draft);
      },
      JSON.stringify({
        resumeId: 'res-1',
        updatedAt: Date.now(),
        data: { ...RESUME, personalInfo: { name: 'Draft Ada' } },
      })
    );
    await stubApi(page);
    await page.goto('/builder?id=res-1');
  });

  test('ignores Escape and outside clicks; only a choice closes it', async ({ page }) => {
    const dialog = page.getByRole('dialog', { name: en.builder.draftRecovery.title });
    await expect(dialog).toBeVisible();

    // Repeated presses too: Chrome may let a second Escape through a prevented cancel.
    for (let i = 0; i < 3; i += 1) await page.keyboard.press('Escape');
    await page.mouse.click(4, 4);
    await expect(dialog).toBeVisible();

    await dialog.getByRole('button', { name: en.builder.draftRecovery.useServer }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByLabel(en.resume.personalInfo.name)).toHaveValue('Ada Lovelace');
  });
});

test.describe('dialog contract: focus a close handler sends to the page', () => {
  test('the link dialog hands focus back to the editor', async ({ page }) => {
    await stubApi(page, {
      ...RESUME,
      workExperience: [
        { id: 1, title: 'Engineer', company: 'Acme', years: '2020', description: ['Built things'] },
      ],
    });
    await page.goto('/builder?id=res-1');
    const editor = page.locator('[contenteditable="true"]', { hasText: 'Built things' });
    await editor.click();
    await page.getByRole('button', { name: 'Link', exact: true }).click();

    const dialog = page.getByRole('dialog', { name: 'Add link' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Display text').fill('docs');
    await dialog.getByLabel('URL').fill('example.com');
    await dialog.getByRole('button', { name: 'Add link' }).click();

    await expect(dialog).toBeHidden();
    // The handler focuses the editor as the dialog closes. A modal makes the page
    // inert, so that only works once the dialog is really closed.
    await expect(editor).toBeFocused();
    await expect(editor.getByRole('link', { name: 'docs' })).toHaveAttribute(
      'href',
      'https://example.com'
    );
  });
});
