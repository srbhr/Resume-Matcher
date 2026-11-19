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
async function stubApi(page: Page) {
  await page.route('**/api/v1/**', (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api\/v1/, '');
    if (path in STUBS) return route.fulfill({ json: STUBS[path] });
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

  test('keeps the Swiss look', async ({ page }) => {
    await page
      .getByRole('button', { name: en.builder.customSections.addCustomSectionButton })
      .click();
    const dialog = page.getByRole('dialog', { name: en.builder.customSections.dialogTitle });
    await expect(dialog).toBeVisible();
    // The first approved run records the baseline; the run after the swap compares.
    await expect(page).toHaveScreenshot('add-section-dialog.png', { maxDiffPixelRatio: 0.01 });
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

    await page.keyboard.press('Escape');
    await page.mouse.click(4, 4);
    await expect(dialog).toBeVisible();

    await dialog.getByRole('button', { name: en.builder.draftRecovery.useServer }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByLabel(en.resume.personalInfo.name)).toHaveValue('Ada Lovelace');
  });
});
