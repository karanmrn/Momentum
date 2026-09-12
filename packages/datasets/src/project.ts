import { z } from 'zod';
import { type PilotId } from '../../contracts/index';
import { parseDatasetCoverage, type DatasetCoverageRecord } from './coverage';
const text=z.string();const time=z.string().datetime();const month=z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/);
const policeArea=z.object({areaId:text,status:z.enum(['downloaded','partial','unavailable']),downloadedMonths:z.array(month).max(36),retrievedAt:time.nullable()});
const policeSchema=z.object({areas:z.array(policeArea)});
const station=z.object({pilotId:text,name:text,id:text});
const tflSchema=z.object({fetchedAt:time,live:z.object({status:z.literal('collected'),stations:z.array(station).min(1),requests:z.array(z.object({fetchedAt:time})).min(1)}),
 staticFallback:z.object({sourceUrl:z.string().url(),identities:z.array(z.object({pilotId:text})).min(1)})});
const staticSchema=z.object({fetchedAt:time,staticFallback:z.object({sourceUrl:z.string().url(),identities:z.array(z.object({pilotId:text})).min(1)})});
const onsSchema=z.object({status:z.literal('downloaded'),fetchedAt:time,queryUrl:z.string().url(),pilots:z.array(z.object({pilotId:text,counts:z.array(z.object({geographyName:text,geographyCode:text})).min(1)}))});
const prioritiesSchema=z.object({areas:z.array(z.object({pilotId:text,status:z.literal('acquired'),fetchedAt:time,sourceUrl:z.string().url(),geographyDescription:text,priorityCount:z.number().int().positive(),limitations:z.array(text),firstSourceDate:text.nullable(),lastSourceDate:text.nullable()}))});
const ids: PilotId[]=['hounslow_town_centre','camden_town','west_croydon'];
/** Rebuild a complete dated projection. Missing or invalid collection results become blocked cards. */
export function buildDatasetCoverage(input:{police?:unknown;tfl?:unknown;ons?:unknown;priorities?:unknown},generatedAt:string){
 const p=policeSchema.safeParse(input.police),t=tflSchema.safeParse(input.tfl),n=staticSchema.safeParse(input.tfl),o=onsSchema.safeParse(input.ons);
 // Priority failures are area-specific. Do not discard successful neighbours.
 const q=z.object({areas:z.array(z.unknown())}).safeParse(input.priorities);
 const records:DatasetCoverageRecord[]=[];
 for(const pilotId of ids){
  function missing(id:string,title:string,sourceKind:DatasetCoverageRecord['sourceKind'],sourceUrl:string,geographyDescription:string):DatasetCoverageRecord{
   return {id,title,pilotId,sourceKind,status:'blocked',sourceUrl,geographyDescription,acquiredMonths:[],latestMonth:null,fetchedAt:null,
    acquiredUnits:null,unitLabel:sourceKind==='historical_police'?'monthly source files':null,recordCount:null,
    limitations:['No valid acquisition result is available. Missing data does not mean no incidents or problems.']};
  }
  const police=missing('police-street','Historical police records','historical_police','https://data.police.uk/docs/method/crime-street/','Source-defined one-mile radius around the research anchor. This is not an approved town-centre boundary.');
  const area=p.success?p.data.areas.find(r=>r.areaId===pilotId):undefined;
  if(area&&area.status!=='unavailable'&&area.downloadedMonths.length&&area.retrievedAt)Object.assign(police,{
   status:area.status==='downloaded'?'acquired':'partial',acquiredMonths:area.downloadedMonths,latestMonth:[...area.downloadedMonths].sort().at(-1),
   fetchedAt:area.retrievedAt,acquiredUnits:area.downloadedMonths.length,
   limitations:['These files contain historical records and published outcome categories, not a complete account of police activity.',
    'Approximate locations cannot confirm that a community report describes the same event.',
    'Crime totals remain unpublished. Source-circle records are not approved pilot totals.']});
  records.push(police);
  const transport=missing('tfl-stations','Transport stations and line status','transport','https://api.tfl.gov.uk/','Requested station and interchange references for this research area.');
  const stations=t.success?t.data.live.stations.filter(r=>r.pilotId===pilotId):[];
  if(t.success&&stations.length)Object.assign(transport,{status:'acquired',fetchedAt:t.data.live.requests.map(r=>r.fetchedAt).sort().at(-1),
   geographyDescription:stations.map(r=>r.name).join('; '),acquiredUnits:stations.length,unitLabel:'verified station groups',
   limitations:['Station details and line responses were downloaded at the stated time. This snapshot is not a continuously updated feed.',
    'A line with no published status remains unknown. A line disruption does not establish personal danger.',
    'Transport data use separate TfL terms. Raw records remain internal.']});
  records.push(transport);
  const staticStops=missing('naptan-stops','Transport stop references','transport','https://naptan.api.dft.gov.uk/','Selected official station and interchange access records for the research locations.');
  const stops=n.success?n.data.staticFallback.identities.filter(r=>r.pilotId===pilotId):[];
  if(n.success&&stops.length)Object.assign(staticStops,{status:'acquired',fetchedAt:n.data.fetchedAt,sourceUrl:n.data.staticFallback.sourceUrl,
   acquiredUnits:stops.length,unitLabel:'static stop references',limitations:['NaPTAN provides static identities. It does not confirm current arrivals, access or staff availability.']});
  records.push(staticStops);
  const census=missing('ons-population','Census population context','official_statistics','https://www.nomisweb.co.uk/datasets/c2021ts001','Statistical geographies associated with the research anchor. These are not pilot boundaries.');
  const counts=o.success?o.data.pilots.find(r=>r.pilotId===pilotId)?.counts:undefined;
  if(o.success&&counts)Object.assign(census,{status:'acquired',acquiredMonths:['2021-03'],latestMonth:'2021-03',fetchedAt:o.data.fetchedAt,sourceUrl:o.data.queryUrl,
   geographyDescription:counts.map(r=>`${r.geographyName} (${r.geographyCode})`).join('; ')+'; selected through the nearest postcode to the research anchor.',
   acquiredUnits:counts.length,unitLabel:'Census statistical-area rows',limitations:[
    'Census Day: 21 March 2021. These are statistical-area resident counts, not town-centre populations or current footfall.',
    'The nearest-postcode lookup does not prove that the anchor lies inside that statistical area.',
    'LSOA and MSOA totals overlap. Do not add them or use them as pilot crime-rate denominators.']});
  records.push(census);
  const priority=missing('police-priorities','Police priorities and action updates','civic','https://data.police.uk/docs/method/neighbourhood-priorities/','Police neighbourhood containing the research anchor; not an approved pilot boundary.');
  for(const raw of q.success?q.data.areas:[]){
   const parsed=prioritiesSchema.shape.areas.element.safeParse(raw);if(!parsed.success||parsed.data.pilotId!==pilotId)continue;
   const value=parsed.data;Object.assign(priority,{status:'acquired',fetchedAt:value.fetchedAt,sourceUrl:value.sourceUrl,
    geographyDescription:value.geographyDescription,acquiredUnits:value.priorityCount,unitLabel:'published priority pairs',
    limitations:[...value.limitations,`Published issue/action dates range from ${value.firstSourceDate?.slice(0,10)??'unknown'} to ${value.lastSourceDate?.slice(0,10)??'unknown'}.`]});
  }
  records.push(priority);
  records.push({id:'community-observations',title:'Independent community observations',pilotId,sourceKind:'community',status:'not_collected',
   acquiredMonths:[],latestMonth:null,fetchedAt:null,sourceUrl:'',geographyDescription:'No genuine recent community dataset has been imported for this pilot.',
   recordCount:null,acquiredUnits:null,unitLabel:null,limitations:['The app demonstration reports are fictional. They are not evidence of real incidents.',
    'Police-published priorities are not independent community corroboration.','A permitted public source or consented observation is needed before comparing actual community claims.']});
 }
 const result={schemaVersion:'1.0' as const,generatedAt,records};parseDatasetCoverage(result);return result;
}
