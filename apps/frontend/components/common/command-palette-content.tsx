'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Briefcase,
  FileText,
  Gear,
  ListNumbers,
  Target,
  SquaresFour,
  House,
} from '@phosphor-icons/react';
import { CommandPalette, type PaletteGroup } from '@/components/ui/command-palette';
import { fetchResumeList, type ResumeListItem } from '@/lib/api/resume';
import { APPLICATION_STATUS_ORDER, listApplications, type Application } from '@/lib/api/tracker';
import { useTranslations } from '@/lib/i18n';

interface CommandPaletteContentProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** The app's palette: jump to a page, or open a resume. Loaded on first Cmd+K. */
export function CommandPaletteContent({ open, onOpenChange }: CommandPaletteContentProps) {
  const { t } = useTranslations();
  const router = useRouter();
  const [resumes, setResumes] = useState<ResumeListItem[] | null>(null);
  const [applications, setApplications] = useState<Application[] | null>(null);

  // Read the list each time the palette opens, so a new or renamed resume shows.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetchResumeList(true)
      .then((list) => {
        if (!cancelled) setResumes(list);
      })
      .catch((error: unknown) => {
        console.warn('Command palette: could not load resumes.', error);
      });
    listApplications()
      .then(({ columns }) => {
        if (!cancelled) setApplications(APPLICATION_STATUS_ORDER.flatMap((s) => columns[s] ?? []));
      })
      .catch((error: unknown) => {
        console.warn('Command palette: could not load applications.', error);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const groups = useMemo<PaletteGroup[]>(() => {
    const icon = 'size-4';
    return [
      {
        label: t('commandPalette.goTo'),
        commands: [
          {
            value: '/dashboard',
            label: t('nav.dashboard'),
            icon: <House aria-hidden="true" className={icon} />,
          },
          {
            value: '/tailor',
            label: t('nav.tailor'),
            icon: <Target aria-hidden="true" className={icon} />,
          },
          {
            value: '/tracker',
            label: t('nav.applicationTracker'),
            icon: <SquaresFour aria-hidden="true" className={icon} />,
          },
          {
            value: '/queue',
            label: t('nav.queue'),
            icon: <ListNumbers aria-hidden="true" className={icon} />,
          },
          {
            value: '/settings',
            label: t('nav.settings'),
            icon: <Gear aria-hidden="true" className={icon} />,
          },
        ],
      },
      {
        label: t('commandPalette.resumes'),
        commands: (resumes ?? []).map((resume) => ({
          value: `/resumes/${resume.resume_id}`,
          label: resume.title || resume.filename || t('commandPalette.untitled'),
          keywords: resume.filename ? [resume.filename] : undefined,
          hint: resume.is_master ? t('commandPalette.master') : undefined,
          icon: <FileText aria-hidden="true" className={icon} />,
        })),
      },
      {
        // Opens the card on the tracker (OpenCardFromUrl reads ?open=).
        label: t('commandPalette.applications'),
        commands: (applications ?? []).map((application) => {
          const company = application.company?.trim() || t('tracker.card.companyUnknown');
          const role = application.role?.trim();
          return {
            value: `/tracker?open=${application.application_id}`,
            label: role ? `${company} · ${role}` : company,
            hint: t(`tracker.columns.${application.status}`),
            icon: <Briefcase aria-hidden="true" className={icon} />,
          };
        }),
      },
    ];
  }, [resumes, applications, t]);

  return (
    <CommandPalette
      open={open}
      onOpenChange={onOpenChange}
      title={t('commandPalette.title')}
      placeholder={t('commandPalette.placeholder')}
      emptyText={t('commandPalette.empty')}
      groups={groups}
      onRun={(href) => router.push(href)}
      footer={
        <p className="border-t border-ink bg-paper px-4 py-2 font-mono text-xs text-ink-soft">
          {t('commandPalette.footer')}
        </p>
      }
    />
  );
}
