export const CLIENT_LABEL = 'Client';
export const EXPERT_LABEL = 'Expert';
export const TASK_EXPERT_LABEL = EXPERT_LABEL;

export function getRoleDisplayLabel(role) {
  if (role === 'homeowner') return CLIENT_LABEL;
  if (role === 'tradie') return EXPERT_LABEL;
  if (role === 'admin') return 'Admin';
  return 'User';
}

export function getRoleDisplayLabelPlural(role) {
  if (role === 'homeowner') return 'Clients';
  if (role === 'tradie') return 'Experts';
  if (role === 'admin') return 'Admins';
  return 'Users';
}
