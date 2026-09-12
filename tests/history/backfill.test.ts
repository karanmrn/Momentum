import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm, stat, open, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { monthRange, readBackfill, runBackfill } from '../../scripts/backfill/index';
import { PoliceSourceError } from '../../services/ingestion/src/police/client';
import { checksumRecords } from '../../services/ingestion/src/police/integrity';
import { scopeKey, toPolicePolygon } from '../../services/ingestion/src/police/geometry';
import type { ApprovedArea, PoliceClient, MonthSnapshot } from '../../services/ingestion/src/police/types';
const area: ApprovedArea = {pilotId:'camden_town',boundaryVersion:'synthetic-test-1',boundaryStatus:'approved',reviewedBy:'synthetic-test-only',reviewedAt:'2026-09-12T00:00:00Z',crs:'EPSG:4326',geometry:{type:'Polygon',coordinates:[[[-0.145,51.537],[-0.14,51.537],[-0.14,51.54],[-0.145,51.54],[-0.145,51.537]]]}};
const record = {category:'burglary',persistent_id:null,id:null,month:'2026-07',location_type:'Force' as const,location:{latitude:'51.538',longitude:'-0.142',street:{id:1,name:'Synthetic test street'}}};
function snapshot(target = area, checksum = 'a'.repeat(64)): MonthSnapshot { return {schemaVersion:'1.0',parserVersion:'police-street/1',sourceId:'P01',sourceFamilyId:'police-uk',scopeKey:scopeKey(target),area:target,month:'2026-07',sourceUrl:`https://data.police.uk/api/crimes-street/all-crime?${new URLSearchParams({date:'2026-07',poly:toPolicePolygon(target)})}`,fetchedAt:'2026-09-12T00:00:00Z',checksum,taxonomyChecksum:'b'.repeat(64),records:[record,record],recordsChecksum:checksumRecords([record,record]),coverage:'complete_response',synthetic:true,publicationAllowed:false,alertEligible:false}; }
function client(target = area): PoliceClient { return {availability:vi.fn(async()=>({months:['2026-07'],checksum:'c'.repeat(64),sourceUrl:'https://data.police.uk/api/crimes-street-dates',fetchedAt:'2026-09-12T00:00:00Z'})),categories:vi.fn(async month=>({month,categories:['burglary'],checksum:'b'.repeat(64),sourceUrl:'https://data.police.uk/api/crime-categories',fetchedAt:'2026-09-12T00:00:00Z'})),month:vi.fn(async()=>({status:'available' as const,snapshot:snapshot(target)}))}; }
const directories:string[]=[];
async function directory() { const d=await mkdtemp(join(tmpdir(),'police-test-')); directories.push(d); return d; }
afterEach(async()=>{await Promise.all(directories.splice(0).map(d=>rm(d,{recursive:true,force:true})));});
describe('internal backfill',()=>{
 it('preserves multiplicity, idempotence, and revised snapshots',async()=>{
 const outputDir=await directory(), api=client(); const input={area,months:['2026-07'],outputDir,client:api};
 const checkpoint=await runBackfill(input); expect(checkpoint.availability?.months).toEqual(['2026-07']); expect(checkpoint.availability?.checksum).toBe('c'.repeat(64)); const file=join(outputDir,scopeKey(area),'2026-07.json'); const original=await readFile(file,'utf8');
 await runBackfill(input); expect(await readFile(file,'utf8')).toBe(original); expect(JSON.parse(original).records).toHaveLength(2); expect((await stat(file)).mode & 0o777).toBe(0o600);
 api.month=async()=>({status:'available',snapshot:{...snapshot(area,'d'.repeat(64)),records:[record],recordsChecksum:checksumRecords([record])}});
 await runBackfill(input); expect(JSON.parse(await readFile(file,'utf8')).records).toHaveLength(1);
 const revisions=join(outputDir,scopeKey(area),'revisions','2026-07');
 const oldRevision=join(revisions,`${'a'.repeat(64)}-${'b'.repeat(64)}.json`);
 const newRevision=join(revisions,`${'d'.repeat(64)}-${'b'.repeat(64)}.json`);
 expect(JSON.parse(await readFile(oldRevision,'utf8')).records).toHaveLength(2);
 expect(JSON.parse(await readFile(newRevision,'utf8')).records).toHaveLength(1);
 expect((await stat(oldRevision)).mode & 0o777).toBe(0o600);
 expect((await stat(revisions)).mode & 0o777).toBe(0o700);
 const current=(await readBackfill(outputDir,area,['2026-07']))[0];
 expect(current.status).toBe('available'); if(current.status==='available') expect(current.snapshot.records).toHaveLength(1);
 });
 it('hides stale data after failure and recovers',async()=>{
 const outputDir=await directory(), api=client(); const input={area,months:['2026-07'],outputDir,client:api};
 await runBackfill(input); api.availability=async()=>{throw Error('failure');}; const failed=await runBackfill(input); expect(failed.availability).toBeUndefined();
 expect((await readBackfill(outputDir,area,['2026-07']))[0].status).toBe('unavailable');
 await runBackfill({...input,client:client()}); expect((await readBackfill(outputDir,area,['2026-07']))[0].status).toBe('available');
 });
 it('retains missing and failed months without zero snapshots',async()=>{
 const outputDir=await directory(), api=client(); api.month=async()=>{throw Error('failed');};
 const result=await runBackfill({area,months:['2026-06','2026-07'],outputDir,client:api});
 expect(result.months['2026-06'].status).toBe('missing'); expect(result.months['2026-07'].status).toBe('unavailable');
 });
 it('separates scopes and blocks concurrent readers and writers',async()=>{
 const outputDir=await directory(); await runBackfill({area,months:['2026-07'],outputDir,client:client()});
 const other={...area,boundaryVersion:'synthetic-test-2'}; expect((await readBackfill(outputDir,other,['2026-07']))[0].status).toBe('unavailable');
 await runBackfill({area:other,months:['2026-07'],outputDir,client:client(other)});
 const lock=await open(join(outputDir,scopeKey(area),'.lock'),'wx',0o600);
 try { await expect(runBackfill({area,months:['2026-07'],outputDir,client:client()})).rejects.toThrow('locked'); expect((await readBackfill(outputDir,area,['2026-07']))[0].status).toBe('unavailable'); } finally {await lock.close();}
 expect((await readBackfill(outputDir,other,['2026-07']))[0].status).toBe('available');
 });
 it('rejects corrupted snapshots and mismatched client scope',async()=>{
 const outputDir=await directory(), api=client();
 await runBackfill({area,months:['2026-07'],outputDir,client:api});
 const file=join(outputDir,scopeKey(area),'2026-07.json');
 await writeFile(file,JSON.stringify({...snapshot(),checksum:'e'.repeat(64)}));
 expect((await readBackfill(outputDir,area,['2026-07']))[0].status).toBe('unavailable');
 api.month=async()=>({status:'available',snapshot:snapshot({...area,boundaryVersion:'wrong-scope'})});
 const result=await runBackfill({area,months:['2026-07'],outputDir,client:api});
 expect(result.months['2026-07'].status).toBe('unavailable');
 });
 it('rejects changed records with original checksum and repairs from fresh evidence',async()=>{
 const outputDir=await directory(), api=client(); const input={area,months:['2026-07'],outputDir,client:api};
 await runBackfill(input);
 const file=join(outputDir,scopeKey(area),'2026-07.json');
 await writeFile(file,JSON.stringify({...snapshot(),records:[]}));
 const revision=join(outputDir,scopeKey(area),'revisions','2026-07',`${'a'.repeat(64)}-${'b'.repeat(64)}.json`);
 await writeFile(revision,JSON.stringify({...snapshot(),records:[]}));
 expect((await readBackfill(outputDir,area,['2026-07']))[0].status).toBe('unavailable');
 await runBackfill(input);
 const result=(await readBackfill(outputDir,area,['2026-07']))[0];
 expect(result.status).toBe('available');
 if(result.status==='available') expect(result.snapshot.records).toHaveLength(2);
 expect(JSON.parse(await readFile(revision,'utf8')).records).toHaveLength(2);
 });
 it.each(['availability','categories','month'] as const)('halts on %s rate limiting and preserves bounded retry delay',async stage=>{
 const outputDir=await directory(), api=client();
 api.availability=vi.fn(async()=>({months:['2026-06','2026-07'],checksum:'c'.repeat(64),sourceUrl:'https://data.police.uk/api/crimes-street-dates',fetchedAt:'2026-09-12T00:00:00Z'}));
 if(stage==='month') api.month=vi.fn(async(_area,month)=>({status:'unavailable' as const,month,code:'rate_limited',retryAfterSeconds:9000}));
 else api[stage]=vi.fn(async()=>{throw new PoliceSourceError('rate_limited',9000);});
 const result=await runBackfill({area,months:['2026-06','2026-07'],outputDir,client:api});
 expect(result.months['2026-06']).toMatchObject({status:'unavailable',code:'rate_limited',retryAfterSeconds:3600});
 expect(result.months['2026-07']).toMatchObject({status:'unavailable',code:'rate_limited',retryAfterSeconds:3600});
 expect(api.categories).toHaveBeenCalledTimes(stage==='availability'?0:1);
 expect(api.month).toHaveBeenCalledTimes(stage==='month'?1:0);
 });
 it('blocks unapproved inputs and invalid ranges before discovery',async()=>{
 const api=client(), outputDir=await directory(); await expect(runBackfill({area:{...area,boundaryStatus:'unapproved'},months:['2026-07'],outputDir,client:api})).rejects.toThrow(); expect(api.availability).not.toHaveBeenCalled();
 expect(()=>monthRange('2023-01','2026-07')).toThrow(); expect(monthRange('2025-12','2026-01')).toEqual(['2025-12','2026-01']);
 });
});
