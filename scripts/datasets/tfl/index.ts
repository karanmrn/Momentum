import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
export const DATA_URL='https://naptan.api.dft.gov.uk/v1/access-nodes?atcoAreaCodes=490,910,940&dataFormat=csv';
export const LICENCE_URL='https://www.data.gov.uk/dataset/ff93ffc1-6656-47d8-9155-85ea0b8f2251/naptan';
const MAX_BYTES=15_000_000;
export const anchors = [
 {name:'Camden Town Underground Station',atcoCode:'9400ZZLUCTN',pilotId:'camden_town',type:'MET',bounds:[-0.15,51.53,-0.13,51.55]},
 {name:'Camden Road Rail Station',atcoCode:'9100CMDNRD',pilotId:'camden_town',type:'RLY',bounds:[-0.15,51.53,-0.13,51.55]},
 {name:'Hounslow Central Underground Station',atcoCode:'9400ZZLUHWC',pilotId:'hounslow_town_centre',type:'MET',bounds:[-0.38,51.46,-0.35,51.49]},
 {name:'Hounslow East Underground Station',atcoCode:'9400ZZLUHWE',pilotId:'hounslow_town_centre',type:'MET',bounds:[-0.38,51.46,-0.35,51.49]},
 {name:'West Croydon Rail Station',atcoCode:'9100WCROYDN',pilotId:'west_croydon',type:'RLY',bounds:[-0.11,51.37,-0.09,51.39]},
 {name:'West Croydon Tram Stop',atcoCode:'9400ZZCRWCR',pilotId:'west_croydon',type:'MET',bounds:[-0.11,51.37,-0.09,51.39]},
];
export function parseCsv(text:string):Record<string,string>[] {
 if(Buffer.byteLength(text)>MAX_BYTES) throw Error('response_too_large');
 const table:string[][]=[]; let row:string[]=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++) {const c=text[i];
  if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
  else if(c===','&&!quoted){row.push(cell);cell='';}
  else if(c==='\n'&&!quoted){row.push(cell.replace(/\r$/,''));table.push(row);row=[];cell='';}
  else cell+=c;
 }
 if(quoted)throw Error('invalid_csv');
 if(cell||row.length){row.push(cell.replace(/\r$/,''));table.push(row);}
 const headers=table.shift(); if(!headers||!['ATCOCode','CommonName','Longitude','Latitude','StopType','Status'].every(k=>headers.includes(k)))throw Error('invalid_columns');
 if(table.length>100000)throw Error('too_many_rows');
 return table.filter(r=>r.some(Boolean)).map(r=>{if(r.length!==headers.length)throw Error('invalid_row');return Object.fromEntries(headers.map((h,i)=>[h,r[i]]));});
}
function within(row:Record<string,string>,bounds:number[]){return row.Longitude.trim()!==''&&row.Latitude.trim()!==''&&Number.isFinite(Number(row.Longitude))&&Number.isFinite(Number(row.Latitude))&&Number(row.Longitude)>=bounds[0]&&Number(row.Longitude)<=bounds[2]&&Number(row.Latitude)>=bounds[1]&&Number(row.Latitude)<=bounds[3];}
export function selectStops(rows:Record<string,string>[]) {
 const matches=anchors.map(anchor=>{
  const found=rows.filter(r=>r.ATCOCode===anchor.atcoCode);
  if(found.length!==1||found[0].CommonName!==anchor.name||found[0].StopType!==anchor.type||found[0].Status!=='active'||!within(found[0],anchor.bounds))throw Error('anchor_not_verified');
  return {pilotId:anchor.pilotId,match:'verified_source_identity',record:found[0]};
 });
 const buses=rows.filter(r=>r.CommonName==='West Croydon Bus Station'&&r.StopType==='BCT'&&r.Status==='active'&&within(r,[-0.11,51.37,-0.09,51.39])).map(record=>({pilotId:'west_croydon',match:'verified_source_identity',record}));
 if(!buses.length)throw Error('bus_station_missing');
 const unique=new Set([...matches,...buses].map(m=>m.record.ATCOCode));
 if(unique.size!==matches.length+buses.length)throw Error('duplicate_identity');
 return [...matches,...buses].map(m=>({...m,sourceId:'DFT-NAPTAN',live:false,facilitiesStatus:'not_supplied',pilotBoundaryMembership:'not_assessed'}));
}
export async function boundedFetch(url:string,limit:number) {
 const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(30000),headers:{'User-Agent':'StreetwiseResearch/1.0'}});
 if(!response.body)throw Error('empty_response');
 const reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
 try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit)throw Error('response_too_large');chunks.push(value);}}finally{await reader.cancel();}
 return {response,bytes:Buffer.concat(chunks)};
}
export async function collect(root:string) {
 const output=join(root,'.data/datasets/tfl'); await mkdir(output,{recursive:true,mode:0o700});
 const fetchedAt=new Date().toISOString();
 const liveUrl='https://api.tfl.gov.uk/StopPoint/Search?query=Camden%20Town';
 let live:Record<string,unknown>;
 try {const result=await boundedFetch(liveUrl,1_000_000);await writeFile(join(output,'tfl-search-response.bin'),result.bytes,{mode:0o600});live={sourceUrl:liveUrl,httpStatus:result.response.status,checksum:createHash('sha256').update(result.bytes).digest('hex'),status:result.response.ok?'search_response_only':'blocked',code:result.response.status===403?'http_403':'http_response',liveStatusCollected:false};}
 catch {live={sourceUrl:liveUrl,status:'unavailable',code:'request_failed',liveStatusCollected:false};}
 const {response,bytes}=await boundedFetch(DATA_URL,MAX_BYTES);
 if(!response.ok)throw Error(`naptan_http_${response.status}`);
 const rows=parseCsv(bytes.toString('utf8'));const selected=selectStops(rows);
 await writeFile(join(output,'naptan.csv'),bytes,{mode:0o600});
 await writeFile(join(output,'selected-stops.json'),JSON.stringify({sourceUrl:DATA_URL,fetchedAt,synthetic:false,live:false,publicationAllowed:false,records:selected},null,2),{mode:0o600});
 const status={schemaVersion:'1.0',fetchedAt,synthetic:false,publicationAllowed:false,live,staticFallback:{sourceId:'DFT-NAPTAN',publisher:'Department for Transport',sourceUrl:DATA_URL,licence:'UK Open Government Licence',licenceEvidence:LICENCE_URL,attribution:'Contains public sector information licensed under the Open Government Licence.',httpStatus:response.status,checksum:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,sourceRows:rows.length,selectedRecords:selected.length,lastModified:response.headers.get('last-modified'),dataKind:'static_transport_access_nodes',identities:selected.map(s=>({pilotId:s.pilotId,id:s.record.ATCOCode,name:s.record.CommonName,stopType:s.record.StopType,longitude:Number(s.record.Longitude),latitude:Number(s.record.Latitude),modified:s.record.ModificationDateTime??null,match:s.match})),rawPath:'.data/datasets/tfl/naptan.csv',selectedPath:'.data/datasets/tfl/selected-stops.json'},limitations:['Static stop registration does not confirm current service, staffing, accessibility, or working facilities.','Bounds validate named identity vicinity. They are not approved pilot boundaries.','National Rail and tram categories contain national rows. Only named anchor records are selected.','TfL live source remains unavailable. No denial bypass or alternate identity was used.']};
 await mkdir(join(root,'research/datasets'),{recursive:true});await writeFile(join(root,'research/datasets/tfl-status.json'),JSON.stringify(status,null,2));
 return status;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) collect(process.cwd()).then(s=>console.log(JSON.stringify({selected:s.staticFallback.selectedRecords,live:s.live.status,sourceRows:s.staticFallback.sourceRows}))).catch(()=>{console.error('Transport collection failed. No successful status is implied.');process.exitCode=1;});
