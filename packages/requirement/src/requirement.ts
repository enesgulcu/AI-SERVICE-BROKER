import {
  HOME_HELPER_SCHEMA_VERSION,
  requirementSchema,
  valueMatches,
  type RequirementSchemaDefinition,
} from './catalogue';

export const REQUIREMENT_SCHEMA_VERSION = HOME_HELPER_SCHEMA_VERSION;

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
  schemaVersion?: string;
  fields: RequirementField[];
  specialRequirements: string[];
}):
  | { ok: true; snapshot: Omit<RequirementSnapshot, 'version'> }
  | { ok: false; code: 'INVALID_REQUIREMENT' } {
  const schema = requirementSchema(input.schemaVersion ?? REQUIREMENT_SCHEMA_VERSION);
  if (!schema || schema.schemaVersion !== REQUIREMENT_SCHEMA_VERSION) {
    return { ok: false, code: 'INVALID_REQUIREMENT' };
  }

  const confirmed: Record<string, string> = {};
  const contradictions = new Set<string>();
  let evidenceCount = 0;
  const known = new Map(schema.fields.map((field) => [field.name, field]));

  for (const field of input.fields) {
    const definition = known.get(field.name);
    if (!definition || !valueMatches(definition.kind, field.value)) {
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

  const allowedSpecial = new Set(schema.specialRequirements);
  const specialRequirements: SpecialRequirement[] = [];
  for (const code of input.specialRequirements) {
    if (!allowedSpecial.has(code)) {
      return { ok: false, code: 'INVALID_REQUIREMENT' };
    }
    if (!specialRequirements.includes(code as SpecialRequirement)) {
      specialRequirements.push(code as SpecialRequirement);
    }
  }

  const missingFields = requiredNames(schema).filter((name) => !confirmed[name]);
  return {
    ok: true,
    snapshot: {
      schemaVersion: REQUIREMENT_SCHEMA_VERSION,
      confirmed,
      evidenceCount,
      specialRequirements,
      missingFields,
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

function requiredNames(schema: RequirementSchemaDefinition): string[] {
  return schema.fields.filter((field) => field.required).map((field) => field.name);
}
