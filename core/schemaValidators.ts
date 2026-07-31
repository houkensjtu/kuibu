import { Ajv } from "ajv";
import addFormatsRaw from "ajv-formats";

// ajv-formats' shipped types resolve to the whole module namespace (not the plugin
// function) under TS's "moduleResolution": "nodenext" - a known ajv-formats/TS
// interop gap. The runtime value is correct (verified: vitest/tsx run it fine);
// only tsc's static type is wrong, so cast it explicitly.
const addFormats = addFormatsRaw as unknown as (ajvInstance: Ajv) => Ajv;
import packSchema from "../schema/pack.schema.json" with { type: "json" };
import eventsSchema from "../schema/events.schema.json" with { type: "json" };
import type { ContentPack } from "../schema/types/pack.js";
import type { Event } from "../schema/types/events.js";

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

const validatePackSchema = ajv.compile<ContentPack>(packSchema);
const validateEventSchema = ajv.compile<Event>(eventsSchema);

export interface ValidationResult<T> {
  valid: boolean;
  data?: T;
  errors?: string[];
}

function formatErrors(errors: typeof validatePackSchema.errors): string[] {
  return (errors ?? []).map(
    (e) => `${e.instancePath || "/"} ${e.message ?? "invalid"}`,
  );
}

// validatePackSchema/validateEventSchema are ajv "ValidateFunction<T>"s, which double
// as TS user-defined type guards: `(data: unknown) => data is T`. So once `!validate...(data)`
// has returned early below, `data` is narrowed to T for the rest of the function - no cast needed.
export function validatePack(data: unknown): ValidationResult<ContentPack> {
  if (!validatePackSchema(data)) {
    return { valid: false, errors: formatErrors(validatePackSchema.errors) };
  }
  return { valid: true, data };
}

export function validateEvent(data: unknown): ValidationResult<Event> {
  if (!validateEventSchema(data)) {
    return { valid: false, errors: formatErrors(validateEventSchema.errors) };
  }
  return { valid: true, data };
}
