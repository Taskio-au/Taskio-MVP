import React from 'react';
import { Link } from 'react-router-dom';
import { BrandLogo, Button, Card, PageHeader } from '../design/components';

const shellStyle = {
  minHeight: '100vh',
  background: 'linear-gradient(180deg, #F7F9FA 0%, #FFFFFF 100%)',
  padding: '24px',
};

const containerStyle = {
  width: 'min(880px, 100%)',
  margin: '0 auto',
};

const bodyStyle = {
  display: 'grid',
  gap: 18,
  lineHeight: 1.7,
  color: '#4B5563',
};

export default function PrivacyPolicyPage() {
  return (
    <div style={shellStyle}>
      <div style={containerStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
          <BrandLogo to="/" />
          <Button variant="secondary" onClick={() => window.history.back()}>
            Go back
          </Button>
        </div>
        <Card tone="elevated" style={{ display: 'grid', gap: 20 }}>
          <PageHeader
            eyebrow="Taskio legal"
            title="Privacy Policy"
            description="This policy explains what Taskio collects, why it is collected, and how account, task, support, and payment-related information is handled."
          />
          <div style={bodyStyle}>
            <p style={{ margin: 0, fontSize: 14, color: '#6B7280' }}>Effective date: April 2026</p>
            <section>
              <h2 style={{ marginBottom: 8, color: '#111827' }}>What we collect</h2>
              <p style={{ margin: 0 }}>
                Taskio stores the details needed to run the service, including account details, task and quote content,
                payment-related metadata, support requests, and activity needed for account security.
              </p>
            </section>
            <section>
              <h2 style={{ marginBottom: 8, color: '#111827' }}>Why we use it</h2>
              <p style={{ margin: 0 }}>
                We use this information to match tasks, verify experts, support payments, investigate disputes, respond
                to support requests, and keep a clear record of what happened on each job.
              </p>
            </section>
            <section>
              <h2 style={{ marginBottom: 8, color: '#111827' }}>Payments and trust</h2>
              <p style={{ margin: 0 }}>
                Card details are handled by Stripe. Taskio stores payment references and related task records so payment
                status, approvals, refunds, and support actions can be traced if something goes wrong.
              </p>
            </section>
            <section>
              <h2 style={{ marginBottom: 8, color: '#111827' }}>Support and retention</h2>
              <p style={{ margin: 0 }}>
                Support tickets, task records, and audit logs may be retained for service delivery, fraud prevention,
                dispute handling, finance obligations, and legal compliance. For pilot questions, contact support through
                the in-app support flow.
              </p>
            </section>
            <section>
              <h2 style={{ marginBottom: 8, color: '#111827' }}>Your choices</h2>
              <p style={{ margin: 0 }}>
                You can request account support, correction, or deletion review through Taskio support. Where legal
                retention or payment obligations apply, some records may be retained for as long as reasonably required.
              </p>
            </section>
            <p style={{ margin: 0, fontSize: 14 }}>
              If this policy changes in a material way, Taskio will update this page and publish the latest version
              here. See also the <Link to="/terms">Terms of Use</Link>.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
