import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const ORIGIN = 'https://taskio.com.au';

const PUBLIC_METADATA = {
  '/': ['Taskio | Small indoor tasks in Melbourne', 'Private early-access Taskio in inner Melbourne. Invited Clients and Experts log in to post tasks, compare quotes, and pay through Taskio.'],
  '/post-job': ['Post a Task | Taskio', 'Describe one or more small indoor task items and request whole-job quotes from Taskio experts.'],
  '/get-started': ['Get Started | Taskio', 'Taskio private Melbourne launch is invite-only. Invited Clients and Experts can log in.'],
  '/login': ['Log in | Taskio', 'Log in securely to manage your Taskio tasks, quotes, messages, and payments.'],
  '/privacy': ['Privacy Policy | Taskio', 'Read how Taskio handles personal information and privacy requests.'],
  '/terms': ['Terms of Use | Taskio', 'Read the terms that govern use of the Taskio marketplace.'],
  '/tradie/signup': ['Join as an Expert | Taskio', 'Expert enrollment for the private Melbourne launch is invite-only.'],
};

function upsertMeta(selector, attributes) {
  let element = document.head.querySelector(selector);
  if (!element) {
    element = document.createElement('meta');
    document.head.appendChild(element);
  }
  Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, value));
}

export default function RouteMetadata() {
  const { pathname } = useLocation();

  useEffect(() => {
    const [title, description] = PUBLIC_METADATA[pathname] || ['Taskio', 'Taskio task marketplace account area.'];
    const isPublic = Object.prototype.hasOwnProperty.call(PUBLIC_METADATA, pathname);
    const canonicalUrl = `${ORIGIN}${pathname === '/' ? '' : pathname}`;
    document.title = title;
    upsertMeta('meta[name="description"]', { name: 'description', content: description });
    upsertMeta('meta[property="og:title"]', { property: 'og:title', content: title });
    upsertMeta('meta[property="og:description"]', { property: 'og:description', content: description });
    upsertMeta('meta[property="og:url"]', { property: 'og:url', content: canonicalUrl });
    upsertMeta('meta[property="og:type"]', { property: 'og:type', content: 'website' });
    upsertMeta('meta[property="og:site_name"]', { property: 'og:site_name', content: 'Taskio' });
    upsertMeta('meta[property="og:image"]', { property: 'og:image', content: `${ORIGIN}/images/taskio-logo.png` });
    upsertMeta('meta[name="robots"]', { name: 'robots', content: isPublic ? 'index, follow' : 'noindex, nofollow' });

    let canonical = document.head.querySelector('link[rel="canonical"]');
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', canonicalUrl);

    const timer = window.setTimeout(() => {
      const main = document.querySelector('main');
      if (main) {
        main.id = 'main-content';
        if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1');
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  return <a className="skip-link" href="#main-content">Skip to main content</a>;
}

export { ORIGIN, PUBLIC_METADATA };
