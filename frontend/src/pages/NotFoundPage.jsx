import React from 'react';
import { Link } from 'react-router-dom';
import { BrandLogo, Button, Card, PageHeader } from '../design/components';

export default function NotFoundPage() {
  return (
    <div style={{ minHeight: '100vh', background: '#F7F9FA', padding: '24px' }}>
      <div style={{ width: 'min(760px, 100%)', margin: '0 auto' }}>
        <div style={{ marginBottom: 24 }}>
          <BrandLogo to="/" />
        </div>
        <Card tone="elevated" style={{ display: 'grid', gap: 20 }}>
          <PageHeader
            eyebrow="Page not found"
            title="That page is not available"
            description="The link may be out of date, or the page may only be available after signing in."
          />
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <Link to="/" style={{ textDecoration: 'none' }}>
              <Button variant="accent">Go to homepage</Button>
            </Link>
            <Link to="/login" style={{ textDecoration: 'none' }}>
              <Button variant="secondary">Go to login</Button>
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
