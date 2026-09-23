import { Lead } from './lead';
import { decideWorkflowMove } from './workflow-move';

const leadId = '92d60e65-14f0-4d4f-b9ae-062c8f685213';

function contacted() {
  return Lead.create({
    id: leadId,
    source: 'SYNTHETIC',
    sourceReference: 'listing-1',
    phone: '+905551112233',
    receivedAt: new Date('2026-09-23T08:00:00.000Z'),
  })
    .markContactPending()
    .markContacted();
}

describe('workflow policy v1', () => {
  it('records interest only after contact and refuses a price transition', () => {
    const moved = contacted().applyWorkflowMove('INTERESTED', null);
    expect(moved.snapshot()).toMatchObject({ status: 'INTERESTED', version: 4 });
    expect(
      decideWorkflowMove({
        from: 'CONTACTED',
        to: 'QUOTE_READY',
        previousStatus: null,
        resumeStatus: null,
        reasonCode: null,
      }),
    ).toEqual({ ok: false, code: 'GATE_CLOSED', gate: 'PRICING_NOT_AVAILABLE' });
    expect(
      decideWorkflowMove({
        from: 'NEW',
        to: 'CONTACT_PENDING',
        previousStatus: null,
        resumeStatus: null,
        reasonCode: null,
      }),
    ).toMatchObject({ ok: false, code: 'USE_CONTACT_FLOW' });
  });

  it('returns a silent lead only to the stored contacted state', () => {
    const silent = contacted().applyWorkflowMove('NO_RESPONSE', null);
    const reviewed = silent.applyWorkflowMove('MANUAL_REVIEW', null);
    const restored = reviewed.applyWorkflowMove('CONTACTED', null);

    expect(silent.snapshot()).toMatchObject({
      status: 'NO_RESPONSE',
      resumeStatus: 'CONTACTED',
    });
    expect(restored.snapshot()).toMatchObject({
      status: 'CONTACTED',
      resumeStatus: undefined,
    });
    expect(() => silent.applyWorkflowMove('INTERESTED', null)).toThrow('INVALID_LEAD_TRANSITION');
  });

  it('qualifies only from an internal ready flag', () => {
    const interested = contacted().applyWorkflowMove('INTERESTED', null);
    const qualifying = interested.applyWorkflowMove('QUALIFYING', null);
    expect(qualifying.snapshot().status).toBe('QUALIFYING');
    expect(() => qualifying.applyWorkflowMove('QUALIFIED', null)).toThrow(
      'INVALID_LEAD_TRANSITION',
    );
    const qualified = qualifying.applyWorkflowMove('QUALIFIED', null, true);
    expect(qualified.snapshot().status).toBe('QUALIFIED');
    const job = qualified
      .applyWorkflowMove('QUOTE_READY', null, { quoteReady: true })
      .applyWorkflowMove('QUOTE_SENT', null, { quoteSent: true })
      .applyWorkflowMove('NEGOTIATING', null, { negotiating: true })
      .applyWorkflowMove('CUSTOMER_ACCEPTED', null, { acceptanceReady: true })
      .applyWorkflowMove('JOB_READY', null, { jobReady: true });
    expect(job.snapshot().status).toBe('JOB_READY');
    expect(
      decideWorkflowMove({
        from: 'QUALIFIED',
        to: 'QUOTE_READY',
        previousStatus: null,
        resumeStatus: null,
        reasonCode: null,
      }),
    ).toEqual({ ok: false, code: 'GATE_CLOSED', gate: 'PRICING_NOT_AVAILABLE' });
    expect(
      decideWorkflowMove({
        from: 'NEW',
        to: 'QUALIFIED',
        previousStatus: null,
        resumeStatus: null,
        reasonCode: null,
      }),
    ).toEqual({ ok: false, code: 'GATE_CLOSED', gate: 'REQUIREMENTS_NOT_AVAILABLE' });
  });

  it('closes a lead only with a fixed reason and then stops', () => {
    const closed = contacted().applyWorkflowMove('CLOSED_LOST', 'NOT_INTERESTED');
    expect(closed.snapshot().status).toBe('CLOSED_LOST');
    expect(() => closed.applyWorkflowMove('INTERESTED', null)).toThrow('INVALID_LEAD_TRANSITION');
    expect(() => contacted().applyWorkflowMove('CLOSED_LOST', null)).toThrow(
      'INVALID_LEAD_TRANSITION',
    );
  });
});
