import { getPostJobFlowErrorPresentation, looksLikeInternalApiLeak, roleLabelForUi } from './userFacingApiErrors';

describe('userFacingApiErrors', () => {
  it('maps role keys to Client / Expert labels', () => {
    expect(roleLabelForUi('homeowner')).toBe('Client');
    expect(roleLabelForUi('tradie')).toBe('Expert');
  });

  it('detects internal API leaks', () => {
    expect(
      looksLikeInternalApiLeak('Forbidden: Requires role homeowner. Please re-login via /api/users/register.')
    ).toBe(true);
    expect(looksLikeInternalApiLeak('Please choose a shorter title')).toBe(false);
  });

  it('maps 403 role errors to blocked permission copy without echoing backend text', () => {
    const p = getPostJobFlowErrorPresentation({
      response: {
        status: 403,
        data: {
          message:
            'Forbidden: Requires role homeowner. Please re-login, or ensure your account was created via /api/users/register.',
        },
      },
    });
    expect(p.kind).toBe('blocked_permission');
    expect(p.body).toContain('Client');
    expect(p.body).not.toMatch(/homeowner|\/api\/|Forbidden/i);
    expect(p.title).toMatch(/couldn't continue your task post/i);
  });

  it('maps unknown server errors with internal wording to generic blocked copy', () => {
    const p = getPostJobFlowErrorPresentation({
      response: { status: 500, data: { message: 'homeowner profile missing' } },
    });
    expect(p.kind).toBe('blocked_permission');
  });
});
