import { checksumRecords } from '../../../services/ingestion/src/police/integrity';
import { containsPoint, scopeKey, toPolicePolygon, validateArea } from '../../../services/ingestion/src/police/geometry';
import { monthSchema, snapshotSchema, type MonthResult, type MonthSnapshot } from '../../../services/ingestion/src/police/types';

export interface HistoricalMonth {
  month: string;
  status: 'available' | 'missing' | 'unavailable';
  recordCount: number | null;
  categories: Record<string, number> | null;
  locationTypes: { Force: number; BTP: number } | null;
  excludedOutsideArea: number | null;
  checksum: string | null;
  fetchedAt: string | null;
  code?: string;
}
export interface HistoricalSummary {
  kind: 'historical_context';
  visibility: 'internal';
  publicationAllowed: false;
  alertEligible: false;
  synthetic: boolean;
  sourceId: 'P01';
  sourceFamilyId: 'police-uk';
  scopeKey: string;
  status: 'available' | 'partial' | 'unavailable';
  total: number | null;
  months: HistoricalMonth[];
  limitations: string[];
}

/** Validate a saved snapshot before it can affect any count. */
export function validateSnapshot(input: unknown): MonthSnapshot {
  const snapshot = snapshotSchema.parse(input);
  validateArea(snapshot.area);
  if (scopeKey(snapshot.area) !== snapshot.scopeKey) throw new Error('The snapshot scope does not match its geometry.');
  const url = new URL(snapshot.sourceUrl);
  if (url.origin !== 'https://data.police.uk' || url.pathname !== '/api/crimes-street/all-crime' || url.username || url.password || url.hash) {
    throw new Error('The snapshot source is not the Police.uk street endpoint.');
  }
  if (url.searchParams.getAll('date').length !== 1 || url.searchParams.getAll('poly').length !== 1 ||
    [...url.searchParams.keys()].some(key => key !== 'date' && key !== 'poly') ||
    url.searchParams.get('date') !== snapshot.month || url.searchParams.get('poly') !== toPolicePolygon(snapshot.area)) {
    throw new Error('The source query does not match the snapshot scope.');
  }
  if (checksumRecords(snapshot.records) !== snapshot.recordsChecksum) throw new Error('The saved records failed their integrity check.');
  if (snapshot.records.some(record => record.month !== snapshot.month)) throw new Error('The snapshot contains another reporting month.');
  return snapshot;
}

/** Internal coarse summaries only. Public release requires a separate disclosure review. */
export function summarizeHistory(areaInput: unknown, monthsInput: unknown, results: MonthResult[]): HistoricalSummary {
  const area = validateArea(areaInput);
  if (!Array.isArray(monthsInput) || !monthsInput.length || monthsInput.length > 36) throw new Error('Request between one and 36 months.');
  const requested = monthsInput.map(month => monthSchema.parse(month)).sort();
  if (new Set(requested).size !== requested.length) throw new Error('Requested months must be distinct.');
  const key = scopeKey(area);
  const byMonth = new Map<string, MonthResult>();
  const modes = new Set<boolean>();
  for (const result of results) {
    if (!['available', 'missing', 'unavailable'].includes(result.status)) throw new Error('The result status is invalid.');
    const snapshot = result.status === 'available' ? validateSnapshot(result.snapshot) : null;
    const month = monthSchema.parse(snapshot?.month ?? ('month' in result ? result.month : undefined));
    if (!requested.includes(month) || byMonth.has(month)) throw new Error('Results must match distinct requested months.');
    if (snapshot && snapshot.scopeKey !== key) throw new Error('The snapshot belongs to another area or boundary version.');
    if (snapshot) modes.add(snapshot.synthetic);
    byMonth.set(month, result.status === 'available' ? { status: 'available', snapshot: snapshot! } : result);
  }
  if (modes.size > 1) throw new Error('Synthetic and real history must remain separate.');
  const months: HistoricalMonth[] = requested.map(month => {
    const result = byMonth.get(month);
    if (!result || result.status !== 'available') return { month, status: result?.status ?? 'missing', recordCount: null,
      categories: null, locationTypes: null, excludedOutsideArea: null, checksum: null, fetchedAt: null,
      code: result?.code ?? 'not_imported' };
    const snapshot = result.snapshot;
    const categories: Record<string, number> = Object.create(null);
    const locationTypes = { Force: 0, BTP: 0 };
    let recordCount = 0; let excludedOutsideArea = 0;
    for (const record of snapshot.records) {
      if (!containsPoint(area, [Number(record.location.longitude), Number(record.location.latitude)])) { excludedOutsideArea++; continue; }
      recordCount++;
      categories[record.category] = (categories[record.category] ?? 0) + 1;
      locationTypes[record.location_type]++;
    }
    return { month, status: 'available', recordCount, categories, locationTypes, excludedOutsideArea,
      checksum: snapshot.checksum, fetchedAt: snapshot.fetchedAt };
  });
  const available = months.filter(month => month.status === 'available').length;
  return { kind: 'historical_context', visibility: 'internal', publicationAllowed: false, alertEligible: false,
    synthetic: modes.has(true), sourceId: 'P01', sourceFamilyId: 'police-uk', scopeKey: key,
    status: available === months.length ? 'available' : available ? 'partial' : 'unavailable',
    total: available === months.length ? months.reduce((sum, month) => sum + month.recordCount!, 0) : null,
    months, limitations: [
      'Counts describe returned police records, not all incidents or current danger.',
      'Locations are anonymised. Boundary membership is approximate.',
      'An API identifier is not a police case reference.',
      'Historical proximity cannot confirm an individual community report.',
      'Do not add overlapping MPS totals to these counts.',
      'Public counts require approved disclosure rules. These summaries remain internal.',
    ] };
}
