import { SANDBOX_FIRST_CONTACT_DRAFT, guardFirstContactDraft } from './first-contact-draft';

describe('first-contact draft guard', () => {
  it('accepts the sandbox template', () => {
    expect(guardFirstContactDraft(SANDBOX_FIRST_CONTACT_DRAFT)).toEqual([]);
  });

  it('rejects a promise or any text other than the sandbox template', () => {
    expect(guardFirstContactDraft(`${SANDBOX_FIRST_CONTACT_DRAFT} Net fiyat 1000 TL.`)).toEqual(
      expect.arrayContaining(['TEMPLATE_MISMATCH', 'PROMISE_LANGUAGE']),
    );
  });
});
