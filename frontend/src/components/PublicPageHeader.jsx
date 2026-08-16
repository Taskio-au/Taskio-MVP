import React from 'react';
import BrandLogo from '../design/components/BrandLogo';
import '../styles/publicPageHeader.css';

export default function PublicPageHeader({ homeTo = '/', actions = null, actionsClassName = '', logoStyle }) {
  return (
    <header className="public-page-header">
      <div className="public-page-shell public-page-header-inner">
        <BrandLogo to={homeTo} style={logoStyle} />
        <div className={`public-page-header-actions ${actionsClassName}`.trim()}>{actions}</div>
      </div>
    </header>
  );
}
