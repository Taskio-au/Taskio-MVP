import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ExpertPilotAvailabilityPanel from './ExpertPilotAvailabilityPanel';

describe('ExpertPilotAvailabilityPanel', () => {
  it('loads legacy missing values as not accepting and no areas', () => {
    render(
      <ExpertPilotAvailabilityPanel
        profile={{}}
        api={{ put: jest.fn() }}
      />
    );
    expect(screen.getByLabelText('Accepting new Taskio jobs')).not.toBeChecked();
    expect(screen.getByLabelText('Richmond')).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Save availability' })).toBeDisabled();
  });

  it('saves accepting jobs and selected service areas', async () => {
    const put = jest.fn().mockResolvedValue({
      data: {
        profile: { acceptingJobs: true, serviceAreas: ['Richmond'] },
      },
    });
    render(
      <ExpertPilotAvailabilityPanel
        profile={{ acceptingJobs: false, serviceAreas: [] }}
        api={{ put }}
        onSaved={jest.fn()}
      />
    );

    fireEvent.click(screen.getByLabelText('Accepting new Taskio jobs'));
    fireEvent.click(screen.getByLabelText('Richmond'));
    fireEvent.click(screen.getByRole('button', { name: 'Save availability' }));

    await waitFor(() => {
      expect(put).toHaveBeenCalledWith('/api/me/profile', {
        acceptingJobs: true,
        serviceAreas: ['Richmond'],
      });
    });
    expect(await screen.findByRole('status')).toHaveTextContent('Availability saved.');
  });

  it('shows a validation/error message when save fails', async () => {
    const put = jest.fn().mockRejectedValue({
      response: { data: { message: 'Unsupported service area: Geelong' } },
    });
    render(
      <ExpertPilotAvailabilityPanel
        profile={{ acceptingJobs: false, serviceAreas: [] }}
        api={{ put }}
      />
    );
    fireEvent.click(screen.getByLabelText('Carlton'));
    fireEvent.click(screen.getByRole('button', { name: 'Save availability' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Unsupported service area: Geelong');
  });
});
