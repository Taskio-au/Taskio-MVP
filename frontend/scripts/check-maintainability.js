/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const SRC_DIR = path.resolve(__dirname, '../src');

const MAX_NEW_FILE_LINES = 500;
const INLINE_STYLE_WARN_THRESHOLD = 80;
const legacyLineBudget = {
  'Dashboard.js': 2700,
  'JobDetail.js': 1450,
  'Login.js': 800,
  'components/AdminSupportTickets.js': 820,
  'components/AppHeader.js': 560,
  'components/HomeownerDashboard.js': 720,
  'components/HomeownerJobDetail.js': 1325,
  'components/JobChatPanel.js': 820,
  'components/JobPostingForm.js': 1550,
  'components/LandingPage.js': 650,
  'components/ProfilePage.js': 2700,
  'components/SupportPage.js': 720,
  'components/TradieDashboard.js': 1250,
  'components/TradieJobDetail.js': 900,
  'components/TradieSignUp.js': 1250,
  'components/profile/PrivateDetailsVerificationCard.jsx': 760,
};

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(p));
    } else if (/\.(js|jsx)$/.test(entry.name)) {
      files.push(p);
    }
  }
  return files;
}

function rel(filePath) {
  return path.relative(SRC_DIR, filePath).replace(/\\/g, '/');
}

function countMatches(text, re) {
  const matches = text.match(re);
  return matches ? matches.length : 0;
}

function main() {
  const files = walk(SRC_DIR);
  const errors = [];
  const warnings = [];

  for (const filePath of files) {
    const fileRel = rel(filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/).length;

    // Block native blocking dialogs in product code.
    if (/window\.prompt\s*\(/.test(content) || /window\.confirm\s*\(/.test(content)) {
      errors.push(`${fileRel}: uses window.prompt/window.confirm; use an in-app modal instead.`);
    }

    // Line-count guardrail.
    const budget = legacyLineBudget[fileRel];
    if (typeof budget === 'number') {
      if (lines > budget) {
        errors.push(`${fileRel}: ${lines} lines exceeds legacy budget ${budget}.`);
      }
    } else if (lines > MAX_NEW_FILE_LINES) {
      errors.push(`${fileRel}: ${lines} lines exceeds max ${MAX_NEW_FILE_LINES} for non-legacy files.`);
    }

    // Keep an eye on heavy inline style usage.
    const inlineStyles = countMatches(content, /style=\{/g);
    if (inlineStyles > INLINE_STYLE_WARN_THRESHOLD) {
      warnings.push(`${fileRel}: ${inlineStyles} inline style usages (consider extracting shared UI components).`);
    }
  }

  if (warnings.length) {
    console.log('\n[maintainability warnings]');
    warnings.forEach((w) => console.log(`- ${w}`));
  }

  if (errors.length) {
    console.error('\n[maintainability check failed]');
    errors.forEach((e) => console.error(`- ${e}`));
    process.exit(1);
  }

  console.log('Maintainability checks passed.');
}

main();
