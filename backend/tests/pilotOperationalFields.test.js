'use strict';

const {
  getCanonicalPilotServiceAreas,
  readAcceptingJobs,
  readServiceAreas,
  parseAcceptingJobsInput,
  parseServiceAreasInput,
  hasEnabledPilotServiceArea,
} = require('../src/utils/pilotOperationalFields');

describe('pilot operational fields', () => {
  it('exposes canonical Inner Melbourne areas only', () => {
    expect(getCanonicalPilotServiceAreas()).toEqual([
      'Melbourne',
      'Southbank',
      'Docklands',
      'South Yarra',
      'Prahran',
      'St Kilda',
      'Richmond',
      'Carlton',
    ]);
  });

  it('accepts boolean acceptingJobs values', () => {
    expect(parseAcceptingJobsInput(true)).toEqual({ ok: true, value: true });
    expect(parseAcceptingJobsInput(false)).toEqual({ ok: true, value: false });
  });

  it('rejects non-boolean acceptingJobs', () => {
    expect(parseAcceptingJobsInput('true').ok).toBe(false);
    expect(parseAcceptingJobsInput(1).ok).toBe(false);
    expect(parseAcceptingJobsInput(null).ok).toBe(false);
  });

  it('treats missing/legacy acceptingJobs as not accepting', () => {
    expect(readAcceptingJobs({})).toBe(false);
    expect(readAcceptingJobs({ acceptingJobs: undefined })).toBe(false);
    expect(readAcceptingJobs({ acceptingJobs: 'true' })).toBe(false);
    expect(readAcceptingJobs({ acceptingJobs: 1 })).toBe(false);
    expect(readAcceptingJobs({ acceptingJobs: true })).toBe(true);
  });

  it('accepts canonical service areas and dedupes', () => {
    const parsed = parseServiceAreasInput(['Richmond', 'richmond', 'Carlton']);
    expect(parsed.ok).toBe(true);
    expect(parsed.value).toEqual(['Richmond', 'Carlton']);
  });

  it('rejects unsupported service areas', () => {
    const parsed = parseServiceAreasInput(['Richmond', 'Geelong']);
    expect(parsed.ok).toBe(false);
    expect(parsed.code).toBe('UNSUPPORTED_SERVICE_AREA');
  });

  it('rejects non-array serviceAreas', () => {
    expect(parseServiceAreasInput('Richmond').ok).toBe(false);
    expect(parseServiceAreasInput({ suburb: 'Richmond' }).ok).toBe(false);
  });

  it('allows empty serviceAreas but they are not launch-ready geography', () => {
    expect(parseServiceAreasInput([])).toEqual({ ok: true, value: [] });
    expect(hasEnabledPilotServiceArea([])).toBe(false);
  });

  it('reads missing legacy serviceAreas as empty and ignores home-base', () => {
    expect(readServiceAreas({})).toEqual([]);
    expect(readServiceAreas({
      serviceLocation: { suburb: 'Richmond', state: 'VIC', postcode: '3121' },
    })).toEqual([]);
    expect(readServiceAreas({ serviceAreas: ['Sydney', 'Carlton'] })).toEqual(['Carlton']);
  });
});
