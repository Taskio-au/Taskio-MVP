import React from 'react';
import { LANDING_STEPS } from './landingMedia';

/**
 * How Taskio works: five numbered steps on the Taskio Path connector.
 * Horizontal on desktop, vertical on phones. Copy avoids instant matching,
 * quote counts and response-time promises.
 */
export default function LandingJourney() {
  return (
    <ol className="landing-steps" aria-label="How Taskio works, step by step">
      {LANDING_STEPS.map((step, index) => {
        const Icon = step.icon;
        return (
          <li key={step.title} className="landing-step">
            <span className="landing-step-marker" aria-hidden>
              <Icon size={20} strokeWidth={2} />
            </span>
            <span className="landing-step-index">Step {index + 1}</span>
            <h3 className="landing-step-title">{step.title}</h3>
            <p className="landing-step-copy">{step.description}</p>
          </li>
        );
      })}
    </ol>
  );
}
