import { getMessageLayoutType, getPreferredSenderName, getRenderedSenderName } from './chatSenderDisplay';

describe('chatSenderDisplay', () => {
  it('uses display name when available', () => {
    expect(getPreferredSenderName({ displayName: 'Alex' }, 'homeowner')).toBe('Alex');
  });

  it('prefers profile first and last name when available', () => {
    expect(getPreferredSenderName({}, 'homeowner', { firstName: 'Zafar', lastName: 'Ali' })).toBe('Zafar Ali');
  });

  it('falls back to Client/Expert labels instead of email', () => {
    expect(getPreferredSenderName({ displayName: '' }, 'homeowner')).toBe('Client');
    expect(getPreferredSenderName({}, 'tradie')).toBe('Expert');
  });

  it('never renders plain email for the other participant fallback', () => {
    const label = getRenderedSenderName(
      {
        senderUid: 'other',
        senderRole: 'homeowner',
        senderName: 'owner@example.com',
      },
      { uid: 'me', displayName: 'Sam' },
      'tradie'
    );
    expect(label).toBe('Client');
  });

  it('uses current user preferred name for own messages', () => {
    const label = getRenderedSenderName(
      {
        senderUid: 'me',
        senderRole: 'tradie',
        senderName: 'old@example.com',
      },
      { uid: 'me', displayName: '' },
      'tradie'
    );
    expect(label).toBe('Expert');
  });

  it('uses sender profile name for other participant messages', () => {
    const label = getRenderedSenderName(
      {
        senderUid: 'other',
        senderRole: 'homeowner',
        senderName: 'old@example.com',
      },
      { uid: 'me', displayName: 'Sam' },
      'tradie',
      { firstName: 'Zafar', lastName: 'Ali' }
    );
    expect(label).toBe('Zafar Ali');
  });

  it('derives message layout type for mine/other/system alignment', () => {
    expect(getMessageLayoutType({ messageType: 'system', senderUid: 'me' }, 'me')).toBe('system');
    expect(getMessageLayoutType({ messageType: 'text', senderUid: 'me' }, 'me')).toBe('mine');
    expect(getMessageLayoutType({ messageType: 'text', senderUid: 'other' }, 'me')).toBe('other');
  });
});

