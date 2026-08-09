import {
  fullTaskDisplayTitle,
  getJobDisplayLayers,
  normalizeJobTypeKey,
} from './jobDisplayFromJob';

describe('jobDisplayFromJob', () => {
  it('getJobDisplayLayers uses expertLabel for Job type when Phase 1 key known', () => {
    const layers = getJobDisplayLayers({
      jobType: 'mounting_mirrors',
      title: 'Mirrors in Docklands',
      locationSuburb: 'Docklands',
      jobTypeLabel: 'Mirrors',
    });
    expect(layers.categoryDisplayLabel).toBe('Mounting');
    expect(layers.taskTypeDisplayLabel).toBe('Hang mirrors');
    expect(layers.fullTaskDisplayTitle).toBe('Hang mirrors in Docklands');
  });

  it('fullTaskDisplayTitle matches catalogue wording for picture frames', () => {
    expect(
      fullTaskDisplayTitle({
        jobType: 'hanging_picture_frames',
        title: 'Picture frames in south yarra',
        locationSuburb: 'south yarra',
      })
    ).toBe('Install picture frames in South Yarra');
  });

  it('aliases mounting_picture_frames key', () => {
    expect(normalizeJobTypeKey('mounting_picture_frames')).toBe('hanging_picture_frames');
  });
});
