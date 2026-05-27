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
  Archive,
  Pin,
  PinOff,
  Trash2,
} from 'lucide-react';

import {
  chatWithResume,
  chatWithDocument,
  createResumeFromJson,
  listResumeBackups,
  restoreResumeBackup,
  listConversations,
  createConversation,
  updateConversationMessages,
  deleteConversation,
  toggleConversationPin,
  type ChatMessage,
  type ChatMode,
  type ChatProposal,
  type DocumentType,
  type EditProposal,
  type BackupRow,
  type Conversation,
} from '@/lib/api/chat';
import { uploadResumeJson } from '@/lib/api/resume';
import { DiffReviewFlow } from './diff-review-flow';

import styles from './chat-bot.module.css';

type TabId = 'resume' | 'cv' | 'coverLetter' | 'outreach' | 'job';
type View = 'menu' | 'chat' | 'history' | 'conversations';
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

  // Conversation history state
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [conversationsError, setConversationsError] = useState<string | null>(null);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  // Set when resuming a saved conversation so document type matches the saved context.
  const [conversationDocumentType, setConversationDocumentType] = useState<DocumentType | null>(
    null
  );

  const documentType = tabToDocumentType(activeTab);
  const effectiveDocumentType: DocumentType = conversationDocumentType ?? documentType;
  const docLabel = DOC_TYPE_LABELS[effectiveDocumentType];

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
    setCurrentConversationId(null);
    setConversationDocumentType(null);
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

  const openConversations = useCallback(async () => {
    setView('conversations');
    setConversationsError(null);
    setConversationsLoading(true);
    try {
      const list = await listConversations(resumeId);
      setConversations(list);
    } catch (e) {
      setConversationsError(e instanceof Error ? e.message : 'Failed to load conversations.');
      setConversations([]);
    } finally {
      setConversationsLoading(false);
    }
  }, [resumeId]);

  const resumeConversation = useCallback((conv: Conversation) => {
    setConversationDocumentType(conv.document_type as DocumentType);
    setMode(conv.mode as InternalMode);
    setCurrentConversationId(conv.conversation_id);
    setMessages(conv.messages.map((m) => ({ role: m.role, content: m.content })));
    setInput('');
    setView('chat');
  }, []);

  const saveConversation = useCallback(
    async (msgs: ChatMessage[]) => {
      if (msgs.length < 2) return;
      try {
        if (currentConversationId) {
          await updateConversationMessages(resumeId, currentConversationId, msgs);
        } else {
          const title = msgs[0]?.content?.slice(0, 80) ?? 'Conversation';
          const conv = await createConversation(resumeId, {
            document_type: effectiveDocumentType,
            mode,
            messages: msgs,
            title,
          });
          setCurrentConversationId(conv.conversation_id);
        }
      } catch {
        // best-effort — conversation history should not disrupt the chat UX
      }
    },
    [resumeId, currentConversationId, effectiveDocumentType, mode]
  );

  const handleDeleteConversation = useCallback(
    async (conversationId: string) => {
      try {
        await deleteConversation(resumeId, conversationId);
        setConversations((prev) =>
          (prev ?? []).filter((c) => c.conversation_id !== conversationId)
        );
        if (currentConversationId === conversationId) {
          setCurrentConversationId(null);
        }
      } catch {
        setConversationsError('Failed to delete conversation.');
      }
    },
    [resumeId, currentConversationId]
  );

  const handleTogglePin = useCallback(
    async (conversationId: string) => {
      try {
        const updated = await toggleConversationPin(resumeId, conversationId);
        setConversations((prev) =>
          (prev ?? []).map((c) => (c.conversation_id === conversationId ? updated : c))
        );
      } catch {
        setConversationsError('Failed to toggle pin.');
      }
    },
    [resumeId]
  );

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
          const assistantMsg: UiMessage = {
            role: 'assistant',
            content: res.reply,
            proposal: res.proposal ?? null,
            proposalState: res.proposal ? 'pending' : undefined,
          };
          const finalMsgs = [...next, assistantMsg];
          setMessages(finalMsgs);
          void saveConversation(finalMsgs.map((m) => ({ role: m.role, content: m.content })));
        } else {
          const res = await chatWithDocument(resumeId, {
            messages: payloadMessages,
            document_type: effectiveDocumentType,
            mode: mode as 'discuss' | 'edit',
          });
          const assistantMsg: UiMessage = {
            role: 'assistant',
            content: res.reply,
            editProposal: res.proposal ?? null,
            proposalState: res.proposal ? 'pending' : undefined,
          };
          const finalMsgs = [...next, assistantMsg];
          setMessages(finalMsgs);
          void saveConversation(finalMsgs.map((m) => ({ role: m.role, content: m.content })));
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
    [messages, pending, mode, resumeId, effectiveDocumentType, saveConversation]
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
    setCurrentConversationId(null);
    setConversationDocumentType(null);
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
    if (view === 'conversations') return 'Conversation History';
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
                  : view === 'conversations'
                    ? 'Resume a past conversation.'
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
            className={`${styles.iconBtn} ${view === 'conversations' ? styles.active : ''}`}
            onClick={() => (view === 'conversations' ? setView('menu') : void openConversations())}
            title={view === 'conversations' ? 'Back' : 'Conversation history'}
            aria-label={view === 'conversations' ? 'Back' : 'Conversation history'}
          >
            {view === 'conversations' ? (
              <ChevronLeft size={14} strokeWidth={1.75} />
            ) : (
              <Archive size={14} strokeWidth={1.75} />
            )}
          </button>

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
              onConversations={() => void openConversations()}
              documentType={effectiveDocumentType}
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

          {view === 'conversations' && (
            <ConversationsView
              loading={conversationsLoading}
              error={conversationsError}
              conversations={conversations ?? []}
              onResume={resumeConversation}
              onDelete={(id) => void handleDeleteConversation(id)}
              onTogglePin={(id) => void handleTogglePin(id)}
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
                      documentType={effectiveDocumentType}
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
  onConversations,
  documentType,
  docLabel,
}: {
  onStart: (m: InternalMode) => void;
  onHistory: () => void;
  onConversations: () => void;
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
      <button type="button" className={styles.menuItem} onClick={onConversations}>
        <span className={styles.menuItemIcon}>
          <Archive size={18} strokeWidth={1.75} />
        </span>
        <span>
          <span className={styles.menuItemTitle}>Resume a conversation</span>
          <span className={styles.menuItemDesc}>Pick up where you left off.</span>
        </span>
      </button>
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

const DOC_TYPE_LABELS_LOWER: Record<string, string> = {
  resume: 'Resume',
  cv: 'CV',
  coverLetter: 'Cover Letter',
  outreach: 'Outreach',
};

const MODE_LABELS_LOWER: Record<string, string> = {
  discuss: 'Discuss',
  edit: 'Edit',
  tailor: 'Tailor',
};

function ConversationsView({
  loading,
  error,
  conversations,
  onResume,
  onDelete,
  onTogglePin,
}: {
  loading: boolean;
  error: string | null;
  conversations: Conversation[];
  onResume: (conv: Conversation) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string) => void;
}) {
  if (loading) {
    return <div className={styles.historyEmpty}>Loading conversations…</div>;
  }
  if (error) {
    return (
      <div className={styles.historyEmpty}>
        <AlertTriangle size={16} strokeWidth={1.75} /> {error}
      </div>
    );
  }
  if (conversations.length === 0) {
    return (
      <div className={styles.historyEmpty}>
        No conversations yet. Start a discussion or edit session and it will be saved here
        automatically.
      </div>
    );
  }

  const pinned = conversations.filter((c) => c.pinned);
  const unpinned = conversations.filter((c) => !c.pinned);

  const renderRow = (conv: Conversation) => (
    <div key={conv.conversation_id} className={styles.convRow}>
      <div className={styles.convRowMain}>
        <div className={styles.convTitle}>{conv.title}</div>
        <div className={styles.convMeta}>
          <span>{DOC_TYPE_LABELS_LOWER[conv.document_type] ?? conv.document_type}</span>
          <span className={styles.convMetaSep}>·</span>
          <span>{MODE_LABELS_LOWER[conv.mode] ?? conv.mode}</span>
          <span className={styles.convMetaSep}>·</span>
          <span>{conv.message_count} msg</span>
          <span className={styles.convMetaSep}>·</span>
          <span>{formatTime(conv.updated_at)}</span>
        </div>
      </div>
      <div className={styles.convActions}>
        <button
          type="button"
          className={styles.convResumeBtn}
          onClick={() => onResume(conv)}
          aria-label="Resume conversation"
        >
          Resume
        </button>
        <button
          type="button"
          className={`${styles.convIconBtn} ${conv.pinned ? styles.convPinned : ''}`}
          onClick={() => onTogglePin(conv.conversation_id)}
          title={conv.pinned ? 'Unpin' : 'Pin (keeps beyond 5-conversation limit)'}
          aria-label={conv.pinned ? 'Unpin conversation' : 'Pin conversation'}
        >
          {conv.pinned ? <PinOff size={11} strokeWidth={2} /> : <Pin size={11} strokeWidth={2} />}
        </button>
        <button
          type="button"
          className={styles.convIconBtn}
          onClick={() => onDelete(conv.conversation_id)}
          title="Delete conversation"
          aria-label="Delete conversation"
        >
          <Trash2 size={11} strokeWidth={2} />
        </button>
      </div>
    </div>
  );

  return (
    <div className={styles.convList}>
      {pinned.length > 0 && (
        <>
          <div className={styles.convGroupLabel}>
            <Pin size={9} strokeWidth={2.5} /> Pinned
          </div>
          {pinned.map(renderRow)}
        </>
      )}
      {unpinned.length > 0 && (
        <>
          {pinned.length > 0 && <div className={styles.convGroupLabel}>Recent</div>}
          {unpinned.map(renderRow)}
        </>
      )}
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
