import { InMemoryLeadIngestionAdapter, IngestLead } from '@ai-service-broker/lead';
import { InMemoryFirstContactAdapter } from '../adapters/in-memory-first-contact.adapter';
import { DecideFirstContact } from './decide-first-contact';
import { ContactFlowError } from './first-contact.port';
import { PrepareFirstContact } from './prepare-first-contact';

const leadId = '92d60e65-14f0-4d4f-b9ae-062c8f685213';
const fingerprint = 'a'.repeat(64);

function ids(values: string[]): { next(): string } {
  return { next: () => values.shift() ?? '7c9e6679-7425-40de-944b-e07fc1f90ae7' };
}

async function seed(source = 'SYNTHETIC'): Promise<{
  leads: InMemoryLeadIngestionAdapter;
  contact: InMemoryFirstContactAdapter;
}> {
  const leads = new InMemoryLeadIngestionAdapter();
  await new IngestLead(
    leads,
    { now: () => new Date('2026-09-23T08:00:00.000Z') },
    { next: () => leadId },
    { next: () => '30ed6e26-dfaf-47f5-ac24-6db09622820a' },
  ).execute({
    idempotencyKey: 'lead:create-1',
    requestFingerprint: fingerprint,
    correlationId: 'request:trace-123',
    source,
    sourceReference: 'listing-1',
    phone: '+905551112233',
    customerName: 'Ayşe',
    listingText: 'gizli ilan metni',
    rawPayload: { note: 'evidence-only' },
  });
  return { leads, contact: new InMemoryFirstContactAdapter(leads) };
}

describe('first contact', () => {
  const clock = { now: () => new Date('2026-09-23T09:00:00.000Z') };

  it('reaches contacted only after human approval and keeps personal data out of records', async () => {
    const { leads, contact } = await seed();
    const prepare = new PrepareFirstContact(
      contact,
      clock,
      ids([
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
        '33333333-3333-4333-8333-333333333333',
        '44444444-4444-4444-8444-444444444444',
      ]),
    );
    const pending = await prepare.execute({
      idempotencyKey: 'contact:prepare-1',
      requestFingerprint: fingerprint,
      correlationId: 'request:trace-123',
      actorId: 'operator-1',
      leadId,
    });

    expect(pending.disposition).toBe('PENDING');
    expect(pending.draft).not.toContain('Ayşe');
    expect(pending.draft).not.toContain('gizli ilan metni');
    await expect(leads.findById(leadId)).resolves.toMatchObject({
      status: 'CONTACT_PENDING',
      version: 2,
    });

    const decision = new DecideFirstContact(
      contact,
      clock,
      ids(['55555555-5555-4555-8555-555555555555', '66666666-6666-4666-8666-666666666666']),
    );
    const approved = await decision.execute({
      idempotencyKey: 'contact:decide-1',
      requestFingerprint: 'b'.repeat(64),
      correlationId: 'request:trace-123',
      actorId: 'operator-1',
      reviewId: pending.reviewId,
      decision: 'APPROVE',
    });

    expect(approved).toMatchObject({
      disposition: 'APPROVED',
      delivery: 'MOCK_ACCEPTED',
    });
    await expect(leads.findById(leadId)).resolves.toMatchObject({
      status: 'CONTACTED',
      version: 3,
    });
    const recorded = JSON.stringify({ events: contact.events, audits: contact.audits });
    expect(recorded).not.toContain('+905551112233');
    expect(recorded).not.toContain('Ayşe');
    expect(recorded).not.toContain('gizli ilan metni');
    expect(recorded).not.toContain(pending.draft);
    expect(contact.events.map((event) => event.eventType)).toEqual([
      'ContactReviewOpened',
      'LeadContacted',
    ]);
  });

  it('does not send when the human rejects or the review has expired', async () => {
    const { leads, contact } = await seed();
    const prepare = new PrepareFirstContact(contact, clock, ids([]));
    const pending = await prepare.execute({
      idempotencyKey: 'contact:prepare-2',
      requestFingerprint: fingerprint,
      correlationId: 'request:trace-123',
      actorId: 'operator-1',
      leadId,
    });
    const rejected = await new DecideFirstContact(contact, clock, ids([])).execute({
      idempotencyKey: 'contact:decide-2',
      requestFingerprint: 'c'.repeat(64),
      correlationId: 'request:trace-123',
      actorId: 'operator-1',
      reviewId: pending.reviewId,
      decision: 'REJECT',
    });

    expect(rejected).toMatchObject({ disposition: 'REJECTED', delivery: 'NOT_SENT' });
    await expect(leads.findById(leadId)).resolves.toMatchObject({ status: 'NEW' });
    expect(contact.events.some((event) => event.eventType === 'LeadContacted')).toBe(false);
  });

  it('pauses an expired review without sending', async () => {
    const { contact } = await seed();
    const pending = await new PrepareFirstContact(contact, clock, ids([])).execute({
      idempotencyKey: 'contact:prepare-3',
      requestFingerprint: fingerprint,
      correlationId: 'request:trace-123',
      actorId: 'operator-1',
      leadId,
    });

    await expect(
      new DecideFirstContact(
        contact,
        { now: () => new Date('2026-09-25T09:00:00.000Z') },
        ids([]),
      ).execute({
        idempotencyKey: 'contact:decide-3',
        requestFingerprint: 'd'.repeat(64),
        correlationId: 'request:trace-123',
        actorId: 'operator-1',
        reviewId: pending.reviewId,
        decision: 'APPROVE',
      }),
    ).rejects.toMatchObject({ code: 'REVIEW_EXPIRED' });
    expect(contact.events.some((event) => event.eventType === 'LeadContacted')).toBe(false);
  });

  it('blocks an unapproved source before creating a review', async () => {
    const { contact } = await seed('SAHIBINDEN');

    await expect(
      new PrepareFirstContact(contact, clock, ids([])).execute({
        idempotencyKey: 'contact:prepare-4',
        requestFingerprint: fingerprint,
        correlationId: 'request:trace-123',
        actorId: 'operator-1',
        leadId,
      }),
    ).rejects.toBeInstanceOf(ContactFlowError);
    expect(contact.events).toHaveLength(0);
  });
});
