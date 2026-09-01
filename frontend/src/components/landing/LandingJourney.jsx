import React from 'react';
import { Check } from 'lucide-react';
import { LANDING_JOURNEY } from './landingMedia';

function MiniFootnote({ footnote }) {
  if (!footnote) return null;
  const Icon = footnote.icon;
  return (
    <p className="landing-mini-footnote">
      <Icon size={14} strokeWidth={2.25} />
      {footnote.text}
    </p>
  );
}

function MiniBrief({ preview }) {
  return (
    <>
      <dl className="landing-mini-rows">
        {preview.rows.map((row) => (
          <div key={row.label} className="landing-mini-row">
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      <MiniFootnote footnote={preview.footnote} />
    </>
  );
}

function MiniQuotes({ preview }) {
  return (
    <>
      <div className="landing-mini-quotes">
        {preview.quotes.map((quote) => (
          <div
            key={quote.expert}
            className={`landing-mini-quote${quote.selected ? ' landing-mini-quote--selected' : ''}`}
          >
            <span className="landing-mini-quote-expert">{quote.expert}</span>
            <span className="landing-mini-quote-meta">{quote.meta}</span>
            <span className="landing-mini-quote-price">{quote.price}</span>
          </div>
        ))}
      </div>
      <MiniFootnote footnote={preview.footnote} />
    </>
  );
}

function MiniPayment({ preview }) {
  return (
    <>
      <ol className="landing-mini-states">
        {preview.states.map((state) => (
          <li
            key={state.text}
            className={`landing-mini-state${state.done ? ' landing-mini-state--done' : ''}`}
          >
            <span className="landing-mini-state-marker">
              {state.done ? <Check size={12} strokeWidth={3} /> : null}
            </span>
            {state.text}
          </li>
        ))}
      </ol>
      <MiniFootnote footnote={preview.footnote} />
    </>
  );
}

const MINI_VIEWS = {
  brief: MiniBrief,
  quotes: MiniQuotes,
  payment: MiniPayment,
};

/**
 * Product journey: 01 Post, 02 Compare, 03 Approve.
 * Stages sit on the Taskio Path connector; each carries an illustrative mini product view.
 * The mini views are decorative duplicates of the stage copy, so they stay out of the
 * accessibility tree rather than announcing sample prices as real activity.
 */
export default function LandingJourney() {
  return (
    <ol className="landing-journey">
      {LANDING_JOURNEY.map((stage) => {
        const MiniView = MINI_VIEWS[stage.preview.kind];
        return (
          <li key={stage.stage} className="landing-journey-stage">
            <span className="landing-journey-node" aria-hidden />
            <div className="landing-journey-head">
              <span className="landing-journey-index">{stage.index}</span>
              <span className="landing-journey-name">{stage.stage}</span>
            </div>
            <h3 className="landing-journey-title">{stage.title}</h3>
            <p className="landing-journey-copy">{stage.description}</p>
            <div className="landing-mini" aria-hidden>
              <p className="landing-mini-head">{stage.preview.heading}</p>
              <MiniView preview={stage.preview} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}
