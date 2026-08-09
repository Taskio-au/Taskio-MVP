import {
  CLIENT_LABEL,
  EXPERT_LABEL,
  TASK_EXPERT_LABEL,
  getRoleDisplayLabel,
  getRoleDisplayLabelPlural,
} from './roleLabels';

describe('roleLabels', () => {
  it('uses Client and Expert for public-facing labels', () => {
    expect(CLIENT_LABEL).toBe('Client');
    expect(EXPERT_LABEL).toBe('Expert');
    expect(TASK_EXPERT_LABEL).toBe('Expert');
    expect(getRoleDisplayLabel('homeowner')).toBe('Client');
    expect(getRoleDisplayLabel('tradie')).toBe('Expert');
    expect(getRoleDisplayLabelPlural('tradie')).toBe('Experts');
  });
});
