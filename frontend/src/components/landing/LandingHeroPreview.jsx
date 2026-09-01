import React from 'react';
import { BadgeCheck, MapPin, ShieldCheck } from 'lucide-react';
import { LANDING_HERO, LANDING_HERO_PREVIEW } from './landingMedia';

/**
 * Hero right side: the local home photo with a Taskio Client-view state layered over it.
 * All values are illustrative sample data, labelled as such on screen.
 */
export default function LandingHeroPreview() {
  const preview = LANDING_HERO_PREVIEW;

  return (
    <figure className="landing-preview">
      <img
        className="landing-preview-photo"
        src={LANDING_HERO.src}
        alt={LANDING_HERO.alt}
        width={LANDING_HERO.width}
        height={LANDING_HERO.height}
        fetchPriority="high"
        decoding="async"
      />
      <span className="landing-preview-scrim" aria-hidden />

      <span className="landing-preview-label">Illustrative preview</span>

      <div className="landing-preview-card">
        <div className="landing-preview-card-head">
          <span className="landing-preview-category">{preview.category}</span>
          <span className="landing-preview-quotes">{preview.quotes}</span>
        </div>

        <p className="landing-preview-title">{preview.title}</p>

        <div className="landing-preview-meta">
          <span className="landing-preview-meta-item">
            <MapPin size={14} strokeWidth={2.25} aria-hidden />
            {preview.suburb}
          </span>
          <span className="landing-preview-range">{preview.range}</span>
        </div>

        <div className="landing-preview-states">
          <p className="landing-preview-state landing-preview-state--verified">
            <BadgeCheck size={16} strokeWidth={2.25} aria-hidden />
            {preview.expertStatus}
          </p>
          <p className="landing-preview-state landing-preview-state--payment">
            <ShieldCheck size={16} strokeWidth={2.25} aria-hidden />
            {preview.paymentStatus}
          </p>
        </div>
      </div>

      <figcaption className="taskio-sr-only">
        Illustrative preview of the Taskio Client view. Sample job data, not a real customer task.
      </figcaption>
    </figure>
  );
}
