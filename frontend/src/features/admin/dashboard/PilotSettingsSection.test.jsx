import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import PilotSettingsSection, { OPERATIONAL_GUIDANCE } from './PilotSettingsSection';

function settings(overrides = {}) {
  return {
    state: 'CLOSED',
    effectiveState: 'CLOSED',
    documentExists: true,
    configurationValid: true,
    updatedAt: '2026-09-14T00:00:00.000Z',
    updatedByUid: 'admin-1',
    reason: '',
    postingWired: true,
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
    expect(screen.getAllByText('CLOSED').length).toBeGreaterThan(0);
    expect(screen.getByText('NOT READY')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open Pilot' })).toBeDisabled();
    expect(screen.getByText('P06 — legal/privacy review open')).toBeInTheDocument();
    expect(screen.getByText(OPERATIONAL_GUIDANCE)).toBeInTheDocument();
    expect(screen.getByText('New posting blocked / waitlist path.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /activate|open posting/i })).toBeNull();
    expect(screen.getByText(/Expert onboarding controls new Expert applications/i)).toBeInTheDocument();
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
    expect(within(dialog).getByText(/allows supported homeowners in the approved pilot area/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/category, geography, authentication and validation rules still apply/i)).toBeInTheDocument();
    expect(onChangeState).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Open Pilot' }));
    await waitFor(() => expect(onChangeState).toHaveBeenCalledWith('OPEN', ''));
  });

  it('opens Expert applications without READY TO OPEN and requires confirmation', async () => {
    const onChangeExpertOnboarding = jest.fn().mockResolvedValue({ ok: true });
    render(
      <PilotSettingsSection
        loadState="ok"
        settings={settings({ effectiveExpertOnboardingMode: 'WAITLIST' })}
        launchLoadState="ok"
        launch={notReadyLaunch()}
        onChangeExpertOnboarding={onChangeExpertOnboarding}
      />
    );
    const openExperts = screen.getByRole('button', { name: 'Open Expert applications' });
    expect(openExperts).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Open Pilot' })).toBeDisabled();
    fireEvent.click(openExperts);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/does not open homeowner posting/i)).toBeInTheDocument();
    expect(onChangeExpertOnboarding).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Open Expert applications' }));
    await waitFor(() => expect(onChangeExpertOnboarding).toHaveBeenCalledWith('OPEN', ''));
  });

  it('shows Pause and Close when OPEN, and homeowner posting as OPEN', () => {
    render(
      <PilotSettingsSection
        loadState="ok"
        settings={settings({ state: 'OPEN', effectiveState: 'OPEN', postingBehaviour: 'OPEN' })}
        launchLoadState="ok"
        launch={{ overallStatus: 'READY TO OPEN', blockers: [] }}
      />
    );
    expect(screen.getByRole('button', { name: 'Pause Pilot' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Close Pilot' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Open Pilot' })).toBeNull();
    expect(screen.getByText('Supported homeowners can submit new jobs.')).toBeInTheDocument();
  });

  it('shows Resume and Close when PAUSED, and disables Resume when not ready', () => {
    render(
      <PilotSettingsSection
        loadState="ok"
        settings={settings({ state: 'PAUSED', effectiveState: 'PAUSED', postingBehaviour: 'PAUSED' })}
        launchLoadState="ok"
        launch={notReadyLaunch()}
      />
    );
    expect(screen.getByRole('button', { name: 'Resume Pilot' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Close Pilot' })).toBeEnabled();
    expect(screen.getByText('P06 — legal/privacy review open')).toBeInTheDocument();
    expect(screen.getByText('New posting blocked. Existing jobs continue.')).toBeInTheDocument();
  });

  it('shows a useful mutation error and keeps posting CLOSED', () => {
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
    expect(screen.getByText('New posting blocked / waitlist path.')).toBeInTheDocument();
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
