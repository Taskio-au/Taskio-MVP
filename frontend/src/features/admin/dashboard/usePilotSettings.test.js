import { act, renderHook } from '@testing-library/react';
import usePilotSettings from './usePilotSettings';

describe('usePilotSettings', () => {
  it('loads settings through the admin API and does not touch Firestore', async () => {
    const api = {
      get: jest.fn().mockResolvedValue({
        data: { effectiveState: 'CLOSED', postingWired: false },
      }),
    };
    const { result } = renderHook(() => usePilotSettings(api));
    await act(async () => {
      await result.current.refresh();
    });
    expect(api.get).toHaveBeenCalledWith('/api/admin/pilot-settings');
    expect(result.current.data.effectiveState).toBe('CLOSED');
  });

  it('refreshes local state after a successful mutation and surfaces API errors', async () => {
    const api = {
      get: jest.fn(),
      put: jest.fn()
        .mockResolvedValueOnce({
          data: { changed: true, settings: { effectiveState: 'OPEN', postingWired: false } },
        })
        .mockRejectedValueOnce({
          response: { data: { code: 'PILOT_NOT_READY', message: 'Pilot cannot open until launch readiness is READY TO OPEN.' } },
        }),
    };
    const { result } = renderHook(() => usePilotSettings(api));
    await act(async () => {
      await result.current.changeState('OPEN', 'owner');
    });
    expect(api.put).toHaveBeenCalledWith('/api/admin/pilot-settings/state', { state: 'OPEN', reason: 'owner' });
    expect(result.current.data.effectiveState).toBe('OPEN');

    await act(async () => {
      await result.current.changeState('OPEN', '');
    });
    expect(result.current.mutationError.code).toBe('PILOT_NOT_READY');
  });
});
