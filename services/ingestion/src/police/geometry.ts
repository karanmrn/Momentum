import { createHash } from 'node:crypto';
import { areaSchema, type ApprovedArea } from './types';

type Point = [number, number];
const centres: Record<ApprovedArea['pilotId'], Point> = {
  hounslow_town_centre: [-0.3618, 51.4683], camden_town: [-0.1426, 51.5392], west_croydon: [-0.1023, 51.3784],
};
const cross = (a: Point, b: Point, c: Point) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const same = (a: Point, b: Point) => a[0] === b[0] && a[1] === b[1];
function onSegment(a: Point, b: Point, p: Point): boolean {
  return Math.abs(cross(a, b, p)) < 1e-12 && p[0] >= Math.min(a[0], b[0]) - 1e-12 &&
    p[0] <= Math.max(a[0], b[0]) + 1e-12 && p[1] >= Math.min(a[1], b[1]) - 1e-12 && p[1] <= Math.max(a[1], b[1]) + 1e-12;
}
function intersects(a: Point, b: Point, c: Point, d: Point): boolean {
  return onSegment(a, b, c) || onSegment(a, b, d) || onSegment(c, d, a) || onSegment(c, d, b) ||
    (cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0);
}

/** Validate a reviewed single-ring polygon. Approval must come from the geography owner. */
export function validateArea(input: unknown): ApprovedArea {
  const area = areaSchema.parse(input);
  const ring = area.geometry.coordinates[0];
  if (!same(ring[0], ring[ring.length - 1])) throw new Error('The polygon ring must be closed.');
  const vertices = ring.slice(0, -1);
  if (new Set(vertices.map(point => JSON.stringify(point))).size !== vertices.length) throw new Error('Polygon vertices must be distinct.');
  const [lon, lat] = centres[area.pilotId];
  // These broad limits restrict retrieval to the selected pilot vicinity, not an approved footprint.
  if (vertices.some(p => Math.abs(p[0] - lon) > 0.15 || Math.abs(p[1] - lat) > 0.1)) {
    throw new Error('The polygon is outside the selected pilot vicinity.');
  }
  for (let i = 0; i < vertices.length; i++) {
    const previous = vertices[(i + vertices.length - 1) % vertices.length];
    if (onSegment(previous, vertices[i], vertices[(i + 1) % vertices.length]) ||
      onSegment(vertices[i], vertices[(i + 1) % vertices.length], previous)) {
      throw new Error('Adjacent polygon edges must not overlap.');
    }
    for (let j = i + 2; j < vertices.length; j++) {
      if (i === 0 && j === vertices.length - 1) continue;
      if (intersects(ring[i], ring[i + 1], ring[j], ring[j + 1])) throw new Error('The polygon must not intersect itself.');
    }
  }
  // Translate coordinates before the shoelace sum to reduce cancellation near London.
  const twiceArea = vertices.reduce((sum, p, i) => {
    const q = vertices[(i + 1) % vertices.length];
    return sum + (p[0] - lon) * (q[1] - lat) - (q[0] - lon) * (p[1] - lat);
  }, 0);
  const squareKm = Math.abs(twiceArea) / 2 * 111.32 ** 2 * Math.cos(lat * Math.PI / 180);
  if (squareKm < 0.0001 || squareKm > 25) throw new Error('The polygon area must be between 0.0001 and 25 square kilometres.');
  return area;
}

/** The checksum binds a version to its geometry. A geometry edit cannot reuse cached counts. */
export function scopeKey(input: ApprovedArea): string {
  const area = validateArea(input);
  return createHash('sha256').update(JSON.stringify({ pilotId: area.pilotId, boundaryVersion: area.boundaryVersion,
    crs: area.crs, geometry: area.geometry })).digest('hex');
}
export function toPolicePolygon(input: ApprovedArea): string {
  return validateArea(input).geometry.coordinates[0].slice(0, -1).map(([lon, lat]) => `${lat},${lon}`).join(':');
}

/** Boundary points belong to the pilot. This does not remove source location uncertainty. */
export function containsPoint(area: ApprovedArea, point: Point): boolean {
  const ring = area.geometry.coordinates[0];
  let inside = false;
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i]; const b = ring[i + 1];
    if (onSegment(a, b, point)) return true;
    if ((a[1] > point[1]) !== (b[1] > point[1]) &&
      point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
