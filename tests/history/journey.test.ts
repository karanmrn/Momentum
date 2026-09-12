import { afterEach, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPoliceClient } from '../../services/ingestion/src/police/client';
import { type ApprovedArea, type PoliceRecord } from '../../services/ingestion/src/police/types';
import { runBackfill, readBackfill } from '../../scripts/backfill/index';
import { summarizeHistory } from '../../packages/history/src/index';

const area:ApprovedArea={pilotId:'camden_town',boundaryVersion:'fictional-e2e-1',boundaryStatus:'approved',
  reviewedBy:'synthetic-test-only',reviewedAt:'2026-09-12T00:00:00Z',crs:'EPSG:4326',
  geometry:{type:'Polygon',coordinates:[[[-.145,51.538],[-.14,51.538],[-.14,51.541],[-.145,51.541],[-.145,51.538]]]}};
const directories:string[]=[];
afterEach(async()=>{await Promise.all(directories.splice(0).map(path=>rm(path,{recursive:true,force:true})));});
it('imports, reloads, summarizes, refreshes and recovers through the actual client and disk store', async()=>{
  const record:PoliceRecord={id:null,persistent_id:null,month:'2026-07',category:'burglary',location_type:'BTP',
    location:{latitude:'51.539',longitude:'-.142',street:{id:1,name:'Synthetic station'}}};
  let rows=[record,structuredClone(record)];
  let unavailable=false;
  const requested:URL[]=[];
  const fetchImpl:typeof fetch=async(input,init)=>{
    expect(init?.redirect).toBe('error');
    const url=new URL(String(input));requested.push(url);
    expect(url.origin).toBe('https://data.police.uk');
    if(url.pathname.endsWith('crimes-street-dates'))return Response.json([{date:'2026-07','stop-and-search':[]}]);
    if(url.pathname.endsWith('crime-categories'))return Response.json([{url:'burglary',name:'Burglary'}]);
    expect(url.pathname).toBe('/api/crimes-street/all-crime');
    expect(url.searchParams.get('date')).toBe('2026-07');
    expect(url.searchParams.get('poly')).toBe('51.538,-0.145:51.538,-0.14:51.541,-0.14:51.541,-0.145');
    return unavailable?new Response('',{status:503}):Response.json(rows);
  };
  const client=createPoliceClient({fetchImpl,now:()=>new Date('2026-09-12T00:00:00Z'),synthetic:true});
  const outputDir=await mkdtemp(join(tmpdir(),'police-journey-'));directories.push(outputDir);
  const input={area,months:['2026-07'],outputDir,client};
  const read=async()=>summarizeHistory(area,input.months,await readBackfill(outputDir,area,input.months));
  await runBackfill(input);
  const first=await read();expect(first.total).toBe(2);expect(first.months[0].locationTypes).toEqual({Force:0,BTP:2});
  expect(first).toMatchObject({publicationAllowed:false,alertEligible:false,synthetic:true,visibility:'internal'});
  await runBackfill(input);expect((await read()).total).toBe(2);
  rows=[record];await runBackfill(input);expect((await read()).total).toBe(1);
  unavailable=true;await runBackfill(input);expect(await read()).toMatchObject({status:'unavailable',total:null});
  unavailable=false;rows=[];await runBackfill(input);expect(await read()).toMatchObject({status:'available',total:0});
  expect(requested).toHaveLength(15);
});
