import { act, renderHook, waitFor } from '@testing-library/react';
import usePublicPilotStatus, { FAILED_CLOSED_STATUS } from './usePublicPilotStatus';

describe('usePublicPilotStatus', () => {
  it('normalizes OPEN only when canPost is true', async () => {
    const api = {
      get: jest.fn().mockResolvedValue({
        data: { homeownerPosting: 'OPEN', canPost: true, waitlistAvailable: false },
      }),
    };
    const { result } = renderHook(() => usePublicPilotStatus(api));
    await waitFor(() => expect(result.current.loadState).toBe('ok'));
    expect(result.current.status.canPost).toBe(true);
    expect(result.current.status.homeownerPosting).toBe('OPEN');
  });

  it('fails closed when the public status request errors', async () => {
    const api = { get: jest.fn().mockRejectedValue(new Error('network')) };
    const { result } = renderHook(() => usePublicPilotStatus(api));
    await waitFor(() => expect(result.current.loadState).toBe('error'));
    expect(result.current.status).toEqual(FAILED_CLOSED_STATUS);
  });

  it('does not treat a claimed OPEN without canPost as open', async () => {
    const api = {
      get: jest.fn().mockResolvedValue({
        data: { homeownerPosting: 'OPEN', canPost: false },
      }),
    };
    const { result } = renderHook(() => usePublicPilotStatus(api));
    await waitFor(() => expect(result.current.status.canPost).toBe(false));
    expect(result.current.status.homeownerPosting).toBe('CLOSED');
  });

  it('re-checks on refresh', async () => {
    const api = {
      get: jest.fn()
        .mockResolvedValueOnce({ data: { homeownerPosting: 'OPEN', canPost: true } })
        .mockResolvedValueOnce({ data: { homeownerPosting: 'PAUSED', canPost: false } }),
    };
    const { result } = renderHook(() => usePublicPilotStatus(api));
    await waitFor(() => expect(result.current.status.canPost).toBe(true));
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.status).toEqual({
      homeownerPosting: 'PAUSED',
      canPost: false,
      waitlistAvailable: true,
    });
  });
});
