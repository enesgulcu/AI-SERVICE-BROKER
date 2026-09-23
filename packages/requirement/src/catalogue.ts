const DAYS = /^[1-7]$/;
const HOURS = /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TOKEN = /^[a-z_]{1,40}$/;

export const HOME_HELPER_SCHEMA_VERSION = 'regular-home-helper-v1' as const;

export type FieldValueKind = 'days' | 'time_range' | 'date' | 'token';

export interface RequirementFieldDefinition {
  name: string;
  required: boolean;
  kind: FieldValueKind;
}

export interface RequirementSchemaDefinition {
  category: string;
  schemaVersion: string;
  active: boolean;
  fields: readonly RequirementFieldDefinition[];
  specialRequirements: readonly string[];
}

const HOME_HELPER: RequirementSchemaDefinition = {
  category: 'REGULAR_HOME_HELPER',
  schemaVersion: HOME_HELPER_SCHEMA_VERSION,
  active: true,
  fields: [
    { name: 'days_per_week', required: true, kind: 'days' },
    { name: 'working_hours', required: true, kind: 'time_range' },
    { name: 'start_date', required: true, kind: 'date' },
    { name: 'language_requirement', required: false, kind: 'token' },
    { name: 'tasks', required: false, kind: 'token' },
  ],
  specialRequirements: ['LIVE_IN', 'CHILDCARE', 'COOKING'],
};

const CATALOGUE: readonly RequirementSchemaDefinition[] = [HOME_HELPER];

export function activeRequirementSchemas(): readonly RequirementSchemaDefinition[] {
  return CATALOGUE.filter((schema) => schema.active);
}

export function requirementSchema(schemaVersion: string): RequirementSchemaDefinition | undefined {
  return CATALOGUE.find((schema) => schema.active && schema.schemaVersion === schemaVersion);
}

export function valueMatches(kind: FieldValueKind, value: string): boolean {
  if (kind === 'days') {
    return DAYS.test(value);
  }
  if (kind === 'time_range') {
    return HOURS.test(value);
  }
  if (kind === 'date') {
    return DATE.test(value);
  }
  return TOKEN.test(value);
}
