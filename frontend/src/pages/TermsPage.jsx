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

export default function TermsPage() {
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
            title="Terms of Use"
            description="These terms set the baseline rules for using Taskio to post tasks, quote on work, and manage payments and support."
          />
          <div style={bodyStyle}>
            <p style={{ margin: 0, fontSize: 14, color: '#6B7280' }}>Effective date: April 2026</p>
            <section>
              <h2 style={{ marginBottom: 8, color: '#111827' }}>Using the platform</h2>
              <p style={{ margin: 0 }}>
                Users must provide accurate information, act lawfully, and keep all communication, quoting, approvals,
                and payment actions inside Taskio while a task is active.
              </p>
            </section>
            <section>
              <h2 style={{ marginBottom: 8, color: '#111827' }}>Payments and payment processing</h2>
              <p style={{ margin: 0 }}>
                Payments on Taskio are processed securely through Stripe. Taskio does not store full card numbers.
              </p>
              <p style={{ margin: 0 }}>
                Taskio operates as a marketplace platform connecting Clients and Experts. Taskio is not a bank,
                payment institution, trustee, financial adviser, or provider of financial product advice. Taskio does
                not take deposits, manage Client or Expert money in a statutory trust for you, or act as a custodian of
                funds in that role.
              </p>
              <p style={{ margin: 0 }}>
                When a Client funds a task through Taskio, payment is not released to the Expert until the Client
                approves the completed work, or until the matter is otherwise resolved under Taskio’s cancellation,
                refund, dispute, fraud, payout, or support process.
              </p>
              <p style={{ margin: 0 }}>
                Taskio may pause, review, release, refund, or investigate payments where there is a cancellation, dispute,
                refund request, payout issue, fraud concern, operational issue, suspected misuse of the platform, or
                breach of these Terms.
              </p>
              <p style={{ margin: 0 }}>
                Nothing in these Terms excludes, restricts, or modifies any rights or remedies that cannot be excluded,
                restricted, or modified under applicable law, including the Australian Consumer Law.
              </p>
            </section>
            <section>
              <h2 style={{ marginBottom: 8, color: '#111827' }}>Quotes, jobs, and payments</h2>
              <p style={{ margin: 0 }}>
                Clients choose whether to accept a quote. Funding a task through Taskio means the job can proceed; it
                does not on its own entitle the Expert to payout. Payout to the Expert depends on the Client approving
                the completed work, or on Taskio resolving the matter under its cancellation, refund, dispute, fraud,
                payout, or support process (see Payments and payment processing). Experts should not treat payment as
                final until that happens, unless Taskio support confirms otherwise.
              </p>
            </section>
            <section>
              <h2 style={{ marginBottom: 8, color: '#111827' }}>Disputes and refunds</h2>
              <p style={{ margin: 0 }}>
                If you need help with a payment or task issue, use the in-app support flow. Taskio will handle requests
                in line with the rules set out under Payments and payment processing, including any manual support
                decisions that may be required during the pilot.
              </p>
            </section>
            <section>
              <h2 style={{ marginBottom: 8, color: '#111827' }}>Pilot availability</h2>
              <p style={{ margin: 0 }}>
                Taskio is currently available in selected Melbourne suburbs and categories. Taskio may delay, restrict,
                or decline jobs outside the supported launch area or active service categories.
              </p>
            </section>
            <section>
              <h2 style={{ marginBottom: 8, color: '#111827' }}>Account actions</h2>
              <p style={{ margin: 0 }}>
                Taskio may suspend or remove accounts that breach platform rules, attempt to bypass payment flows, submit
                unsafe content, or create trust and safety risks for other users.
              </p>
            </section>
            <p style={{ margin: 0, fontSize: 14 }}>
              Taskio may update these terms from time to time as the service changes. Continued use of the platform means
              you accept the current version. See also the <Link to="/privacy">Privacy Policy</Link>.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
