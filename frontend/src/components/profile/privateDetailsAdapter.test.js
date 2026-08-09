import {
  normalizeBusinessName,
  normalizeAbn,
  dobPayloadFromInput,
  validateTradieDobOnSave,
  computeTradieFieldErrors,
  buildTradieProfilePayload,
} from './privateDetailsAdapter';

function tomorrowYmd() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

describe('privateDetailsAdapter', () => {
  it('normalizes business name and ABN values', () => {
    expect(normalizeBusinessName('  Acme    Services  ')).toBe('Acme Services');
    expect(normalizeAbn(' 12  345 678 901 ')).toBe('12345678901');
  });

  it('parses date payload from date input', () => {
    expect(dobPayloadFromInput('1999-12-31')).toEqual({ day: 31, month: 12, year: 1999 });
    expect(dobPayloadFromInput('')).toBeNull();
    expect(dobPayloadFromInput('31/12/1999')).toBeNull();
  });

  it('validates tradie DOB and blocks future dates', () => {
    expect(validateTradieDobOnSave(tomorrowYmd())).toBe('Date of birth cannot be in the future.');
    expect(validateTradieDobOnSave('1990-01-01')).toBe('');
  });

  it('returns field-level requirement errors for ABN and business name', () => {
    expect(
      computeTradieFieldErrors({
        businessNameRequired: true,
        abnRequired: true,
        businessName: '',
        abn: '',
      })
    ).toEqual({
      businessNameError: 'Business name is required for your business type.',
      abnError: 'ABN is required for your business type.',
    });

    expect(
      computeTradieFieldErrors({
        businessNameRequired: false,
        abnRequired: false,
        businessName: '',
        abn: '',
      })
    ).toEqual({
      businessNameError: '',
      abnError: '',
    });
  });

  it('builds tradie payload with private lock when confirmed', () => {
    const result = buildTradieProfilePayload({
      businessName: 'Acme Services',
      bio: 'Experienced and reliable with all odd jobs.',
      draftServiceLocation: { suburb: 'Sydney', state: 'NSW', postcode: '2000', label: 'Sydney NSW 2000' },
      draftDob: '1990-01-01',
      draftBusinessType: 'sole_trader',
      showAbn: true,
      abn: '12345678901',
      confirmedLock: true,
    });

    expect(result.error).toBe('');
    expect(result.payload).toEqual({
      businessName: 'Acme Services',
      bio: 'Experienced and reliable with all odd jobs.',
      serviceLocation: { suburb: 'Sydney', state: 'NSW', postcode: '2000', label: 'Sydney NSW 2000' },
      dob: { day: 1, month: 1, year: 1990 },
      businessType: 'sole_trader',
      abn: '12345678901',
      privateDetailsLock: true,
    });
  });
});
