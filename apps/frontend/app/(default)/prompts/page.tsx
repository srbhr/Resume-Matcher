'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Copy, Plus, Save, Star, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useTranslations } from '@/lib/i18n';
import {
  createPromptTemplate,
  deletePromptTemplate,
  fetchPromptConfig,
  fetchPromptTemplates,
  updatePromptConfig,
  updatePromptTemplate,
  type PromptTemplate,
} from '@/lib/api/config';

const BUILTIN_IDS = new Set(['nudge', 'keywords', 'full']);

type PromptDraft = {
  label: string;
  description: string;
  prompt: string;
};

export default function PromptsPage() {
  const { t } = useTranslations();
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [drafts, setDrafts] = useState<Record<string, PromptDraft>>({});
  const [defaultPromptId, setDefaultPromptId] = useState<string>('keywords');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [savingIds, setSavingIds] = useState<Record<string, boolean>>({});
  const [deleteTarget, setDeleteTarget] = useState<PromptTemplate | null>(null);
  const [createForm, setCreateForm] = useState<PromptDraft>({
    label: '',
    description: '',
    prompt: '',
  });

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [templatesData, promptConfig] = await Promise.all([
        fetchPromptTemplates(),
        fetchPromptConfig(),
      ]);
      setTemplates(templatesData);
      setDefaultPromptId(promptConfig.default_prompt_id);
      const nextDrafts: Record<string, PromptDraft> = {};
      templatesData.forEach((template) => {
        nextDrafts[template.id] = {
          label: template.label,
          description: template.description,
          prompt: template.prompt,
        };
      });
      setDrafts(nextDrafts);
    } catch (err) {
      setError((err as Error).message || t('prompts.errors.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDraftChange = (id: string, update: Partial<PromptDraft>) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...update },
    }));
  };

  const handleSave = async (id: string) => {
    const draft = drafts[id];
    if (!draft) return;

    setSavingIds((prev) => ({ ...prev, [id]: true }));
    setError(null);

    try {
      const updated = await updatePromptTemplate(id, {
        label: draft.label,
        description: draft.description,
        prompt: draft.prompt,
      });
      setTemplates((prev) => prev.map((item) => (item.id === id ? updated : item)));
      setDrafts((prev) => ({
        ...prev,
        [id]: {
          label: updated.label,
          description: updated.description,
          prompt: updated.prompt,
        },
      }));
    } catch (err) {
      setError((err as Error).message || t('prompts.errors.saveFailed'));
    } finally {
      setSavingIds((prev) => ({ ...prev, [id]: false }));
    }
  };

  const handleCreate = async (setAsDefault: boolean) => {
    if (!createForm.label.trim() || !createForm.description.trim() || !createForm.prompt.trim()) {
      setError(t('prompts.errors.requiredFields'));
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const created = await createPromptTemplate({
        label: createForm.label.trim(),
        description: createForm.description.trim(),
        prompt: createForm.prompt.trim(),
      });
      setTemplates((prev) => [...prev, created]);
      setDrafts((prev) => ({
        ...prev,
        [created.id]: {
          label: created.label,
          description: created.description,
          prompt: created.prompt,
        },
      }));
      setCreateForm({ label: '', description: '', prompt: '' });

      if (setAsDefault) {
        const updatedConfig = await updatePromptConfig({ default_prompt_id: created.id });
        setDefaultPromptId(updatedConfig.default_prompt_id);
      }
    } catch (err) {
      setError((err as Error).message || t('prompts.errors.createFailed'));
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    setIsCreating(true);
    setError(null);

    try {
      await deletePromptTemplate(deleteTarget.id);
      setTemplates((prev) => prev.filter((item) => item.id !== deleteTarget.id));
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[deleteTarget.id];
        return next;
      });
      const updatedConfig = await fetchPromptConfig();
      setDefaultPromptId(updatedConfig.default_prompt_id);
    } catch (err) {
      setError((err as Error).message || t('prompts.errors.deleteFailed'));
    } finally {
      setIsCreating(false);
      setDeleteTarget(null);
    }
  };

  const handleSetDefault = async (id: string) => {
    setIsCreating(true);
    setError(null);

    try {
      const updated = await updatePromptConfig({ default_prompt_id: id });
      setDefaultPromptId(updated.default_prompt_id);
    } catch (err) {
      setError((err as Error).message || t('prompts.errors.defaultFailed'));
    } finally {
      setIsCreating(false);
    }
  };

  const sortedTemplates = useMemo(() => {
    return [...templates].sort((a, b) => {
      if (a.is_builtin && !b.is_builtin) return -1;
      if (!a.is_builtin && b.is_builtin) return 1;
      return a.label.localeCompare(b.label);
    });
  }, [templates]);

  return (
    <div className="min-h-screen bg-[#F0F0E8] py-12 px-4 md:px-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link href="/dashboard" className="inline-flex items-center gap-2 text-sm font-mono">
              <ArrowLeft className="w-4 h-4" /> {t('nav.backToDashboard')}
            </Link>
            <h1 className="mt-4 text-4xl md:text-5xl font-serif uppercase tracking-tight">
              {t('prompts.title')}
            </h1>
            <p className="mt-2 text-sm font-mono text-blue-700 uppercase tracking-wide">
              {t('prompts.subtitle')}
            </p>
          </div>
        </div>

        {error && (
          <div className="border-2 border-red-600 bg-red-50 text-red-700 p-4 font-mono text-sm">
            {error}
          </div>
        )}

        <section className="border-2 border-black bg-white p-6 shadow-[6px_6px_0px_0px_#000000]">
          <div className="flex items-center justify-between gap-4 border-b border-black/10 pb-3">
            <div>
              <h2 className="font-mono text-sm font-bold uppercase tracking-wider">
                {t('prompts.create.title')}
              </h2>
              <p className="text-xs text-gray-600 mt-1">{t('prompts.create.description')}</p>
            </div>
            <Plus className="w-5 h-5" />
          </div>

          <div className="grid grid-cols-1 gap-4 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="font-mono text-xs uppercase tracking-wider text-gray-600">
                  {t('prompts.fields.label')}
                </label>
                <Input
                  value={createForm.label}
                  onChange={(e) => setCreateForm((prev) => ({ ...prev, label: e.target.value }))}
                  placeholder={t('prompts.placeholders.label')}
                  className="rounded-none border-black"
                />
              </div>
              <div className="space-y-2">
                <label className="font-mono text-xs uppercase tracking-wider text-gray-600">
                  {t('prompts.fields.description')}
                </label>
                <Input
                  value={createForm.description}
                  onChange={(e) =>
                    setCreateForm((prev) => ({ ...prev, description: e.target.value }))
                  }
                  placeholder={t('prompts.placeholders.description')}
                  className="rounded-none border-black"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="font-mono text-xs uppercase tracking-wider text-gray-600">
                {t('prompts.fields.prompt')}
              </label>
              <Textarea
                value={createForm.prompt}
                onChange={(e) => setCreateForm((prev) => ({ ...prev, prompt: e.target.value }))}
                placeholder={t('prompts.placeholders.prompt')}
                className="min-h-[220px] rounded-none border-black font-mono text-xs"
              />
              <p className="text-xs text-gray-500">{t('prompts.placeholders.helper')}</p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => handleCreate(false)}
                disabled={isCreating}
                className="gap-2"
              >
                <Save className="w-4 h-4" /> {t('prompts.create.action')}
              </Button>
              <Button
                variant="success"
                onClick={() => handleCreate(true)}
                disabled={isCreating}
                className="gap-2"
              >
                <Star className="w-4 h-4" /> {t('prompts.create.actionDefault')}
              </Button>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-mono text-sm font-bold uppercase tracking-wider">
              {t('prompts.list.title')}
            </h2>
            <span className="text-xs font-mono text-gray-600">
              {t('prompts.list.count', { count: sortedTemplates.length })}
            </span>
          </div>

          {isLoading ? (
            <div className="border-2 border-black bg-white p-6">{t('common.loading')}</div>
          ) : (
            <div className="space-y-6">
              {sortedTemplates.map((template) => {
                const draft = drafts[template.id];
                const isBuiltin = template.is_builtin || BUILTIN_IDS.has(template.id);
                const isDefault = defaultPromptId === template.id;
                return (
                  <div
                    key={template.id}
                    className="border-2 border-black bg-white p-6 shadow-[4px_4px_0px_0px_#000000]"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <h3 className="font-mono text-base font-bold uppercase tracking-wider">
                          {draft?.label || template.label}
                        </h3>
                        <p className="text-xs text-gray-600 mt-1">
                          {draft?.description || template.description}
                        </p>
                        <div className="flex flex-wrap gap-2 mt-3 text-xs font-mono">
                          <span className="border border-black px-2 py-0.5">
                            {isBuiltin ? t('prompts.badges.builtin') : t('prompts.badges.custom')}
                          </span>
                          {isDefault && (
                            <span className="border border-black bg-yellow-200 px-2 py-0.5">
                              {t('prompts.badges.default')}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {!isDefault && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() => handleSetDefault(template.id)}
                            disabled={isCreating}
                          >
                            <Star className="w-4 h-4" /> {t('prompts.actions.setDefault')}
                          </Button>
                        )}
                        {isBuiltin ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2"
                            onClick={() =>
                              setCreateForm({
                                label: `${t('prompts.actions.copyPrefix')} ${template.label}`,
                                description: template.description,
                                prompt: template.prompt,
                              })
                            }
                          >
                            <Copy className="w-4 h-4" /> {t('prompts.actions.duplicate')}
                          </Button>
                        ) : (
                          <Button
                            variant="destructive"
                            size="sm"
                            className="gap-2"
                            onClick={() => setDeleteTarget(template)}
                            disabled={isCreating}
                          >
                            <Trash2 className="w-4 h-4" /> {t('common.delete')}
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                      <div className="space-y-2">
                        <label className="font-mono text-xs uppercase tracking-wider text-gray-600">
                          {t('prompts.fields.label')}
                        </label>
                        <Input
                          value={draft?.label || ''}
                          onChange={(e) =>
                            handleDraftChange(template.id, { label: e.target.value })
                          }
                          disabled={isBuiltin}
                          className="rounded-none border-black"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="font-mono text-xs uppercase tracking-wider text-gray-600">
                          {t('prompts.fields.description')}
                        </label>
                        <Input
                          value={draft?.description || ''}
                          onChange={(e) =>
                            handleDraftChange(template.id, { description: e.target.value })
                          }
                          disabled={isBuiltin}
                          className="rounded-none border-black"
                        />
                      </div>
                    </div>

                    <div className="space-y-2 mt-4">
                      <label className="font-mono text-xs uppercase tracking-wider text-gray-600">
                        {t('prompts.fields.prompt')}
                      </label>
                      <Textarea
                        value={draft?.prompt || ''}
                        onChange={(e) => handleDraftChange(template.id, { prompt: e.target.value })}
                        disabled={isBuiltin}
                        className="min-h-[220px] rounded-none border-black font-mono text-xs"
                      />
                    </div>

                    {!isBuiltin && (
                      <div className="flex justify-end mt-4">
                        <Button
                          size="sm"
                          onClick={() => handleSave(template.id)}
                          disabled={!!savingIds[template.id]}
                          className="gap-2"
                        >
                          <Save className="w-4 h-4" />
                          {savingIds[template.id] ? t('common.saving') : t('common.save')}
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => (!open ? setDeleteTarget(null) : null)}
        title={t('prompts.delete.title')}
        description={t('prompts.delete.description')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        onConfirm={handleDelete}
        variant="danger"
      />
    </div>
  );
}
