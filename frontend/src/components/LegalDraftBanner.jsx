import React from 'react';
import { Card } from '../design/components';

export default function LegalDraftBanner() {
  return (
    <Card
      tone="muted"
      role="note"
      style={{
        padding: 14,
        fontSize: 14,
        lineHeight: 1.55,
        color: '#4B5563',
      }}
    >
      <strong style={{ color: '#111827' }}>Draft — not final.</strong>
      {' '}
      These pages are for closed staging review only. They are not legal advice and must receive
      owner (and preferably Australian legal) review before public production use, public signup,
      or real users. Entity, ABN, ACL, liability, insurance, and dispute wording are unresolved
      placeholders until that review.
    </Card>
  );
}
