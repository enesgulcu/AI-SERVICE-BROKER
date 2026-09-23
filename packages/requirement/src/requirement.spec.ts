import { assessRequirements, fakeExtract } from './requirement';

const human = (name: string, value: string) => ({
  name,
  value,
  confidence: 1,
  source: 'HUMAN' as const,
});

describe('home-helper requirements', () => {
  it('is ready only when a human confirmed every required field', () => {
    const partial = assessRequirements({
      fields: [human('days_per_week', '5')],
      specialRequirements: ['COOKING'],
    });
    expect(partial.ok && partial.snapshot.ready).toBe(false);
    if (partial.ok) {
      expect(partial.snapshot.missingFields).toEqual(['working_hours', 'start_date']);
    }

    const ready = assessRequirements({
      fields: [
        human('days_per_week', '5'),
        human('working_hours', '09:00-17:00'),
        human('start_date', '2026-10-01'),
        { name: 'language_requirement', value: 'turkish', confidence: 0.4, source: 'FAKE_MODEL' },
      ],
      specialRequirements: ['COOKING'],
    });
    expect(ready.ok && ready.snapshot.ready).toBe(true);
    expect(ready.ok && ready.snapshot.evidenceCount).toBe(1);
  });

  it('does not turn free text or a model guess into a fact', () => {
    expect(fakeExtract({ text: 'her gün gelsin', fields: [] }).rejected).toEqual([
      'FREE_TEXT_NOT_ACCEPTED',
    ]);
    expect(
      assessRequirements({
        fields: [{ name: 'days_per_week', value: '5', confidence: 0.9, source: 'HUMAN' }],
        specialRequirements: [],
      }).ok,
    ).toBe(false);
  });
});
