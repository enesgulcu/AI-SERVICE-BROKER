# Conversation and risk catalogue

Status: Initial review-only catalogue. Signal weights, automatic blocking and
penalties stay closed by OD-007. A score never creates `BLOCKED` by itself.

| Situation                                                     | What the system does now                                   | Required later review                        |
| ------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------- |
| Unapproved lead source                                        | Refuses first contact with `SOURCE_NOT_APPROVED`           | Legal source authority, OD-013               |
| Missing automation disclosure, human path, or no-promise line | Rejects the draft                                          | Approved language, OD-003 and OD-015         |
| Price, refund, compensation, hiring, or guarantee language    | Rejects the draft                                          | Approved commercial wording                  |
| Customer listing text or name copied into the draft           | Rejected because the draft must match the sandbox template | Prompt-injection regression set              |
| Review expires before a decision                              | Records expiry, sends nothing, returns the lead to `NEW`   | Staffing and SLA, OD-019                     |
| Human rejects the draft                                       | Sends nothing and records the actor and reason             | Appeal/retry policy                          |
| Threat, harassment, or abuse in a future inbound message      | Not automated yet                                          | Human escalation, no punishment from a score |
| Opt-out or do-not-contact phrase                              | Not automated yet                                          | Suppression list and proof of consent        |
| Contradictory or sensitive personal detail                    | Not collected yet                                          | Quarantine and minimum-data rules, OD-016    |

Audit entries store the actor, action, entity reference and reason code. They do
not store the message body, phone number, or raw payload.
