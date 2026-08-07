import { validatePack } from "../../../core/schemaValidators";
import { checkPackReferences } from "../../../core/checkPackReferences";
import type { ContentPack } from "../../../schema/types/pack";

/** Mirrors cli/loadPack.ts's SUPPORTED_SCHEMA_VERSION -- keep the two in sync by hand until schema_version bumps often enough to be worth sharing. */
export const SUPPORTED_SCHEMA_VERSION = "0.1.0";

export class PackLoadError extends Error {}

/**
 * The shared tail of "seven files fetched over HTTP" and "one file picked
 * from disk": validate shape, gate on schema_version, then check
 * references (dangling ids, out-of-range answer_index -- schema validation
 * alone doesn't catch either, see core/checkPackReferences.ts). Both the
 * fetch path (loadPack.ts) and the import path (importBundle.ts) end here.
 * `sourceLabel` is whatever identifies the input to the caller -- a book id
 * for a fetch, a filename for an upload -- so error messages stay useful
 * either way.
 */
export function packFromCombined(combined: unknown, sourceLabel: string): ContentPack {
  const result = validatePack(combined);
  if (!result.valid) {
    throw new PackLoadError(`Content pack validation failed (${sourceLabel}):\n${result.errors.join("\n")}`);
  }

  const pack = result.data;
  if (pack.manifest.schema_version !== SUPPORTED_SCHEMA_VERSION) {
    throw new PackLoadError(
      `Incompatible content pack schema_version: pack declares "${pack.manifest.schema_version}", ` +
        `this reader only supports "${SUPPORTED_SCHEMA_VERSION}".`,
    );
  }

  const referenceErrors = checkPackReferences(pack);
  if (referenceErrors.length > 0) {
    throw new PackLoadError(`Content pack reference check failed (${sourceLabel}):\n${referenceErrors.join("\n")}`);
  }

  return pack;
}
