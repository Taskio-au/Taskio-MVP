import React, { useEffect, useId, useMemo, useRef, useState } from 'react';

/**
 * Lightweight tooltip/popover:
 * - Hover/focus opens on desktop
 * - Tap/click toggles on mobile
 * - Click outside / Escape closes
 */
export default function Tooltip({
  content,
  ariaLabel,
  placement = 'top', // preferred: 'top' | 'bottom' (auto-flips to stay in viewport)
  size = 18,
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const btnRef = useRef(null);
  const id = useId();
  const [pos, setPos] = useState(null); // { placement, top, left, width }

  const tooltipId = useMemo(() => `tooltip-${id.replace(/[:]/g, '')}`, [id]);

  const computePosition = () => {
    const btn = btnRef.current;
    if (!btn) return null;
    const r = btn.getBoundingClientRect();

    const viewportW = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportH = window.innerHeight || document.documentElement.clientHeight || 0;
    const pad = 8;
    const maxWidth = 220;
    const gap = 8;

    // Prefer "top" unless it would clip.
    const wantTop = placement === 'top';
    const canTop = r.top >= (pad + 44); // rough min space
    const finalPlacement = wantTop ? (canTop ? 'top' : 'bottom') : 'bottom';

    const width = Math.min(maxWidth, viewportW - pad * 2);
    let left = r.right - width; // right-align to icon
    left = Math.max(pad, Math.min(left, viewportW - pad - width));

    const top = finalPlacement === 'top'
      ? Math.max(pad, r.top - gap) // actual height unknown; we'll translateY in CSS
      : Math.min(viewportH - pad, r.bottom + gap);

    return { placement: finalPlacement, top, left, width };
  };

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (e) => {
      const el = wrapRef.current;
      if (!el) return;
      if (el.contains(e.target)) return;
      setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onScroll = () => setOpen(false);
    const onResize = () => setOpen(false);

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setPos(computePosition());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, placement]);

  const iconStyle = {
    width: size,
    height: size,
    borderRadius: 999,
    border: '1px solid #D1D5DB',
    background: '#fff',
    color: '#6B7280',
    fontSize: 12,
    lineHeight: `${size}px`,
    textAlign: 'center',
    padding: 0,
    cursor: 'pointer',
    userSelect: 'none',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  };

  const tooltipStyle = {
    position: 'fixed',
    zIndex: 20,
    maxWidth: 220,
    padding: '10px 12px',
    background: '#FFFFFF',
    border: '1px solid #E5E7EB',
    borderRadius: 10,
    boxShadow: '0 10px 22px rgba(0,0,0,0.10)',
    fontFamily: 'Inter, sans-serif',
    fontSize: 12.5,
    lineHeight: 1.4,
    color: '#111827',
    width: pos?.width || 220,
    left: pos?.left ?? 0,
    top: pos?.top ?? 0,
    transform: pos?.placement === 'top' ? 'translateY(-100%)' : 'translateY(0)',
  };

  return (
    <span
      ref={wrapRef}
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        ref={btnRef}
        type="button"
        aria-label={ariaLabel}
        aria-expanded={open ? 'true' : 'false'}
        aria-describedby={open ? tooltipId : undefined}
        style={iconStyle}
        onClick={(e) => {
          // Prevent toggling checkbox/label click
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onPointerDown={(e) => {
          // Don't steal scroll; also prevent label click
          e.stopPropagation();
        }}
      >
        i
      </button>

      {open ? (
        <span id={tooltipId} role="tooltip" style={tooltipStyle}>
          {content}
        </span>
      ) : null}
    </span>
  );
}
