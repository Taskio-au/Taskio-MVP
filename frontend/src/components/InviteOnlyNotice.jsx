import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, PageHeader } from '../design/components';

export default function InviteOnlyNotice({
  title = 'Private early access',
  description = 'Taskio’s Melbourne launch is invite-only. If you have been invited, log in with the account Taskio provided.',
}) {
  const navigate = useNavigate();
  return (
    <Card tone="elevated" style={{ display: 'grid', gap: 18, maxWidth: 560, margin: '0 auto' }}>
      <PageHeader
        eyebrow="Inner Melbourne · invite only"
        title={title}
        description={description}
      />
      <p style={{ margin: 0, color: '#4B5563', lineHeight: 1.6 }}>
        Public signup is closed. Homeowners and Experts are onboarded by Taskio.
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <Button onClick={() => navigate('/login')}>
          Log in
        </Button>
        <Button variant="secondary" onClick={() => navigate('/')}>
          Back to home
        </Button>
      </div>
    </Card>
  );
}
