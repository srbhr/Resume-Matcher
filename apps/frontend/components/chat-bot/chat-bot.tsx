'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  MessageCircle,
  X as XIcon,
  Plus,
  Send,
  History,
  ChevronLeft,
  HelpCircle,
  Wand2,
  Pencil,
  Check,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';

import {
  chatWithResume,
  chatWithDocument,
  createResumeFromJson,
  listResumeBackups,
  restoreResumeBackup,
  type ChatMessage,
  type ChatMode,
  type ChatProposal,
  type DocumentType,
  type EditProposal,
  type BackupRow,
} from '@/lib/api/chat';
import { uploadResumeJson } from '@/lib/api/resume';
import { DiffReviewFlow } from './diff-review-flow';

import styles from './chat-bot.module.css';

type TabId = 'resume' | 'cv' | 'coverLetter' | 'outreach' | 'job';
type View = 'menu' | 'chat' | 'history';
type InternalMode = 'discuss' | 'edit' | 'tailor';

function tabToDocumentType(tab: TabId): DocumentType {
  if (tab === 'cv') return 'cv';
  if (tab === 'coverLetter') return 'coverLetter';
  if (tab === 'outreach') return 'outreach';
  return 'resume';
}

const DOC_TYPE_LABELS: Record<DocumentType, string> = {
  resume: 'Resume',
  cv: 'CV',
  coverLetter: 'Cover Letter',
  outreach: 'Outreach Message',
};

interface UiMessage {
  role: 'user' | 'assistant';
  content: string;
  proposal?: ChatProposal | null;
  editProposal?: EditProposal | null;
  error?: boolean;
  proposalState?: 'pending' | 'applied' | 'dismissed';
  appliedResumeId?: string;
}

interface ChatBotProps {
  resumeId: string;
  activeTab?: TabId;
  onDocumentChanged?: () => void;
  /** @deprecated Use onDocumentChanged */
  onResumeChanged?: () => void;
}

const INTERNAL_MODE_LABELS: Record<InternalMode, string> = {
  discuss: 'Discuss',
  edit: 'Edit',
  tailor: 'Tailor',
};

function getModeHint(mode: InternalMode, docLabel: string): string {
  if (mode === 'discuss') return `Ask anything about this ${docLabel.toLowerCase()}.`;
  if (mode === 'edit')
    return `Describe what to change — the AI will propose edits for your approval.`;
  return 'Describe the target role or employer to draft a new resume for.';
}

export function ChatBot({
  resumeId,
  activeTab = 'resume',
  onDocumentChanged,
  onResumeChanged,
}: ChatBotProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>('menu');
  const [mode, setMode] = useState<InternalMode>('discuss');
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [input, setInput] = useState('');
  const [backups, setBackups] = useState<BackupRow[] | null>(null);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [backupsError, setBackupsError] = useState<string | null>(null);
  const [pendingBackupRestore, setPendingBackupRestore] = useState<string | null>(null);

  const documentType = tabToDocumentType(activeTab);
  const docLabel = DOC_TYPE_LABELS[documentType];

  const notifyChanged = useCallback(() => {
    onDocumentChanged?.();
    onResumeChanged?.();
  }, [onDocumentChanged, onResumeChanged]);

  const bodyRef = useRef<HTMLDivElement | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [messages, pending, view]);

  useEffect(() => {
    if (open && view === 'chat') {
      requestAnimationFrame(() => taRef.current?.focus());
    }
  }, [open, view, mode]);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = '36px';
    ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
  }, [input]);

  const startMode = (next: InternalMode) => {
    setMode(next);
    setMessages([]);
    setInput('');
    setView('chat');
  };

  const openHistory = useCallback(async () => {
    setView('history');
    setBackupsError(null);
    setBackupsLoading(true);
    try {
      const rows = await listResumeBackups(resumeId);
      setBackups(rows);
    } catch (e) {
      setBackupsError(e instanceof Error ? e.message : 'Failed to load history.');
      setBackups([]);
    } finally {
      setBackupsLoading(false);
    }
  }, [resumeId]);

  const sendMessage = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || pending) return;
      const next: UiMessage[] = [...messages, { role: 'user', content }];
      setMessages(next);
      setInput('');
      setPending(true);
      try {
        const payloadMessages: ChatMessage[] = next.map((m) => ({
          role: m.role,
          content: m.content,
        }));

        if (mode === 'tailor') {
          const res = await chatWithResume(resumeId, {
            messages: payloadMessages,
            mode: 'tailor' as ChatMode,
          });
          setMessages((m) => [
            ...m,
            {
              role: 'assistant',
              content: res.reply,
              proposal: res.proposal ?? null,
              proposalState: res.proposal ? 'pending' : undefined,
            },
          ]);
        } else {
          const res = await chatWithDocument(resumeId, {
            messages: payloadMessages,
            document_type: documentType,
            mode: mode as 'discuss' | 'edit',
          });
          setMessages((m) => [
            ...m,
            {
              role: 'assistant',
              content: res.reply,
              editProposal: res.proposal ?? null,
              proposalState: res.proposal ? 'pending' : undefined,
            },
          ]);
        }
      } catch {
        setMessages((m) => [
          ...m,
          {
            role: 'assistant',
            content: '> [ ERROR ] The assistant is unavailable. Try again.',
            error: true,
          },
        ]);
      } finally {
        setPending(false);
      }
    },
    [messages, pending, mode, resumeId, documentType]
  );

  const handleSubmit = (e?: FormEvent) => {
    e?.preventDefault();
    void sendMessage(input);
  };

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
      return;
    }
    if (e.key === 'Enter') e.stopPropagation();
  };

  const setMessageState = (index: number, patch: Partial<UiMessage>) => {
    setMessages((curr) => curr.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  };

  const applyProposal = async (index: number, proposal: ChatProposal) => {
    try {
      if (proposal.kind === 'edit') {
        await uploadResumeJson(resumeId, proposal.resume_json as never);
        setMessageState(index, { proposalState: 'applied' });
        notifyChanged();
      } else {
        const created = await createResumeFromJson(
          proposal.resume_json,
          proposal.suggested_title || null
        );
        setMessageState(index, {
          proposalState: 'applied',
          appliedResumeId: created.resume_id,
        });
      }
    } catch {
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          content: '> [ ERROR ] Could not apply the change. Try again.',
          error: true,
        },
      ]);
    }
  };

  const dismissProposal = (index: number) => {
    setMessageState(index, { proposalState: 'dismissed' });
  };

  const restoreBackup = async (backupId: string) => {
    setPendingBackupRestore(backupId);
    try {
      await restoreResumeBackup(resumeId, backupId);
      notifyChanged();
      setView('menu');
      setMessages([]);
    } catch (e) {
      setBackupsError(e instanceof Error ? e.message : 'Restore failed.');
    } finally {
      setPendingBackupRestore(null);
    }
  };

  const newChat = () => {
    setMessages([]);
    setInput('');
    setView('menu');
  };

  const handleEditProposalComplete = useCallback(
    (appliedCount: number, rejectedCount: number) => {
      const lastIdx = messages.length - 1;
      if (lastIdx >= 0) {
        setMessageState(lastIdx, { proposalState: appliedCount > 0 ? 'applied' : 'dismissed' });
      }
      if (appliedCount > 0) {
        notifyChanged();
      }
      const parts: string[] = [];
      if (appliedCount > 0) parts.push(`${appliedCount} accepted`);
      if (rejectedCount > 0) parts.push(`${rejectedCount} rejected`);
      setMessages((m) => [
        ...m,
        {
          role: 'assistant',
          content: parts.length > 0 ? parts.join(', ') + '.' : 'No changes applied.',
        },
      ]);
    },
    [messages, notifyChanged]
  );

  const headerTitle = useMemo(() => {
    if (view === 'history') return 'Snapshot History';
    if (view === 'chat') return `${docLabel} · ${INTERNAL_MODE_LABELS[mode]}`;
    return `Resume Matcher · ${docLabel}`;
  }, [view, mode, docLabel]);

  if (!open) {
    return (
      <button
        type="button"
        className={styles.launcher}
        aria-label="Open resume assistant"
        onClick={() => setOpen(true)}
      >
        <MessageCircle size={24} strokeWidth={1.75} />
      </button>
    );
  }

  return (
    <>
      <aside className={styles.pane} role="dialog" aria-label="Resume assistant">
        <header className={styles.head}>
          <div className={styles.monoMark}>RM</div>
          <div className={styles.titleBlock}>
            <div className={styles.title}>{headerTitle}</div>
            <div className={styles.subtitle}>
              <span className={styles.statusDot} data-mode={view} />
              {view === 'chat'
                ? getModeHint(mode, docLabel)
                : view === 'history'
                  ? 'Restore an earlier snapshot.'
                  : 'Pick what to do.'}
            </div>
          </div>

          {view === 'chat' && (
            <button
              type="button"
              className={styles.iconBtn}
              onClick={newChat}
              title="New conversation"
              aria-label="New conversation"
            >
              <Plus size={14} strokeWidth={1.75} />
            </button>
          )}

          <button
            type="button"
            className={`${styles.iconBtn} ${view === 'history' ? styles.active : ''}`}
            onClick={() => (view === 'history' ? setView('menu') : void openHistory())}
            title={view === 'history' ? 'Back' : 'Snapshot history'}
            aria-label={view === 'history' ? 'Back' : 'Snapshot history'}
          >
            {view === 'history' ? (
              <ChevronLeft size={14} strokeWidth={1.75} />
            ) : (
              <History size={14} strokeWidth={1.75} />
            )}
          </button>

          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => setOpen(false)}
            title="Close"
            aria-label="Close assistant"
          >
            <XIcon size={14} strokeWidth={1.75} />
          </button>
        </header>

        <div className={styles.body} ref={bodyRef}>
          {view === 'menu' && (
            <ActionMenu
              onStart={startMode}
              onHistory={() => void openHistory()}
              documentType={documentType}
              docLabel={docLabel}
            />
          )}

          {view === 'history' && (
            <HistoryView
              loading={backupsLoading}
              error={backupsError}
              rows={backups ?? []}
              pendingId={pendingBackupRestore}
              onRestore={restoreBackup}
            />
          )}

          {view === 'chat' && (
            <>
              {messages.length === 0 && (
                <div className={styles.empty}>
                  <div className={styles.greet}>{modeGreeting(mode, docLabel)}</div>
                  <div
                    className={styles.tag}
                  >{`// ${INTERNAL_MODE_LABELS[mode].toUpperCase()} MODE — ${docLabel.toUpperCase()}`}</div>
                  <div className={styles.prompts}>
                    {starterPrompts(mode, docLabel).map((p) => (
                      <button
                        key={p}
                        type="button"
                        className={styles.prompt}
                        onClick={() => void sendMessage(p)}
                      >
                        <span className={styles.arr}>→</span>
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`${styles.msg} ${
                    m.role === 'user' ? styles.msgUser : styles.msgAssistant
                  } ${m.error ? styles.msgError : ''}`}
                >
                  <div className={styles.msgWho}>{m.role === 'user' ? 'You' : 'Assistant'}</div>
                  <div className={styles.msgBubble}>{m.content}</div>
                  {m.proposal && (
                    <ProposalCard
                      proposal={m.proposal}
                      state={m.proposalState ?? 'pending'}
                      appliedResumeId={m.appliedResumeId}
                      onApply={() => void applyProposal(i, m.proposal as ChatProposal)}
                      onDismiss={() => dismissProposal(i)}
                      onOpenCreated={(id) => router.push(`/resumes/${id}`)}
                    />
                  )}
                  {m.editProposal && m.proposalState === 'pending' && (
                    <DiffReviewFlow
                      resumeId={resumeId}
                      documentType={documentType}
                      proposal={m.editProposal}
                      onComplete={handleEditProposalComplete}
                    />
                  )}
                  {m.editProposal && m.proposalState === 'applied' && (
                    <div className={styles.proposalApplied}>
                      <Check size={12} strokeWidth={2} />
                      <span>Changes applied. View history to revert.</span>
                    </div>
                  )}
                  {m.editProposal && m.proposalState === 'dismissed' && (
                    <div className={styles.proposalDismissed}>No changes applied.</div>
                  )}
                </div>
              ))}

              {pending && (
                <div className={`${styles.msg} ${styles.msgAssistant}`}>
                  <div className={styles.msgWho}>Assistant</div>
                  <div className={styles.msgBubble} style={{ padding: 0 }}>
                    <div className={styles.typing}>
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {view === 'chat' && (
          <>
            <form className={styles.foot} onSubmit={handleSubmit}>
              <textarea
                ref={taRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  mode === 'tailor'
                    ? 'Describe the target role or employer…'
                    : mode === 'edit'
                      ? `Describe what to change in this ${docLabel.toLowerCase()}…`
                      : 'Type a message — Shift+Enter for newline'
                }
                rows={1}
              />
              <button
                type="submit"
                className={styles.send}
                disabled={!input.trim() || pending}
                aria-label="Send message"
              >
                <Send size={14} strokeWidth={2} />
              </button>
            </form>
            <div className={styles.hint}>
              <span>
                {INTERNAL_MODE_LABELS[mode]} · {docLabel}
              </span>
              <span>{messages.length} msg</span>
            </div>
          </>
        )}
      </aside>
    </>
  );
}

function ActionMenu({
  onStart,
  onHistory,
  documentType,
  docLabel,
}: {
  onStart: (m: InternalMode) => void;
  onHistory: () => void;
  documentType: DocumentType;
  docLabel: string;
}) {
  const isStructured = documentType === 'resume' || documentType === 'cv';
  return (
    <div className={styles.menu}>
      <div className={styles.menuIntro}>
        <div className={styles.greet}>What do you want to do?</div>
        <div className={styles.tag}>{`// ${docLabel.toUpperCase()}`}</div>
      </div>
      <button type="button" className={styles.menuItem} onClick={() => onStart('discuss')}>
        <span className={styles.menuItemIcon}>
          <HelpCircle size={18} strokeWidth={1.75} />
        </span>
        <span>
          <span className={styles.menuItemTitle}>Discuss {docLabel.toLowerCase()}</span>
          <span className={styles.menuItemDesc}>Ask questions — no edits made.</span>
        </span>
      </button>
      <button type="button" className={styles.menuItem} onClick={() => onStart('edit')}>
        <span className={styles.menuItemIcon}>
          <Pencil size={18} strokeWidth={1.75} />
        </span>
        <span>
          <span className={styles.menuItemTitle}>Edit {docLabel.toLowerCase()}</span>
          <span className={styles.menuItemDesc}>
            Propose changes you approve one-by-one as diffs.
          </span>
        </span>
      </button>
      {isStructured && (
        <button type="button" className={styles.menuItem} onClick={() => onStart('tailor')}>
          <span className={styles.menuItemIcon}>
            <Wand2 size={18} strokeWidth={1.75} />
          </span>
          <span>
            <span className={styles.menuItemTitle}>Create tailored variant</span>
            <span className={styles.menuItemDesc}>
              Draft a new {docLabel.toLowerCase()} for a specific role or employer.
            </span>
          </span>
        </button>
      )}
      <button type="button" className={styles.menuItem} onClick={onHistory}>
        <span className={styles.menuItemIcon}>
          <History size={18} strokeWidth={1.75} />
        </span>
        <span>
          <span className={styles.menuItemTitle}>View snapshot history</span>
          <span className={styles.menuItemDesc}>Restore an earlier version.</span>
        </span>
      </button>
    </div>
  );
}

function HistoryView({
  loading,
  error,
  rows,
  pendingId,
  onRestore,
}: {
  loading: boolean;
  error: string | null;
  rows: BackupRow[];
  pendingId: string | null;
  onRestore: (id: string) => void;
}) {
  if (loading) {
    return <div className={styles.historyEmpty}>Loading snapshots…</div>;
  }
  if (error) {
    return (
      <div className={styles.historyEmpty}>
        <AlertTriangle size={16} strokeWidth={1.75} /> {error}
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className={styles.historyEmpty}>
        No snapshots yet. Applying a proposal will create one automatically.
      </div>
    );
  }
  return (
    <div className={styles.historyList}>
      {rows.map((b) => (
        <div key={b.backup_id} className={styles.historyRow}>
          <div className={styles.historyRowMain}>
            <div className={styles.historyTime}>{formatTime(b.created_at)}</div>
            <div className={styles.historySource}>{labelForSource(b.source)}</div>
            {b.previous_title && <div className={styles.historyTitle}>{b.previous_title}</div>}
          </div>
          <button
            type="button"
            className={styles.historyRestoreBtn}
            disabled={pendingId === b.backup_id}
            onClick={() => onRestore(b.backup_id)}
          >
            <RotateCcw size={12} strokeWidth={2} />
            {pendingId === b.backup_id ? 'Restoring…' : 'Restore'}
          </button>
        </div>
      ))}
    </div>
  );
}

function ProposalCard({
  proposal,
  state,
  appliedResumeId,
  onApply,
  onDismiss,
  onOpenCreated,
}: {
  proposal: ChatProposal;
  state: 'pending' | 'applied' | 'dismissed';
  appliedResumeId?: string;
  onApply: () => void;
  onDismiss: () => void;
  onOpenCreated: (id: string) => void;
}) {
  return (
    <div className={styles.proposal}>
      <div className={styles.proposalHead}>
        <span className={styles.proposalKind}>
          {proposal.kind === 'edit' ? 'PROPOSED EDIT' : 'PROPOSED NEW RESUME'}
        </span>
        <span className={styles.proposalSummary}>{proposal.summary}</span>
      </div>
      {proposal.diff_summary.length > 0 && (
        <ul className={styles.proposalDiff}>
          {proposal.diff_summary.map((d, i) => (
            <li key={i}>{d}</li>
          ))}
        </ul>
      )}
      {state === 'pending' ? (
        <div className={styles.proposalActions}>
          <button type="button" className={styles.proposalApply} onClick={onApply}>
            <Check size={12} strokeWidth={2} />
            {proposal.kind === 'edit' ? 'Apply' : 'Create'}
          </button>
          <button type="button" className={styles.proposalCancel} onClick={onDismiss}>
            Cancel
          </button>
        </div>
      ) : state === 'applied' ? (
        <div className={styles.proposalApplied}>
          <Check size={12} strokeWidth={2} />
          {proposal.kind === 'edit' ? (
            <span>Applied. View history to revert.</span>
          ) : (
            <button
              type="button"
              className={styles.proposalOpen}
              onClick={() => appliedResumeId && onOpenCreated(appliedResumeId)}
            >
              Open new resume →
            </button>
          )}
        </div>
      ) : (
        <div className={styles.proposalDismissed}>Dismissed.</div>
      )}
    </div>
  );
}

function starterPrompts(mode: InternalMode, docLabel: string): string[] {
  const lower = docLabel.toLowerCase();
  if (mode === 'discuss') {
    if (lower === 'cover letter') {
      return [
        'Does this cover letter match the tone of the job listing?',
        'What could make the opening paragraph stronger?',
        'Is the closing compelling?',
      ];
    }
    if (lower === 'outreach message') {
      return [
        'Is this message too formal for LinkedIn?',
        'Does the ask feel natural?',
        'How could I make it more personal?',
      ];
    }
    return [
      `Summarize the strongest parts of this ${lower}.`,
      'What roles am I best positioned for?',
      'Which sections are weakest?',
    ];
  }
  if (mode === 'edit') {
    if (lower === 'cover letter') {
      return [
        'Make the tone more confident.',
        'Shorten the second paragraph.',
        'Add a stronger call-to-action.',
      ];
    }
    if (lower === 'outreach message') {
      return [
        'Make it shorter and punchier.',
        'Add a specific hook referencing their recent work.',
        'Rewrite for a warmer tone.',
      ];
    }
    return [
      'Tighten my professional summary.',
      'Rewrite the bullets under my most recent role to be more impact-driven.',
      'Trim filler skills and group them by theme.',
    ];
  }
  return [
    'Draft a master resume based on a description.',
    'Create a variant tailored for a position based on job description.',
  ];
}

function modeGreeting(mode: InternalMode, docLabel: string): string {
  const lower = docLabel.toLowerCase();
  if (mode === 'discuss') return `Ask anything about this ${lower}.`;
  if (mode === 'edit') return `What should I change in this ${lower}?`;
  return `Describe the role you want a ${lower} for.`;
}

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function labelForSource(source: string | null): string {
  if (!source) return 'snapshot';
  switch (source) {
    case 'browser_json_upload':
      return 'JSON edit';
    case 'chat_restore':
      return 'before restore';
    default:
      return source.replace(/_/g, ' ');
  }
}

export default ChatBot;
