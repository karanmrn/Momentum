import { z } from 'zod';
import { pilotSchema } from '../../../../packages/contracts/index';

export const monthSchema = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/);
export const pointSchema = z.tuple([z.number().finite().min(-180).max(180), z.number().finite().min(-90).max(90)]);
export const areaSchema = z.object({
  pilotId: pilotSchema,
  boundaryVersion: z.string().min(1).max(100),
  boundaryStatus: z.literal('approved'),
  reviewedBy: z.string().min(1).max(100),
  reviewedAt: z.string().datetime({ offset: true }),
  crs: z.literal('EPSG:4326'),
  geometry: z.object({ type: z.literal('Polygon'), coordinates: z.array(z.array(pointSchema).min(4).max(101)).length(1) }).strict(),
}).strict();
export type ApprovedArea = z.infer<typeof areaSchema>;
export const recordSchema = z.object({
  category: z.string().regex(/^[a-z][a-z-]{0,79}$/),
  persistent_id: z.string().max(100).nullable().optional(),
  id: z.number().int().nonnegative().nullable().optional(),
  month: monthSchema,
  location_type: z.enum(['Force', 'BTP']),
  location_subtype: z.string().max(200).nullable().optional(),
  location: z.object({
    latitude: z.string().max(30).refine(v => v.trim() !== '' && Number.isFinite(Number(v)) && Math.abs(Number(v)) <= 90),
    longitude: z.string().max(30).refine(v => v.trim() !== '' && Number.isFinite(Number(v)) && Math.abs(Number(v)) <= 180),
    street: z.object({ id: z.number().int().nonnegative(), name: z.string().max(500) }),
  }),
  outcome_status: z.object({ category: z.string().max(300), date: monthSchema }).nullable().optional(),
});
export type PoliceRecord = z.infer<typeof recordSchema>;
export const snapshotSchema = z.object({
  schemaVersion: z.literal('1.0'), parserVersion: z.literal('police-street/1'),
  sourceId: z.literal('P01'), sourceFamilyId: z.literal('police-uk'),
  scopeKey: z.string().regex(/^[a-f0-9]{64}$/), area: areaSchema, month: monthSchema,
  sourceUrl: z.string().url(), fetchedAt: z.string().datetime({ offset: true }),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
  taxonomyChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  recordsChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  records: z.array(recordSchema).max(10000),
  coverage: z.literal('complete_response'),
  synthetic: z.boolean(), publicationAllowed: z.literal(false), alertEligible: z.literal(false),
}).strict();
export type MonthSnapshot = z.infer<typeof snapshotSchema>;
export type MonthResult =
  | { status: 'available'; snapshot: MonthSnapshot }
  | { status: 'missing' | 'unavailable'; month: string; code: string; retryAfterSeconds?: number };
export interface Availability { months: string[]; fetchedAt: string; checksum: string; sourceUrl: string }
export interface CategoryList { month: string; categories: string[]; fetchedAt: string; checksum: string; sourceUrl: string }
export interface PoliceClient {
  availability(): Promise<Availability>;
  categories(month: string): Promise<CategoryList>;
  month(area: ApprovedArea, month: string, availability: Availability, categories: CategoryList): Promise<MonthResult>;
}
