/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const SRC_DIR = path.resolve(__dirname, '../src');

const MAX_NEW_FILE_LINES = 500;
const INLINE_STYLE_WARN_THRESHOLD = 80;
const legacyLineBudget = {
  'AdminUserDetail.js': 546,
  'Dashboard.js': 2700,
  'JobDetail.js': 1450,
  'Login.js': 1028,
  'components/AccountSettings.js': 525,
  'components/AdminDailyChecklist.js': 526,
  'components/AdminSupportTickets.js': 902,
  'components/AppHeader.js': 892,
  'components/ExpertSignUpPage.jsx': 1073,
  'components/HomeownerDashboard.js': 1023,
  'components/HomeownerJobDetail.js': 1872,
  'components/JobChatPanel.js': 1040,
  'components/JobPostingForm.js': 1550,
  'components/LandingPage.js': 650,
  'components/MessagesPage.js': 539,
  'components/NotificationsPage.js': 540,
  'components/PaymentsPage.js': 1019,
  'components/PaymentsPage.test.js': 665,
  'components/ProfilePage.js': 2700,
  'components/SupportPage.js': 720,
  'components/TradieDashboard.js': 1250,
  'components/TradieJobDetail.js': 1054,
  'components/VariationPanel.js': 575,
  'components/VariationPanel.test.jsx': 638,
  'components/profile/PrivateDetailsVerificationCard.jsx': 760,
  'components/tradie-job-detail/QuoteSubmissionCard.jsx': 550,
  'styles/tradieDashboardStyles.js': 1006,
};

// Exact current combined counts of window.prompt( + window.confirm(.
// Budgeted files fail only if the combined count increases.
const legacyDialogBudget = {
  'components/HomeownerJobDetail.js': 3,
  'features/admin/dashboard/TaskDetailsDrawer.jsx': 3,
  'features/admin/job-detail/AdminJobOpsExtras.jsx': 4,
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

function countNativeDialogs(content) {
  return (
    countMatches(content, /window\.prompt\s*\(/g) +
    countMatches(content, /window\.confirm\s*\(/g)
  );
}

function main() {
  const files = walk(SRC_DIR);
  const errors = [];
  const warnings = [];

  for (const filePath of files) {
    const fileRel = rel(filePath);
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/).length;

    // Native blocking dialogs: exact debt budget (not an unlimited allowlist).
    const dialogCount = countNativeDialogs(content);
    const dialogBudget = legacyDialogBudget[fileRel];
    if (typeof dialogBudget === 'number') {
      if (dialogCount > dialogBudget) {
        errors.push(
          `${fileRel}: ${dialogCount} window.prompt/window.confirm usages exceeds legacy dialog budget ${dialogBudget}.`
        );
      }
    } else if (dialogCount > 0) {
      errors.push(
        `${fileRel}: uses window.prompt/window.confirm; use an in-app modal instead.`
      );
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
