import React, { useState } from 'react';
import { BadgeCheck, MapPin, ShieldCheck } from 'lucide-react';
import { LANDING_HERO, LANDING_HERO_PREVIEW } from './landingMedia';

/**
 * Hero right side: the local home photo with a Taskio Client-view state layered over it.
 * All values are illustrative sample data, labelled as such on screen.
 * If the photo fails to load, the branded frame and preview card still carry the visual.
 */
export default function LandingHeroPreview() {
  const preview = LANDING_HERO_PREVIEW;
  const [photoFailed, setPhotoFailed] = useState(false);

  return (
    <figure className={`landing-preview${photoFailed ? ' landing-preview--no-photo' : ''}`}>
      <div className="landing-preview-frame">
        {photoFailed ? null : (
          <img
            className="landing-preview-photo"
            src={LANDING_HERO.src}
            alt={LANDING_HERO.alt}
            width={LANDING_HERO.width}
            height={LANDING_HERO.height}
            fetchPriority="high"
            decoding="async"
            onError={() => setPhotoFailed(true)}
          />
        )}
        <span className="landing-preview-scrim" aria-hidden />
        <span className="landing-preview-label">Illustrative preview</span>
      </div>

      <div className="landing-preview-card" aria-hidden>
        <div className="landing-preview-card-head">
          <span className="landing-preview-category">{preview.category}</span>
          <span className="landing-preview-sample">Sample job</span>
        </div>

        <p className="landing-preview-title">{preview.title}</p>
        <p className="landing-preview-meta">
          <MapPin size={14} strokeWidth={2} />
          {preview.suburb}
        </p>

        <ul className="landing-preview-quotes">
          {preview.quotes.map((quote) => (
            <li
              key={quote.expert}
              className={`landing-preview-quote${quote.selected ? ' landing-preview-quote--selected' : ''}`}
            >
              <span className="landing-preview-quote-expert">
                {quote.expert}
                <span className="landing-preview-quote-check">
                  <BadgeCheck size={13} strokeWidth={2.25} />
                  {preview.expertStatus}
                </span>
              </span>
              <span className="landing-preview-quote-price">{quote.price}</span>
            </li>
          ))}
        </ul>

        <p className="landing-preview-state">
          <ShieldCheck size={15} strokeWidth={2.25} />
          {preview.paymentStatus}
        </p>
      </div>

      <figcaption className="taskio-sr-only">
        Illustrative preview of the Taskio Client view with sample quotes. Not a real customer task.
      </figcaption>
    </figure>
  );
}
