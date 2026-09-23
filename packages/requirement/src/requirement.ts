export const REQUIREMENT_SCHEMA_VERSION = 'regular-home-helper-v1';

const REQUIRED = ['days_per_week', 'working_hours', 'start_date'] as const;
const SPECIAL = new Set(['LIVE_IN', 'CHILDCARE', 'COOKING']);
const HOURS = /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export type FieldSource = 'HUMAN' | 'FAKE_MODEL';
export type SpecialRequirement = 'LIVE_IN' | 'CHILDCARE' | 'COOKING';

export interface RequirementField {
  name: string;
  value: string;
  confidence: number;
  source: FieldSource;
}

export interface RequirementSnapshot {
  version: number;
  schemaVersion: typeof REQUIREMENT_SCHEMA_VERSION;
  confirmed: Record<string, string>;
  evidenceCount: number;
  specialRequirements: SpecialRequirement[];
  missingFields: string[];
  contradictions: string[];
  ready: boolean;
}

export function assessRequirements(input: {
  fields: RequirementField[];
  specialRequirements: string[];
}):
  | { ok: true; snapshot: Omit<RequirementSnapshot, 'version'> }
  | { ok: false; code: 'INVALID_REQUIREMENT' } {
  const confirmed: Record<string, string> = {};
  const contradictions = new Set<string>();
  let evidenceCount = 0;

  for (const field of input.fields) {
    if (!isKnown(field.name) || !validValue(field.name, field.value)) {
      return { ok: false, code: 'INVALID_REQUIREMENT' };
    }
    if (field.confidence < 0 || field.confidence > 1) {
      return { ok: false, code: 'INVALID_REQUIREMENT' };
    }
    if (field.source === 'FAKE_MODEL') {
      if (field.confidence >= 1) {
        return { ok: false, code: 'INVALID_REQUIREMENT' };
      }
      evidenceCount += 1;
      continue;
    }
    if (field.source !== 'HUMAN' || field.confidence !== 1) {
      return { ok: false, code: 'INVALID_REQUIREMENT' };
    }
    if (confirmed[field.name] && confirmed[field.name] !== field.value) {
      contradictions.add(field.name);
    }
    confirmed[field.name] = field.value;
  }

  const specialRequirements: SpecialRequirement[] = [];
  for (const code of input.specialRequirements) {
    if (!SPECIAL.has(code)) {
      return { ok: false, code: 'INVALID_REQUIREMENT' };
    }
    if (!specialRequirements.includes(code as SpecialRequirement)) {
      specialRequirements.push(code as SpecialRequirement);
    }
  }

  const missingFields = REQUIRED.filter((name) => !confirmed[name]);
  return {
    ok: true,
    snapshot: {
      schemaVersion: REQUIREMENT_SCHEMA_VERSION,
      confirmed,
      evidenceCount,
      specialRequirements,
      missingFields: [...missingFields],
      contradictions: [...contradictions],
      ready: missingFields.length === 0 && contradictions.size === 0,
    },
  };
}

export function fakeExtract(input: { text?: string; fields: RequirementField[] }): {
  fields: RequirementField[];
  rejected: string[];
} {
  if (input.text && input.text.trim().length > 0) {
    return { fields: [], rejected: ['FREE_TEXT_NOT_ACCEPTED'] };
  }
  const fields: RequirementField[] = [];
  const rejected: string[] = [];
  for (const field of input.fields) {
    const assessed = assessRequirements({ fields: [field], specialRequirements: [] });
    if (!assessed.ok || field.source !== 'FAKE_MODEL') {
      rejected.push(field.name || 'UNKNOWN');
      continue;
    }
    fields.push(field);
  }
  return { fields, rejected };
}

function isKnown(name: string): boolean {
  return (
    REQUIRED.includes(name as (typeof REQUIRED)[number]) ||
    name === 'language_requirement' ||
    name === 'tasks'
  );
}

function validValue(name: string, value: string): boolean {
  if (name === 'days_per_week') {
    return /^[1-7]$/.test(value);
  }
  if (name === 'working_hours') {
    return HOURS.test(value);
  }
  if (name === 'start_date') {
    return DATE.test(value);
  }
  if (name === 'language_requirement' || name === 'tasks') {
    return /^[a-z_]{1,40}$/.test(value);
  }
  return false;
}
