import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { startMsw } from './support/msw';
import { deleteResume } from '@/lib/api/resume';

/**
 * Deleting a resume clears what this browser keeps for it: the practice notes
 * are the user's own text, so they go with the resume.
 */
describe('deleteResume', () => {
  startMsw(http.delete('*/resumes/:id', () => HttpResponse.json({ ok: true })));

  it("clears the resume's interview practice from this browser, and no other's", async () => {
    localStorage.setItem('resume_interview_practice:r1', '{"practised":[],"notes":{"k":"Mine"}}');
    localStorage.setItem('resume_interview_practice:r2', '{"practised":[],"notes":{}}');

    await deleteResume('r1');

    expect(localStorage.getItem('resume_interview_practice:r1')).toBeNull();
    expect(localStorage.getItem('resume_interview_practice:r2')).not.toBeNull();
    localStorage.clear();
  });
});
