const {
  paymentDisplayTaskTitle,
  pickSuburb,
  formatLocality,
  resolvePaymentTaskPhraseDetailed,
  normalizeJobTypeKey,
} = require('../../shared/paymentDisplayTaskTitle');

describe('paymentDisplayTaskTitle', () => {
  it('mounting_mirrors + Docklands → Hang mirrors in Docklands', () => {
    expect(
      paymentDisplayTaskTitle({
        title: 'Mirrors in Docklands',
        jobType: 'mounting_mirrors',
        jobTypeLabel: 'Mirrors',
        locationSuburb: 'Docklands',
      })
    ).toBe('Hang mirrors in Docklands');
  });

  it('weak title Mirrors in Docklands + jobType mounting_mirrors → Hang mirrors in Docklands', () => {
    expect(
      paymentDisplayTaskTitle({
        title: 'Mirrors in Docklands',
        jobType: 'mounting_mirrors',
        locationSuburb: 'Docklands',
      })
    ).toBe('Hang mirrors in Docklands');
  });

  it('hanging_picture_frames + south yarra → Install picture frames in South Yarra', () => {
    expect(
      paymentDisplayTaskTitle({
        title: 'Picture frames in south yarra',
        jobType: 'hanging_picture_frames',
        jobTypeLabel: 'Picture frames',
        locationSuburb: 'south yarra',
      })
    ).toBe('Install picture frames in South Yarra');
  });

  it('alias mounting_picture_frames resolves to hanging_picture_frames expertLabel', () => {
    expect(normalizeJobTypeKey('mounting_picture_frames')).toBe('hanging_picture_frames');
    expect(
      paymentDisplayTaskTitle({
        title: 'Picture frames in South Yarra',
        jobType: 'mounting_picture_frames',
        locationSuburb: 'South Yarra',
      })
    ).toBe('Install picture frames in South Yarra');
  });

  it('furniture_assembly_flat_pack + Richmond → Flat-pack furniture assembly in Richmond', () => {
    expect(
      paymentDisplayTaskTitle({
        title: 'Assembly in Richmond',
        jobType: 'furniture_assembly_flat_pack',
        jobTypeLabel: 'Flat-pack furniture',
        locationSuburb: 'Richmond',
      })
    ).toBe('Flat-pack furniture assembly in Richmond');
  });

  it('minor_repairs_door_hinge + Carlton → Repair door hinges in Carlton', () => {
    expect(
      paymentDisplayTaskTitle({
        title: 'Door hinge fix in carlton',
        jobType: 'minor_repairs_door_hinge',
        jobTypeLabel: 'Door hinge fix',
        locationSuburb: 'carlton',
      })
    ).toBe('Repair door hinges in Carlton');
  });

  it('curtains_blinds_install + Prahran → Install blinds in Prahran', () => {
    expect(
      paymentDisplayTaskTitle({
        title: 'Blind installation in Prahran',
        jobType: 'curtains_blinds_install',
        locationSuburb: 'Prahran',
      })
    ).toBe('Install blinds in Prahran');
  });

  it('hanging_artwork + St Kilda → Hang artwork in St Kilda', () => {
    expect(
      paymentDisplayTaskTitle({
        title: 'Artwork in St Kilda',
        jobType: 'hanging_artwork',
        jobTypeLabel: 'Artwork',
        locationSuburb: 'St Kilda',
      })
    ).toBe('Hang artwork in St Kilda');
  });

  it('wall_patch_touchup_small_holes + Melbourne → Patch small wall holes in Melbourne', () => {
    expect(
      paymentDisplayTaskTitle({
        title: 'Small holes in Melbourne',
        jobType: 'wall_patch_touchup_small_holes',
        jobTypeLabel: 'Small holes',
        locationSuburb: 'Melbourne',
      })
    ).toBe('Patch small wall holes in Melbourne');
  });

  it('alias assembly_flat_pack resolves to furniture_assembly_flat_pack', () => {
    expect(
      paymentDisplayTaskTitle({
        title: '',
        jobType: 'assembly_flat_pack',
        locationSuburb: 'Richmond',
      })
    ).toBe('Flat-pack furniture assembly in Richmond');
  });

  it('resolves expertLabel from jobTypeLabel alone when it matches a catalog label', () => {
    const { phrase, fromCatalog } = resolvePaymentTaskPhraseDetailed({
      jobTypeLabel: 'Mirrors',
    });
    expect(fromCatalog).toBe(true);
    expect(phrase).toBe('Hang mirrors');
  });

  it('keeps meaningful custom titles that are more specific than catalogue + suburb', () => {
    expect(
      paymentDisplayTaskTitle({
        title: 'Hang three large mirrors in lobby in Docklands',
        jobType: 'mounting_mirrors',
        locationSuburb: 'Docklands',
      })
    ).toBe('Hang three large mirrors in lobby in Docklands');
  });

  it('returns stored title when it does not share locality suffix pattern', () => {
    expect(
      paymentDisplayTaskTitle({
        title: 'Emergency leak fix',
        jobTypeLabel: 'Plumbing',
        locationSuburb: 'Richmond',
      })
    ).toBe('Emergency leak fix');
  });

  it('uses catalog fallback when title missing', () => {
    expect(
      paymentDisplayTaskTitle({
        title: '',
        jobType: 'furniture_assembly_flat_pack',
        jobTypeLabel: 'Flat-pack furniture',
        locationSuburb: 'Richmond',
      })
    ).toBe('Flat-pack furniture assembly in Richmond');
  });

  it('does not emit weak Label in Suburb from unmatched one-word label', () => {
    expect(
      paymentDisplayTaskTitle({
        title: 'Custom mirror wall install',
        jobTypeLabel: 'Mystery',
        locationSuburb: 'Carlton',
      })
    ).toBe('Custom mirror wall install');
  });

  it('uses task reference when title empty and phrase not catalogue-safe', () => {
    expect(
      paymentDisplayTaskTitle({
        id: 'job-ref-test',
        title: '',
        taskNumber: '99',
        jobTypeLabel: 'Mystery',
        locationSuburb: 'Carlton',
      })
    ).toBe('TSK-0099');
  });

  it('returns Task when nothing is available', () => {
    expect(paymentDisplayTaskTitle({})).toBe('Task');
  });
});

describe('buildPostedJobTitleFromPhase1Row', () => {
  const { buildPostedJobTitleFromPhase1Row } = require('../../shared/paymentDisplayTaskTitle');
  const { phase1ExpertiseCatalog } = require('../../shared/expertiseCatalog');

  it('uses expertLabel and title-cased suburb', () => {
    const row = phase1ExpertiseCatalog.find((x) => x.key === 'mounting_mirrors');
    expect(buildPostedJobTitleFromPhase1Row(row, { suburb: 'docklands' })).toBe('Hang mirrors in Docklands');
  });
});

describe('pickSuburb', () => {
  it('reads locationSuburb first', () => {
    expect(pickSuburb({ locationSuburb: 'Docklands', location: 'Other, VIC' })).toBe('Docklands');
  });

  it('falls back to first segment of location label', () => {
    expect(pickSuburb({ location: 'South Yarra, VIC 3141' })).toBe('South Yarra');
  });
});

describe('formatLocality', () => {
  it('title-cases multi-word suburbs', () => {
    expect(formatLocality('south yarra')).toBe('South Yarra');
  });
});
