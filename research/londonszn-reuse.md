# London map reuse

Source: https://github.com/karanmrn/londonszn

Reviewed source commit: `6d50b4beb7c760fe54daa20c5b1b8390e3c49716`.
The source code has an Apache-2.0 licence.

## Implementation

The map adapts layer selection and shared point details from `components/map/MapLibreMap.tsx`.
Streetwise retains Leaflet and its existing source contracts.
The accessible list and markers use the same filtered records and selected identifier.
Help locations, transport references, and traffic camera references have separate controls.
Camera references are off by default.

The transport panel adapts visible-panel polling from `app/(app)/map/page.tsx`.
It stops polling when the tab or document is hidden.
Requests use the selected area and discard old responses after area changes.
Expired reports receive explicit labels. Failed requests do not create demonstration records.

The new public routes are `/api/public/transport` and `/api/public/traffic-cameras`.
Both require a supported `area` value. They need no account or location permission.
The transport adapter uses fixed TfL endpoints, bounded reads, validation, and shared cached requests.
It preserves retrieval time. Source observation time remains unknown.
Line reports describe the whole line. Station points are references, not entrances.

Camera metadata uses the existing one-mile research circles.
These circles are not approved pilot boundaries.
No camera images or videos are fetched or stored.
Camera operation and image capture time remain unknown.

## Excluded source behaviour

Invented departures, vehicle positions, crime scores, and neighbourhood rectangles were not copied.
Private feeds and mental-health workflows were not imported.
The internal OSM research projection remains unpublished.

## Live source check

A bounded read returned transport information for all three areas.
Five station references and five line associations were represented.
The camera metadata endpoint returned 1, 12, and 12 nearby records for Hounslow, Camden, and West Croydon.
This verifies metadata retrieval, not camera operation or personal safety.

## Review lesson

The reusable value is the interaction pattern.
Source meaning, expiry, and outage behaviour require stricter treatment in this application.

## Validation

- `npm run build`: passed, including TypeScript checking.
- `npm test`: 331 tests passed across 38 files.
- `npm run test:server`: native ESM startup passed.
- `playwright test`: all 18 browser journeys passed.
- Independent review verified source expiry, bounded requests, and source links.
- Desktop and mobile screenshots were inspected. The 320-pixel layout passed its overflow check.

Browser fixtures mock provider responses and map tiles.
The live source check was separate from automated tests.
