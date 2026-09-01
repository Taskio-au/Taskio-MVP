import React from 'react';
import BrandLogo from '../design/components/BrandLogo';
import '../styles/publicPageHeader.css';

export default function PublicPageHeader({
  homeTo = '/',
  actions = null,
  actionsClassName = '',
  logoStyle,
  brandAddon = null,
}) {
  return (
    <header className="public-page-header">
      <div className="public-page-shell public-page-header-inner">
        <div className="public-page-header-brand">
          <BrandLogo to={homeTo} style={logoStyle} />
          {brandAddon}
        </div>
        <div className={`public-page-header-actions ${actionsClassName}`.trim()}>{actions}</div>
      </div>
    </header>
  );
}
