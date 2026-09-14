import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, PageHeader } from '../design/components';
import { publicPilotPostingCopy } from '../constants/pilotPostingCopy';

export default function PilotPostingUnavailable({
  homeownerPosting = 'CLOSED',
  loadState = 'ok',
  waitlistAvailable = true,
}) {
  const navigate = useNavigate();
  const paused = homeownerPosting === 'PAUSED' && loadState !== 'error';
  const title = loadState === 'error'
    ? 'Posting temporarily unavailable'
    : paused
      ? 'New job posts are paused'
      : 'Homeowner posting is not open yet';

  return (
    <Card tone="elevated" style={{ display: 'grid', gap: 18, maxWidth: 560, margin: '0 auto' }}>
      <PageHeader
        eyebrow="Inner Melbourne pilot"
        title={title}
        description={publicPilotPostingCopy(homeownerPosting, loadState)}
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {waitlistAvailable ? (
          <Button onClick={() => navigate('/waitlist')}>
            Join waitlist
          </Button>
        ) : null}
        <Button variant="secondary" onClick={() => navigate('/')}>
          Back to home
        </Button>
      </div>
    </Card>
  );
}
