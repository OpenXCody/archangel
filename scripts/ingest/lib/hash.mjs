// Hashes for intake: of a source record (so a later run can tell changed from
// the same) and of the file a run read.
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

/** A value as JSON with its keys in order, so the same record always reads the same. */
export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const keys = Object.keys(value).filter((key) => value[key] !== undefined).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}

/**
 * The hash of one source record: what the source said (`payload`), and the
 * version of the adapter that read it, so a change to how a source is read
 * shows as a change to every record. 128 bits, as hex.
 */
export function recordHash(payload, adapterVersion = 1) {
  return createHash('sha256').update(`v${adapterVersion}|${canonical(payload)}`).digest('hex').slice(0, 32);
}

/** The SHA-256 and size of a file, read as a stream. */
export async function fileHash(path) {
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
    bytes += chunk.length;
  }
  return { sha256: hash.digest('hex'), bytes };
}
