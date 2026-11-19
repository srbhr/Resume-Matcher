import { http, HttpResponse } from 'msw';
import { beforeAll, describe, expect, it } from 'vitest';
import { startMsw } from './support/msw';
import { installNodeFormData, nodeFile } from './support/node-form-data';
import { checkResumeParse } from '@/lib/api/ats';
import {
  analyzeResume,
  applyEnhancements,
  applyRegeneratedItems,
  generateEnhancements,
  regenerateItems,
} from '@/lib/api/enrichment';
import {
  clearAllApiKeys,
  deleteApiKey,
  fetchApiKeyStatus,
  fetchFeatureConfig,
  fetchFeaturePrompts,
  fetchLanguageConfig,
  fetchLlmConfig,
  fetchPromptConfig,
  fetchSystemStatus,
  resetDatabase,
  testLlmConnection,
  updateApiKeys,
  updateFeatureConfig,
  updateFeaturePrompts,
  updateLanguageConfig,
  updateLlmConfig,
  updatePromptConfig,
} from '@/lib/api/config';
import {
  addJobToQueue,
  clearQueueItems,
  deleteQueueItem,
  deleteResume,
  deleteResumePhoto,
  downloadCoverLetterPdf,
  downloadResumePdf,
  duplicateResume,
  fetchJobDescription,
  fetchJobQueue,
  fetchLastAtsScore,
  fetchResume,
  fetchResumeList,
  fetchResumePhoto,
  generateCoverLetter,
  generateInterviewPrep,
  generateOutreachMessage,
  parseJobMetadata,
  recalculateAtsScore,
  renameResume,
  retryProcessing,
  setDefaultMasterResume,
  updateCoverLetter,
  updateOutreachMessage,
  updateResume,
  updateResumeTemplateSettings,
  uploadJobDescriptions,
  uploadResumePhoto,
} from '@/lib/api/resume';
import {
  createInitialResumeWizardState,
  finalizeResumeWizard,
  postResumeWizardTurn,
} from '@/lib/api/resume-wizard';
import { checkWriting, improveWriting } from '@/lib/api/writing';
import { DEFAULT_TEMPLATE_SETTINGS } from '@/lib/types/template-settings';

/**
 * Every lib/api function that turns a failed response into an error: the request
 * it sends, and that a failure rejects. Pins what the shared error path must keep
 * (see the frontend refactor plan, Phase 2).
 */

type Row = {
  name: string;
  call: () => Promise<unknown>;
  method: string;
  /** Path (and query) after /api/v1. */
  path: string;
  /** Asserted with objectContaining when given. */
  body?: Record<string, unknown>;
  /** The path is only a prefix (PDF URLs carry print settings). */
  prefix?: boolean;
};

const resume = { personalInfo: { name: 'A' } } as never;

const ROWS: Row[] = [
  // ats
  {
    name: 'checkResumeParse',
    call: () => checkResumeParse('r1', DEFAULT_TEMPLATE_SETTINGS),
    method: 'POST',
    path: '/resumes/r1/parse-check',
  },
  // config
  {
    name: 'fetchLlmConfig',
    call: () => fetchLlmConfig(),
    method: 'GET',
    path: '/config/llm-api-key',
  },
  {
    name: 'updateLlmConfig',
    call: () => updateLlmConfig({ provider: 'openai', model: 'gpt-4o' }),
    method: 'PUT',
    path: '/config/llm-api-key',
    body: { provider: 'openai', model: 'gpt-4o' },
  },
  {
    name: 'testLlmConnection',
    call: () => testLlmConnection(),
    method: 'POST',
    path: '/config/llm-test',
  },
  { name: 'fetchSystemStatus', call: () => fetchSystemStatus(), method: 'GET', path: '/status' },
  {
    name: 'fetchFeatureConfig',
    call: () => fetchFeatureConfig(),
    method: 'GET',
    path: '/config/features',
  },
  {
    name: 'updateFeatureConfig',
    call: () => updateFeatureConfig({ enable_cover_letter: true }),
    method: 'PUT',
    path: '/config/features',
    body: { enable_cover_letter: true },
  },
  {
    name: 'fetchLanguageConfig',
    call: () => fetchLanguageConfig(),
    method: 'GET',
    path: '/config/language',
  },
  {
    name: 'updateLanguageConfig',
    call: () => updateLanguageConfig({ content_language: 'es' }),
    method: 'PUT',
    path: '/config/language',
    body: { content_language: 'es' },
  },
  {
    name: 'fetchPromptConfig',
    call: () => fetchPromptConfig(),
    method: 'GET',
    path: '/config/prompts',
  },
  {
    name: 'updatePromptConfig',
    call: () => updatePromptConfig({ default_prompt_id: 'nudge' }),
    method: 'PUT',
    path: '/config/prompts',
    body: { default_prompt_id: 'nudge' },
  },
  {
    name: 'fetchFeaturePrompts',
    call: () => fetchFeaturePrompts(),
    method: 'GET',
    path: '/config/feature-prompts',
  },
  {
    name: 'updateFeaturePrompts',
    call: () => updateFeaturePrompts({ cover_letter_prompt: 'x' }),
    method: 'PUT',
    path: '/config/feature-prompts',
    body: { cover_letter_prompt: 'x' },
  },
  {
    name: 'fetchApiKeyStatus',
    call: () => fetchApiKeyStatus(),
    method: 'GET',
    path: '/config/api-keys',
  },
  {
    name: 'updateApiKeys',
    call: () => updateApiKeys({ openai: 'sk-x' }),
    method: 'POST',
    path: '/config/api-keys',
    body: { openai: 'sk-x' },
  },
  {
    name: 'deleteApiKey',
    call: () => deleteApiKey('openai'),
    method: 'DELETE',
    path: '/config/api-keys/openai',
  },
  {
    name: 'clearAllApiKeys',
    call: () => clearAllApiKeys(),
    method: 'DELETE',
    path: '/config/api-keys?confirm=CLEAR_ALL_KEYS',
  },
  { name: 'resetDatabase', call: () => resetDatabase(), method: 'POST', path: '/config/reset' },
  // enrichment
  {
    name: 'analyzeResume',
    call: () => analyzeResume('r1'),
    method: 'POST',
    path: '/enrichment/analyze/r1',
  },
  {
    name: 'generateEnhancements',
    call: () => generateEnhancements('r1', []),
    method: 'POST',
    path: '/enrichment/enhance',
    body: { resume_id: 'r1' },
  },
  {
    name: 'applyEnhancements',
    call: () => applyEnhancements('r1', []),
    method: 'POST',
    path: '/enrichment/apply/r1',
  },
  {
    name: 'regenerateItems',
    call: () => regenerateItems({ resume_id: 'r1', items: [], instruction: 'x' } as never),
    method: 'POST',
    path: '/enrichment/regenerate',
    body: { resume_id: 'r1' },
  },
  {
    name: 'applyRegeneratedItems',
    call: () => applyRegeneratedItems('r1', []),
    method: 'POST',
    path: '/enrichment/apply-regenerated/r1',
  },
  // resume wizard
  {
    name: 'postResumeWizardTurn',
    call: () => postResumeWizardTurn({ state: createInitialResumeWizardState() } as never),
    method: 'POST',
    path: '/resume-wizard/turn',
  },
  {
    name: 'finalizeResumeWizard',
    call: () => finalizeResumeWizard(createInitialResumeWizardState()),
    method: 'POST',
    path: '/resume-wizard/finalize',
  },
  // resumes and jobs
  {
    name: 'uploadJobDescriptions',
    call: () => uploadJobDescriptions(['JD'], 'r1'),
    method: 'POST',
    path: '/jobs/upload',
    body: { job_descriptions: ['JD'], resume_id: 'r1' },
  },
  {
    name: 'fetchResume',
    call: () => fetchResume('r 1'),
    method: 'GET',
    path: '/resumes?resume_id=r%201',
  },
  {
    name: 'fetchResumeList',
    call: () => fetchResumeList(true),
    method: 'GET',
    path: '/resumes/list?include_master=true',
  },
  {
    name: 'updateResume',
    call: () => updateResume('r1', resume),
    method: 'PATCH',
    path: '/resumes/r1',
    body: { personalInfo: { name: 'A' } },
  },
  {
    name: 'downloadResumePdf',
    call: () => downloadResumePdf('r1'),
    method: 'GET',
    path: '/resumes/r1/pdf',
    prefix: true,
  },
  { name: 'deleteResume', call: () => deleteResume('r1'), method: 'DELETE', path: '/resumes/r1' },
  {
    name: 'fetchResumePhoto',
    call: () => fetchResumePhoto('r1'),
    method: 'GET',
    path: '/resumes/r1/photo',
  },
  {
    name: 'uploadResumePhoto',
    call: () => uploadResumePhoto('r1', nodeFile('jpeg', 'me.jpg', 'image/jpeg')),
    method: 'PUT',
    path: '/resumes/r1/photo',
  },
  {
    name: 'deleteResumePhoto',
    call: () => deleteResumePhoto('r1'),
    method: 'DELETE',
    path: '/resumes/r1/photo',
  },
  {
    name: 'updateCoverLetter',
    call: () => updateCoverLetter('r1', 'Dear'),
    method: 'PATCH',
    path: '/resumes/r1/cover-letter',
    body: { content: 'Dear' },
  },
  {
    name: 'updateOutreachMessage',
    call: () => updateOutreachMessage('r1', 'Hi'),
    method: 'PATCH',
    path: '/resumes/r1/outreach-message',
    body: { content: 'Hi' },
  },
  {
    name: 'renameResume',
    call: () => renameResume('r1', 'New'),
    method: 'PATCH',
    path: '/resumes/r1/title',
    body: { title: 'New' },
  },
  {
    name: 'updateResumeTemplateSettings',
    call: () =>
      updateResumeTemplateSettings('r1', DEFAULT_TEMPLATE_SETTINGS, { session: 's', revision: 2 }),
    method: 'PATCH',
    path: '/resumes/r1/template-settings',
    body: { session: 's', revision: 2 },
  },
  {
    name: 'setDefaultMasterResume',
    call: () => setDefaultMasterResume('r1'),
    method: 'POST',
    path: '/resumes/r1/default',
  },
  {
    name: 'duplicateResume',
    call: () => duplicateResume('r1'),
    method: 'POST',
    path: '/resumes/r1/duplicate',
  },
  {
    name: 'downloadCoverLetterPdf',
    call: () => downloadCoverLetterPdf('r1'),
    method: 'GET',
    path: '/resumes/r1/cover-letter/pdf',
    prefix: true,
  },
  {
    name: 'generateCoverLetter',
    call: () => generateCoverLetter('r1'),
    method: 'POST',
    path: '/resumes/r1/generate-cover-letter',
  },
  {
    name: 'generateOutreachMessage',
    call: () => generateOutreachMessage('r1'),
    method: 'POST',
    path: '/resumes/r1/generate-outreach',
  },
  {
    name: 'generateInterviewPrep',
    call: () => generateInterviewPrep('r1'),
    method: 'POST',
    path: '/resumes/r1/generate-interview-prep',
  },
  {
    name: 'retryProcessing',
    call: () => retryProcessing('r1'),
    method: 'POST',
    path: '/resumes/r1/retry-processing',
  },
  {
    name: 'fetchLastAtsScore',
    call: () => fetchLastAtsScore('r1'),
    method: 'GET',
    path: '/resumes/r1/ats-score',
  },
  {
    name: 'recalculateAtsScore',
    call: () => recalculateAtsScore('r1'),
    method: 'POST',
    path: '/resumes/r1/ats-score',
  },
  {
    name: 'fetchJobDescription',
    call: () => fetchJobDescription('r1'),
    method: 'GET',
    path: '/resumes/r1/job-description',
  },
  {
    name: 'addJobToQueue',
    call: () => addJobToQueue('r1', 'JD', 0),
    method: 'POST',
    path: '/jobs/queue',
    body: { resume_id: 'r1', job_description: 'JD', rate_limit_seconds: 0 },
  },
  {
    name: 'fetchJobQueue',
    call: () => fetchJobQueue('r1'),
    method: 'GET',
    path: '/jobs/queue?resume_id=r1',
  },
  {
    name: 'deleteQueueItem',
    call: () => deleteQueueItem('q1'),
    method: 'DELETE',
    path: '/jobs/queue/q1',
  },
  {
    name: 'clearQueueItems',
    call: () => clearQueueItems('r1', 'completed'),
    method: 'DELETE',
    path: '/jobs/queue?resume_id=r1&status=completed',
  },
  {
    name: 'parseJobMetadata',
    call: () => parseJobMetadata('JD'),
    method: 'POST',
    path: '/jobs/parse-metadata',
    body: { job_description: 'JD' },
  },
  // writing
  {
    name: 'checkWriting',
    call: () => checkWriting(resume),
    method: 'POST',
    path: '/writing/check',
    body: { resume_data: { personalInfo: { name: 'A' } } },
  },
  {
    name: 'improveWriting',
    call: () => improveWriting(resume),
    method: 'POST',
    path: '/writing/improve',
    body: { resume_data: { personalInfo: { name: 'A' } } },
  },
];

type Seen = { method: string; path: string; body: unknown };

const server = startMsw();

function answer(status: number, seen: Seen[]) {
  server.use(
    http.all('*', async ({ request }) => {
      const url = new URL(request.url);
      const text = await request.text();
      let body: unknown = text;
      try {
        body = text ? JSON.parse(text) : undefined;
      } catch {
        // not JSON
      }
      seen.push({
        method: request.method,
        path: url.pathname.replace(/^\/api\/v1/, '') + url.search,
        body,
      });
      return HttpResponse.text('upstream unavailable', { status });
    })
  );
}

describe('lib/api request contract', () => {
  // uploadResumePhoto sends multipart form data (see support/node-form-data).
  beforeAll(installNodeFormData);

  it('covers every function with an error path', () => {
    expect(ROWS).toHaveLength(55);
    expect(new Set(ROWS.map((r) => r.name)).size).toBe(ROWS.length);
  });

  it.each(ROWS)('$name sends $method $path and rejects a failed response', async (row) => {
    const seen: Seen[] = [];
    answer(500, seen);

    const error = await row.call().then(
      () => null,
      (e: unknown) => e
    );

    expect(error).toBeInstanceOf(Error);
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe(row.method);
    if (row.prefix) expect(seen[0].path.startsWith(row.path)).toBe(true);
    else expect(seen[0].path).toBe(row.path);
    if (row.body) expect(seen[0].body).toEqual(expect.objectContaining(row.body));
  });
});
