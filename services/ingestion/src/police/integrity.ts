import { createHash } from 'node:crypto';
import { recordSchema, type PoliceRecord } from './types';

/** Verify saved normalised records separately from the original HTTP response bytes. */
export function checksumRecords(records: PoliceRecord[]): string {
  return createHash('sha256').update(JSON.stringify(records.map(record => recordSchema.parse(record)))).digest('hex');
}
