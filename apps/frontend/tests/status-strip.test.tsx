import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StatusStrip } from '@/components/settings/status-strip';
import type { SystemStatus } from '@/lib/api/config';

vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));

const status: SystemStatus = {
  status: 'ready',
  llm_configured: true,
  llm_healthy: true,
  has_master_resume: true,
  database_stats: {
    total_resumes: 1,
    total_jobs: 0,
    total_improvements: 0,
    has_master_resume: true,
  },
};

const renderStrip = (props: Partial<React.ComponentProps<typeof StatusStrip>> = {}) =>
  render(
    <StatusStrip
      status={status}
      loading={false}
      lastFetched="2m ago"
      apiUrl="http://localhost:8000"
      onRefresh={vi.fn()}
      {...props}
    />
  );

describe('StatusStrip', () => {
  it('shows when the status was read, with no failure while the last refresh worked', () => {
    renderStrip();
    expect(screen.getByText('2m ago')).toBeInTheDocument();
    expect(screen.queryByText('settings.systemStatus.refreshFailed')).toBeNull();
  });

  it('says a refresh failed beside the time of the read it is still showing', () => {
    renderStrip({ error: 'Failed to fetch status' });
    expect(screen.getByText('2m ago')).toBeInTheDocument();
    expect(screen.getByText('settings.systemStatus.refreshFailed')).toBeInTheDocument();
  });

  it('does not call a refresh failed while the next one is running', () => {
    renderStrip({ error: 'Failed to fetch status', loading: true });
    expect(screen.queryByText('settings.systemStatus.refreshFailed')).toBeNull();
  });

  it('shows the database as offline when its stats could not be read', () => {
    renderStrip({
      status: { ...status, database_stats: { ...status.database_stats, available: false } },
    });
    expect(screen.getByText('settings.statusValues.offline')).toBeInTheDocument();
    expect(screen.queryByText('settings.statusValues.connected')).toBeNull();
  });
});
