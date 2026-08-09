import React, { memo } from 'react';

const BENEFITS = [
  {
    title: 'Get Paid Securely',
    text: 'Get paid through Taskio with protected payments and guided payout setup.',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#14C5C5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
      </svg>
    ),
  },
  {
    title: 'Choose Your Tasks',
    text: 'Focus on the jobs that match your skills, suburb, and schedule.',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#14C5C5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    ),
  },
  {
    title: 'Build Your Reputation',
    text: 'Verified reviews help build trust in your expert profile.',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#14C5C5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
      </svg>
    ),
  },
  {
    title: 'Grow Your Business',
    text: 'Show up for the right small indoor jobs and earn repeat work over time.',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#14C5C5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v20" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
  },
];

function BenefitsCard({ styles }) {
  return (
    <div style={styles.infoCard} className="info-card">
      <h3 style={styles.infoTitle}>Why Join Taskio?</h3>
      <div style={styles.infoList}>
        {BENEFITS.map((item) => (
          <div key={item.title} style={styles.infoItem}>
            <div style={styles.infoBulletWrapper}>
              <div style={styles.infoBullet}>
                {item.icon}
              </div>
            </div>
            <div>
              <div style={styles.infoItemTitle}>{item.title}</div>
              <div style={styles.infoItemText}>{item.text}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default memo(BenefitsCard);
