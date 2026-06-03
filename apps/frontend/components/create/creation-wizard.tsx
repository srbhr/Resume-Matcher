'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from '@/lib/i18n';
import { draftSection, createResumeFromWizard, type SectionKind } from '@/lib/api/create';
import {
  emptyWizardData,
  appendDraft,
  assembleResume,
  canFinish,
  type ContactFields,
  type WizardData,
} from '@/components/create/wizard-script';
import { ChatMessage } from '@/components/create/chat-message';
import { ChatInput } from '@/components/create/chat-input';
import { SectionPicker } from '@/components/create/section-picker';
import { ContactFieldsForm } from '@/components/create/contact-fields';
import { WizardPreview } from '@/components/create/wizard-preview';
import { Button } from '@/components/ui/button';

const DRAFT_KEY = 'resume_create_draft';
type Phase = 'name' | 'role' | 'picker' | 'asking' | 'contact' | 'summary' | 'saving';
type Pickable = Exclude<SectionKind, 'summary'>;
interface Turn {
  from: 'ai' | 'user';
  text: string;
}

export function CreationWizard() {
  const { t } = useTranslations();
  const router = useRouter();
  const [data, setData] = useState<WizardData>(emptyWizardData);
  const [phase, setPhase] = useState<Phase>('name');
  const [section, setSection] = useState<Pickable | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  // Greeting + localStorage restore on mount (resume straight to the picker if
  // a prior draft already has a name).
  useEffect(() => {
    const saved = localStorage.getItem(DRAFT_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as WizardData;
        if (parsed && parsed.name) {
          setData(parsed);
          setPhase('picker');
          setTurns([{ from: 'ai', text: t('create.pickSection') }]);
          return;
        }
      } catch {
        localStorage.removeItem(DRAFT_KEY);
      }
    }
    setTurns([{ from: 'ai', text: t('create.greeting') }]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave for refresh resilience (skip the empty initial state).
  useEffect(() => {
    if (
      data.name ||
      data.workExperience.length ||
      data.education.length ||
      data.personalProjects.length ||
      data.technicalSkills.length
    ) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
    }
  }, [data]);

  const resume = useMemo(() => assembleResume(data), [data]);
  const say = (from: 'ai' | 'user', text: string) => setTurns((ts) => [...ts, { from, text }]);

  const handleUserText = useCallback(
    async (text: string) => {
      say('user', text);
      if (phase === 'name') {
        setData((d) => ({ ...d, name: text }));
        setPhase('role');
        say('ai', t('create.askRole', { name: text }));
        return;
      }
      if (phase === 'role') {
        setData((d) => ({ ...d, role: text }));
        setPhase('picker');
        say('ai', t('create.pickSection'));
        return;
      }
      if (phase === 'asking' && section) {
        setBusy(true);
        try {
          const fragment = await draftSection({
            section,
            answers: text,
            name: data.name,
            role: data.role,
          });
          setData((d) => appendDraft(d, section, fragment));
          say('ai', t('create.pickSection'));
        } catch {
          say('ai', t('create.errors.draft'));
        } finally {
          setBusy(false);
          setPhase('picker');
        }
      }
    },
    [phase, section, data.name, data.role, t]
  );

  const pickSection = (s: Pickable) => {
    setSection(s);
    setPhase('asking');
    say('ai', t(`create.ask.${s}`));
  };

  const generateSummary = async (d: WizardData) => {
    setBusy(true);
    try {
      const fragment = await draftSection({
        section: 'summary',
        answers: '',
        name: d.name,
        resume_context: assembleResume(d),
      });
      setData((prev) => appendDraft(prev, 'summary', fragment));
    } catch {
      // Summary is optional; proceed without it.
    } finally {
      setBusy(false);
    }
  };

  const submitContact = (c: ContactFields) => {
    const next = { ...data, contact: c };
    setData(next);
    setPhase('summary');
    void generateSummary(next);
  };

  const save = async () => {
    setPhase('saving');
    try {
      const res = await createResumeFromWizard(
        assembleResume(data),
        data.name ? `${data.name}'s Resume` : undefined
      );
      localStorage.removeItem(DRAFT_KEY);
      router.push(`/builder?id=${res.resume_id}`);
    } catch {
      say('ai', t('create.errors.save'));
      setPhase('summary');
    }
  };

  const showInput = phase === 'name' || phase === 'role' || phase === 'asking';

  return (
    <div className="flex h-[100dvh] flex-col lg:flex-row">
      {/* Chat column */}
      <div className="flex min-h-0 flex-1 flex-col border-r border-black">
        <div className="flex items-center justify-between border-b border-black p-4">
          <h1 className="font-serif text-2xl uppercase">{t('create.title')}</h1>
          <Button
            variant="outline"
            size="sm"
            className="lg:hidden"
            onClick={() => setShowPreview((s) => !s)}
          >
            {showPreview ? t('create.hidePreview') : t('create.showPreview')}
          </Button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4">
          {turns.map((turn, i) => (
            <ChatMessage key={i} from={turn.from}>
              {turn.text}
            </ChatMessage>
          ))}
          {busy && <ChatMessage from="ai">{t('create.drafting')}</ChatMessage>}
          {phase === 'picker' && (
            <SectionPicker
              onPick={pickSection}
              onFinish={() => setPhase('contact')}
              canFinish={canFinish(data)}
            />
          )}
          {phase === 'contact' && (
            <ContactFieldsForm initial={data.contact} onSubmit={submitContact} />
          )}
          {phase === 'summary' && (
            <div className="flex flex-col gap-2">
              <ChatMessage from="ai">{data.summary || t('create.summaryIntro')}</ChatMessage>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void generateSummary(data)}
                >
                  {t('create.regenerateSummary')}
                </Button>
                <Button variant="success" disabled={busy} onClick={() => void save()}>
                  {t('create.save')}
                </Button>
              </div>
            </div>
          )}
          {phase === 'saving' && <ChatMessage from="ai">{t('create.saving')}</ChatMessage>}
        </div>
        {showInput && (
          <ChatInput
            onSend={handleUserText}
            disabled={busy}
            placeholder={t('create.tweakPrompt')}
          />
        )}
      </div>
      {/* Preview column */}
      <div className={`${showPreview ? 'block' : 'hidden'} min-h-0 flex-1 bg-canvas p-4 lg:block`}>
        <WizardPreview resumeData={resume} />
      </div>
    </div>
  );
}
