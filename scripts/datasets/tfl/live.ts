import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {z} from 'zod';
import {boundedFetch} from './index';
const targets=[['Camden Town','940GZZLUCTN','Camden Town Underground Station','camden_town',-0.14274,51.539292],['Camden Road','910GCMDNRD','Camden Road Rail Station','camden_town',-0.1387,51.541791],['Hounslow Central','940GZZLUHWC','Hounslow Central Underground Station','hounslow_town_centre',-0.36658,51.471295],['Hounslow East','940GZZLUHWE','Hounslow East Underground Station','hounslow_town_centre',-0.35647,51.473213],['West Croydon','HUBWCY','West Croydon','west_croydon',-0.1026,51.3784]] as const;
export function validIdentity(value:unknown,id:string,name:string,lon:number,lat:number):value is Record<string,any>{if(!value||typeof value!=='object')return false;const v=value as Record<string,any>;return v.id===id&&(v.name??v.commonName)===name&&typeof v.lon==='number'&&typeof v.lat==='number'&&Math.abs(v.lon-lon)<0.003&&Math.abs(v.lat-lat)<0.003;}
const lineSchema=z.object({id:z.string().regex(/^[a-z0-9-]{1,40}$/),name:z.string().min(1).max(200),modeName:z.string().min(1).max(40),lineStatuses:z.array(z.object({statusSeverity:z.number().int().min(0).max(99),statusSeverityDescription:z.string().trim().min(1).max(300)}).passthrough()).max(100)}).passthrough();
export function parseLines(input:unknown,requested:string[]){
 if(!requested.length||requested.length>20||new Set(requested).size!==requested.length)throw Error('invalid_line_request');
 const lines=z.array(lineSchema).max(20).parse(input);
 if(lines.length!==requested.length||new Set(lines.map(l=>l.id)).size!==requested.length||lines.some(l=>!requested.includes(l.id)))throw Error('incomplete_line_response');
 return lines.map(line=>({...line,operationalStatus:line.lineStatuses.length?'reported' as const:'unknown' as const}));
}
export function statusCoverage(lines:ReturnType<typeof parseLines>){const reported=lines.filter(l=>l.operationalStatus==='reported').length;return {lineCount:lines.length,reportedStatusLineCount:reported,unknownStatusLineCount:lines.length-reported,operationalStatusCoverage:reported===lines.length&&reported>0?'complete':reported>0?'partial':'unavailable',liveStatusCollected:reported>0};}
export async function collectLive(root:string){
 const output=join(root,'.data/datasets/tfl');const statusPath=join(root,'research/datasets/tfl-status.json');
 const status=JSON.parse(await readFile(statusPath,'utf8'));
 const requests:Record<string,unknown>[]=[];const stations:Record<string,unknown>[]=[];const lineIds=new Set<string>();
 async function get(path:string,file:string){const fetchedAt=new Date().toISOString();const sourceUrl=`https://api.tfl.gov.uk${path}`;const {response,bytes}=await boundedFetch(sourceUrl,2_000_000);await writeFile(join(output,file),bytes,{mode:0o600});requests.push({sourceUrl,fetchedAt,httpStatus:response.status,checksum:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,rawPath:`.data/datasets/tfl/${file}`});if(!response.ok)throw Error('source_denied');return JSON.parse(bytes.toString('utf8'));}
 try {
 for(const [query,id,name,pilotId,lon,lat] of targets){
  const search=await get(`/StopPoint/Search?query=${encodeURIComponent(query)}`,`search-${id}.json`);
  if(!Array.isArray(search.matches)||search.matches.length>100||!search.matches.some((m:unknown)=>validIdentity(m,id,name,lon,lat)))throw Error('identity_mismatch');
  const detail=await get(`/StopPoint/${id}`,`station-${id}.json`);
  if(!validIdentity(detail,id,name,lon,lat))throw Error('detail_mismatch');
  function children(node:Record<string,any>,depth=0):Record<string,unknown>[] {if(depth>3)return [];const found:Record<string,unknown>[]=[{id:node.id,name:node.commonName,stopType:node.stopType,modes:node.modes,latitude:node.lat,longitude:node.lon,additionalProperties:node.additionalProperties??[]}];for(const l of node.lines??[])if(typeof l.id==='string'&&/^[a-z0-9-]{1,40}$/.test(l.id))lineIds.add(l.id);for(const c of (node.children??[]).slice(0,100))found.push(...children(c,depth+1));return found;}
  stations.push({pilotId,id,name,identityMatch:'verified_tfl_search_and_detail',nodes:children(detail)});
 }
 const lines=[...lineIds].sort();if(lines.length>100)throw Error('too_many_lines');const lineResults:ReturnType<typeof parseLines>=[];
 for(let i=0;i<Math.min(lines.length,100);i+=20){const batch=lines.slice(i,i+20);const result=await get(`/Line/${batch.join(',')}/Status`,`line-status-${i/20}.json`);lineResults.push(...parseLines(result,batch));}
 const collected={fetchedAt:new Date().toISOString(),sourceId:'TFL-UNIFIED',synthetic:false,publicationAllowed:false,stations,lineStatuses:lineResults,...statusCoverage(lineResults),statusScope:'whole_line_not_local_safety',facilitiesScope:'published_properties_not_live_working_confirmation'};
 await writeFile(join(output,'selected-tfl.json'),JSON.stringify(collected,null,2),{mode:0o600});
 status.live={status:'collected',client:'Node fetch with truthful StreetwiseResearch/1.0 user agent',priorDefaultPythonRequest:'HTTP 403; no bypass used',sourceId:'TFL-UNIFIED',licence:'TfL transport data terms',attribution:'Powered by TfL Open Data',licenceReview:'Official transparency page confirms separate transport-data terms; full terms page retrieval timed out. Public release remains disabled.',licenceUrl:'https://tfl.gov.uk/corporate/terms-and-conditions/transport-data-service',requests,stations:stations.map(({nodes,...s})=>s),stationCount:stations.length,...statusCoverage(lineResults),selectedPath:'.data/datasets/tfl/selected-tfl.json'};
 status.limitations=status.limitations.filter((s:string)=>!s.startsWith('TfL live source'));
 status.limitations.push('TfL status is a retrieval-time snapshot for entire lines. It is not proof of local danger or current service after retrieval.','NaPTAN ATCO codes and TfL grouped StopPoint IDs are separate identifiers. Preserve both source namespaces.');
 } catch {status.live={status:'partial_or_unavailable',requests,verifiedStationCount:stations.length,liveStatusCollected:false,code:'request_or_identity_failed'};}
 await writeFile(statusPath,JSON.stringify(status,null,2));return status.live;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)collectLive(process.cwd()).then(s=>console.log(JSON.stringify({status:s.status,stations:s.stationCount,lines:s.lineCount}))).catch(()=>{console.error('TfL collection failed.');process.exitCode=1;});
