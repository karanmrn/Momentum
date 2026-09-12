import type { HelpCard, SourceCard } from '../../packages/contracts/index.js';

// Selected factual directory entries, checked against the council map on 12 September 2026.
// This is a curated projection, not a copy of the raw directory response.
const checkedAt = '2026-09-12T12:10:03.699Z';
const sourceUrl = 'https://www.camden.gov.uk/safe-havens';
const common = {pilotId:'camden_town' as const,availability:'unconfirmed' as const,sourceLabel:'Camden Council Safe Havens map',checkedAt,kind:'venue' as const};
const venues: HelpCard[] = [
 {...common,id:'camden-castlehaven',name:'Castlehaven Community Centre',
  address:'23 Castlehaven Road, NW1 8RU',coordinates:[51.54284,-0.14452],url:sourceUrl,
  summary:'Council-listed Safe Haven. Ask staff for support; current staffing is unconfirmed.',
  schedule:'Council listing: Monday to Friday, 09:30 to 17:30.',services:['Staff assistance','Onward travel support']},
 {...common,id:'camden-ice-wharf',name:'The Ice Wharf',
  address:'Jamestown Road, NW1 7BY',coordinates:[51.54087,-0.14566],url:sourceUrl,
  summary:'Council-listed Safe Haven. The operator limits under-18 entry to 12:00 to 21:00. Assistance availability is unconfirmed.',
  schedule:'Check the venue for current hours and entry conditions.',services:['Staff assistance']},
 {...common,id:'camden-market-security',name:'Camden Market Security Office',
  address:'Camden Lock Place, NW1 8AF',coordinates:[51.54172,-0.14671],url:sourceUrl,
  summary:'Council-listed Safe Haven at the market security office. Ask staff about assistance.',
  schedule:'Council listing: daily, 09:00 to 18:00.',services:['Staff assistance','Onward travel support']},
 {...common,id:'camden-hawley-security',name:'Hawley Wharf Security Office',
  address:'Water Lane, NW1 8NZ',coordinates:[51.54128,-0.14452],url:sourceUrl,
  summary:'Council-listed Safe Haven at Hawley Wharf. Current access and staffing are unconfirmed.',
  schedule:'The council lists 24-hour operation. This is not a live availability check.',services:['Staff assistance','Onward travel support']},
];
// Council notice checked on 12 September. Friday service keeps its normal location.
const relocationCheckedAt = "2026-09-12T14:18:31.995Z";
const relocationPlanningStart = Date.parse("2026-09-12T02:30:00+01:00");
const relocationEnd = Date.parse("2026-09-13T02:30:00+01:00");
function clock(now: Date): number {
  const value = now.getTime();
  if (!Number.isFinite(value)) throw new Error("Invalid help listing clock.");
  return value;
}
/** Cache entries cannot cross a dated listing change. */
export function getCamdenHelpCacheTtl(now = new Date()): number {
  const at = clock(now);
  const next = [relocationPlanningStart, relocationEnd].find(
    (boundary) => boundary > at,
  );
  return next === undefined ? 300000 : Math.min(300000, next - at);
}
export function getCamdenHelp(now = new Date()): HelpCard[] {
  const at = clock(now);
  const relocated = at >= relocationPlanningStart && at < relocationEnd;
  const bus: HelpCard = relocated
    ? {
        id: "C01",
        pilotId: "camden_town",
        name: "Camden Safety Bus",
        summary:
          "Council notice for Saturday 12 September: the bus is planned outside KOKO on Camden High Street. Deployment remains unconfirmed.",
        url: "https://www.camden.gov.uk/staying-safe-at-night",
        availability: "unconfirmed",
        schedule:
          "Saturday 12 September 2026, 21:30 to Sunday 13 September, 02:30, Europe/London.",
        address: "Outside KOKO on Camden High Street",
        sourceLabel: "Camden Council",
        checkedAt: relocationCheckedAt,
        services: ["Phone charging", "Water", "First aid"],
        kind: "service",
      }
    : normalBus();
  // No verified coordinates exist for this service location. Do not invent a map pin.
  return [bus, ...structuredClone(venues)];
}
function normalBus(): HelpCard {
  return {
    id: "C01",
    pilotId: "camden_town",
    name: "Camden Safety Bus",
    summary:
      "Council-listed support outside Camden Town station. Deployment tonight is unconfirmed.",
    url: "https://www.camden.gov.uk/staying-safe-at-night",
    availability: "unconfirmed",
    schedule:
      "Friday and Saturday, 21:30 to 02:30 the next day, Europe/London.",
    address: "Outside Camden Town Underground station",
    sourceLabel: "Camden Council",
    checkedAt,
    services: ["Phone charging", "Water", "First aid"],
    kind: "service",
  };
}
export function getCamdenDirectorySource(): SourceCard {
 return {id:'C02',title:'Camden help directory',summary:'Four selected council-listed venues and the Safety Bus. Check access and staffing before travelling.',
 url:sourceUrl,status:'available',sourceKind:'council_directory',fetchedAt:checkedAt,publishedAt:null,synthetic:false,
 scope:'Selected Camden Town listings. Not a complete borough or approved pilot inventory.',
 recordCount:5,recordCountLabel:'Selected help listings',checkedAt,coverage:'directory',attribution:'London Borough of Camden'};
}
