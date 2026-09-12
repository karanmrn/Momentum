import { z } from 'zod';
import { pilotSchema } from '../contracts/index.js';

const time = z.string().datetime();
const text = z.string().min(1).max(3000);
export const transportCoordinatesSchema = z.tuple([
  z.number().finite().min(-90).max(90), z.number().finite().min(-180).max(180),
]);
const sourceUrl = z.string().url().refine(value => {
  const url = new URL(value);
  return url.origin === 'https://api.tfl.gov.uk' && !url.username && !url.password && !url.search && !url.hash;
});
const provenance = {
  sourceUrl, sourceLabel: z.literal('Powered by TfL Open Data'),
  observedAt: z.null(), fetchedAt: time,
};
export const transportStationSchema = z.object({
  id: z.string().regex(/^[A-Z0-9]{3,30}$/), name: text, pilotId: pilotSchema,
  coordinates: transportCoordinatesSchema,
  coordinateMeaning: z.literal('station_reference'),
  status: z.enum(['unknown', 'reported_disruption']), description: text,
  availability: z.literal('unknown'), retrievalStatus: z.enum(['available', 'unavailable']),
  ...provenance,
}).strict();
export const transportLineSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/), name: text,
  status: z.enum(['unknown', 'reported']), description: text,
  scope: z.literal('whole_line'), ...provenance,
}).strict();
const base = {
  pilotId: pilotSchema, status: z.enum(['available', 'partial', 'unavailable']),
  fetchedAt: time, expiresAt: time, sourceId: z.literal('TFL-UNIFIED'),
  sourceUrl, sourceLabel: z.literal('Powered by TfL Open Data'), observedAt: z.null(),
  synthetic: z.literal(false), limitations: z.array(text).min(1).max(15),
};
export const transportSnapshotSchema = z.object({
  ...base, stations: z.array(transportStationSchema).max(2), lines: z.array(transportLineSchema).max(3),
}).strict().refine(value => value.stations.every(station => station.pilotId === value.pilotId), 'pilot_mismatch')
  .refine(value => Date.parse(value.expiresAt) > Date.parse(value.fetchedAt), 'invalid_expiry');

export const trafficCameraSchema = z.object({
  id: z.string().regex(/^JamCams_[A-Za-z0-9._-]{1,80}$/), name: text,
  pilotId: pilotSchema, coordinates: transportCoordinatesSchema,
  coordinateMeaning: z.literal('camera_reference'), status: z.literal('metadata_only'),
  availability: z.literal('unknown'), ...provenance,
}).strict();
export const trafficCameraSnapshotSchema = z.object({
  ...base, cameras: z.array(trafficCameraSchema).max(50), scope: z.literal('one_mile_research_circle'),
}).strict().refine(value => value.cameras.every(camera => camera.pilotId === value.pilotId), 'pilot_mismatch')
  .refine(value => Date.parse(value.expiresAt) > Date.parse(value.fetchedAt), 'invalid_expiry');

export type TransportSnapshot = z.infer<typeof transportSnapshotSchema>;
export type TransportStation = z.infer<typeof transportStationSchema>;
export type TransportLine = z.infer<typeof transportLineSchema>;
export type TrafficCameraSnapshot = z.infer<typeof trafficCameraSnapshotSchema>;
export type CameraSnapshot = TrafficCameraSnapshot;
export type TrafficCamera = z.infer<typeof trafficCameraSchema>;
