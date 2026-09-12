import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { areas, type PilotId } from '../../../packages/contracts/index';

const sourceDate = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/).nullable();
export const prioritySchema = z.object({
  issue: z.string().max(20000), action: z.string().max(30000),
  'issue-date': sourceDate, 'action-date': sourceDate,
});
const rowsSchema = z.array(prioritySchema).max(100);
const neighbourhoodSchema=z.object({force:z.literal('metropolitan'),neighbourhood:z.string().regex(/^E\d{8}N?$/)});
const sha=(value:string)=>createHash('sha256').update(value).digest('hex');
export function priorityEvidence(pilotId:PilotId, sourceUrl:string, retrievedAt:string, data:unknown, synthetic=false) {
  if(!areas.some(area=>area.id===pilotId))throw new Error('Invalid pilot.');
  const url=new URL(sourceUrl);
  if(url.origin!=='https://data.police.uk'||!/^\/api\/metropolitan\/E\d{8}N?\/priorities$/.test(url.pathname)||url.search||url.hash)throw new Error('Invalid source.');
  z.string().datetime().parse(retrievedAt);
  const rows=rowsSchema.parse(data);
  const snapshotId=sha(JSON.stringify(rows));
  const nodes:Record<string,unknown>[]=[];
  const edges:Record<string,unknown>[]=[];
  rows.forEach((row,index)=>{
    const base=`police-priority:${pilotId}:${snapshotId}:${index}`;
    if(row.issue.trim())nodes.push({id:`${base}:issue`,pilotId,kind:'issue_published_by_police',text:row.issue,
      sourceDate:row['issue-date'],timePrecision:row['issue-date']?'day':'unknown',sourceUrl,retrievedAt,sourceFamily:'police-uk',
      provenanceType:'police_published_statement',independentCommunityReport:false,publicationAllowed:false,synthetic});
    if(row.action.trim())nodes.push({id:`${base}:action`,pilotId,kind:'action_published_by_police',text:row.action,
      sourceDate:row['action-date'],timePrecision:row['action-date']?'day':'unknown',sourceUrl,retrievedAt,sourceFamily:'police-uk',
      provenanceType:'police_published_statement',completionVerified:false,publicationAllowed:false,synthetic});
    if(row.issue.trim()&&row.action.trim())edges.push({id:`${base}:response`,from:`${base}:action`,to:`${base}:issue`,
      relation:'SOURCE_STATES_RESPONSE_TO',method:'same_official_priority_record',sourceUrl,sourceSnapshot:snapshotId,
      causalClaim:false,independentCorroboration:false,publicationAllowed:false});
  });
  return {schemaVersion:'1.0',snapshotId,pilotId,sourceUrl,retrievedAt,publicationAllowed:false,synthetic,nodes,edges};
}
async function request(url:string) {
  const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(8000)});
  if(!response.ok||!response.body)throw new Error(`HTTP ${response.status}`);
  const reader=response.body.getReader();const chunks:Uint8Array[]=[];let bytes=0;
  try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>1_000_000)throw new Error('Response exceeds limit.');chunks.push(part.value);}}
  finally{await reader.cancel();}
  const raw=Buffer.concat(chunks).toString('utf8');return {raw,data:JSON.parse(raw),checksum:sha(raw)};
}
export async function collectPriorities(outputRoot:string) {
  await mkdir(outputRoot,{recursive:true,mode:0o700});
  const results=[];
  for(const area of areas){
    const fetchedAt=new Date().toISOString();
    let sourceUrl='https://data.police.uk/docs/method/neighbourhood-priorities/';
    try{
      const [lat,lon]=area.center;
      const lookupUrl=`https://data.police.uk/api/locate-neighbourhood?q=${lat},${lon}`;
      const lookup=await request(lookupUrl);const location=neighbourhoodSchema.parse(lookup.data);
      sourceUrl=`https://data.police.uk/api/metropolitan/${location.neighbourhood}/priorities`;
      const response=await request(sourceUrl);const rows=rowsSchema.parse(response.data);
      const evidence=priorityEvidence(area.id,sourceUrl,fetchedAt,rows);
      await writeFile(join(outputRoot,`${area.id}-lookup.json`),lookup.raw,{mode:0o600});
      await writeFile(join(outputRoot,`${area.id}-raw.json`),response.raw,{mode:0o600});
      await writeFile(join(outputRoot,`${area.id}-evidence.json`),JSON.stringify(evidence,null,2),{mode:0o600});
      const dates=rows.flatMap(row=>[row['issue-date'],row['action-date']]).filter((v):v is string=>!!v).sort();
      results.push({pilotId:area.id,status:rows.length?'acquired':'partial',sourceUrl,lookupUrl,fetchedAt,
        neighbourhoodId:location.neighbourhood,priorityCount:rows.length,issueCount:evidence.nodes.filter(n=>n.kind==='issue_published_by_police').length,
        actionCount:evidence.nodes.filter(n=>n.kind==='action_published_by_police').length,sourceAssertedLinks:evidence.edges.length,
        firstSourceDate:dates[0]??null,lastSourceDate:dates.at(-1)??null,checksum:response.checksum,
        geographyDescription:'Police neighbourhood containing the research anchor; not an approved pilot boundary.',
        licence:'Open Government Licence v3.0',publicationAllowed:false,
        limitations:['Police-published priorities are not independent community reports.','Action wording may describe plans, not completed work.','Publication dates do not prove current local conditions.']});
    }catch(error){results.push({pilotId:area.id,status:'blocked',sourceUrl,fetchedAt,priorityCount:0,
      publicationAllowed:false,limitations:['Priority acquisition failed. Missing data is not absence of local issues.'],error:error instanceof Error&&/^HTTP \d+$/.test(error.message)?error.message:'source_or_schema_unavailable'});}
  }
  return {schemaVersion:'1.0',generatedAt:new Date().toISOString(),areas:results};
}
