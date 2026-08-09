/**
 * Expert Payments & Billing — compact Taskio fee line with optional benefit label.
 *
 * @param {number|null|undefined} taskioFeeCents
 * @param {string|null|undefined} benefitLabel
 * @param {(n: number) => string} formatAud
 */
export function formatTaskioFeeWithBenefitLine(taskioFeeCents, benefitLabel, formatAud) {
  const c = typeof taskioFeeCents === 'number' && Number.isFinite(taskioFeeCents) ? taskioFeeCents : 0;
  const money = formatAud(c / 100);
  const label = typeof benefitLabel === 'string' ? benefitLabel.trim() : '';
  if (label && label !== 'Taskio fee') {
    return `Taskio fee: ${money} — ${label}`;
  }
  return `Taskio fee: ${money}`;
}
