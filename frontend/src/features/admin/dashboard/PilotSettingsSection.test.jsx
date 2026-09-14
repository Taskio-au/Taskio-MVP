import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import PilotSettingsSection, { FOUNDATION_WARNING } from './PilotSettingsSection';

function settings(overrides = {}) {
  return {
    state: 'CLOSED',
    effectiveState: 'CLOSED',
    documentExists: true,
    configurationValid: true,
    updatedAt: '2026-09-14T00:00:00.000Z',
    updatedByUid: 'admin-1',
    reason: '',
    postingWired: false,
    postingBehaviour: 'CLOSED',
    ...overrides,
  };
}

function notReadyLaunch() {
  return {
    overallStatus: 'NOT READY',
    blockers: [
      { id: 'P06', label: 'P06 — legal/privacy review open' },
      { id: 'P03', label: 'P03 — production email not proven' },
    ],
  };
}

describe('PilotSettingsSection', () => {
  it('disables Open Pilot when CLOSED and NOT READY, and shows launch blockers', () => {
    render(
      <PilotSettingsSection
        loadState="ok"
        settings={settings()}
        launchLoadState="ok"
        launch={notReadyLaunch()}
      />
    );
    expect(screen.getByText('CLOSED')).toBeInTheDocument();
    expect(screen.getByText('NOT READY')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Pilot' })).toBeDisabled();
    expect(screen.getByText('P06 — legal/privacy review open')).toBeInTheDocument();
    expect(screen.getByText(FOUNDATION_WARNING)).toBeInTheDocument();
    expect(screen.getByText('NOT YET WIRED')).toBeInTheDocument();
    expect(screen.getByText(/Product behaviour remains CLOSED/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /activate|open posting/i })).toBeNull();
  });

  it('enables Open Pilot when CLOSED and READY TO OPEN, and requires confirmation', async () => {
    const onChangeState = jest.fn().mockResolvedValue({ ok: true });
    render(
      <PilotSettingsSection
        loadState="ok"
        settings={settings()}
        launchLoadState="ok"
        launch={{ overallStatus: 'READY TO OPEN', blockers: [] }}
        onChangeState={onChangeState}
      />
    );
    const open = screen.getByRole('button', { name: 'Open Pilot' });
    expect(open).toBeEnabled();
    fireEvent.click(open);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText(/Homeowner posting is NOT yet wired/)).toBeInTheDocument();
    expect(onChangeState).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Open Pilot' }));
    await waitFor(() => expect(onChangeState).toHaveBeenCalledWith('OPEN', ''));
  });

  it('shows Pause and Close when OPEN', () => {
    render(
      <PilotSettingsSection
        loadState="ok"
        settings={settings({ state: 'OPEN', effectiveState: 'OPEN' })}
        launchLoadState="ok"
        launch={{ overallStatus: 'READY TO OPEN', blockers: [] }}
      />
    );
    expect(screen.getByRole('button', { name: 'Pause Pilot' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Close Pilot' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Open Pilot' })).toBeNull();
  });

  it('shows Resume and Close when PAUSED, and disables Resume when not ready', () => {
    render(
      <PilotSettingsSection
        loadState="ok"
        settings={settings({ state: 'PAUSED', effectiveState: 'PAUSED' })}
        launchLoadState="ok"
        launch={notReadyLaunch()}
      />
    );
    expect(screen.getByRole('button', { name: 'Resume Pilot' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Close Pilot' })).toBeEnabled();
    expect(screen.getByText('P06 — legal/privacy review open')).toBeInTheDocument();
  });

  it('shows a useful mutation error and keeps posting unwired', () => {
    render(
      <PilotSettingsSection
        loadState="ok"
        settings={settings()}
        launchLoadState="ok"
        launch={{ overallStatus: 'READY TO OPEN', blockers: [] }}
        mutationError={{ code: 'PILOT_NOT_READY', message: 'Pilot cannot open until launch readiness is READY TO OPEN.' }}
      />
    );
    expect(screen.getByText('PILOT_NOT_READY')).toBeInTheDocument();
    expect(screen.getByText(/cannot open until launch readiness/i)).toBeInTheDocument();
    expect(screen.getByText('NOT YET WIRED')).toBeInTheDocument();
  });

  it('warns when operational state stays OPEN after readiness degrades', () => {
    render(
      <PilotSettingsSection
        loadState="ok"
        settings={settings({ state: 'OPEN', effectiveState: 'OPEN' })}
        launchLoadState="ok"
        launch={notReadyLaunch()}
      />
    );
    expect(screen.getByText(/degraded while operational state is OPEN/)).toBeInTheDocument();
  });
});
