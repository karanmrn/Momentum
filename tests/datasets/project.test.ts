import { expect,it } from 'vitest';
import {buildDatasetCoverage} from '../../packages/datasets/src/project';
const time='2026-09-12T12:00:00Z';
it('creates blocked source cards when collectors fail or return malformed data',()=>{
 const result=buildDatasetCoverage({tfl:{live:{status:'unavailable'}},ons:{status:'unavailable',pilots:[]},priorities:{areas:[{pilotId:'camden_town',status:'blocked'}]}},time);
 expect(result.records).toHaveLength(18);
 expect(result.records.filter(r=>r.sourceKind!=='community').every(r=>r.status==='blocked'&&r.acquiredUnits===null)).toBe(true);
 expect(result.records.filter(r=>r.sourceKind==='community').every(r=>r.status==='not_collected')).toBe(true);
});
it('blocks all police cards when duplicate source months make a manifest invalid',()=>{
 const result=buildDatasetCoverage({police:{areas:[{areaId:'camden_town',status:'downloaded',downloadedMonths:['2026-07','2026-07'],retrievedAt:time}]}},time);
 const police=result.records.filter(r=>r.id==='police-street');
 expect(police).toHaveLength(3);
 expect(police.every(r=>r.status==='blocked'&&r.acquiredMonths.length===0&&r.fetchedAt===null)).toBe(true);
});
it('keeps valid acquisitions while independently marking missing pilot sources',()=>{
 const result=buildDatasetCoverage({police:{areas:[{areaId:'camden_town',status:'downloaded',downloadedMonths:['2026-07'],retrievedAt:time}]}},time);
 expect(result.records.find(r=>r.pilotId==='camden_town'&&r.id==='police-street')).toMatchObject({status:'acquired',acquiredUnits:1,recordCount:null});
 expect(result.records.find(r=>r.pilotId==='west_croydon'&&r.id==='police-street')).toMatchObject({status:'blocked',acquiredUnits:null});
});
it('preserves a valid static transport fallback when live transport fails',()=>{
 const result=buildDatasetCoverage({tfl:{fetchedAt:time,live:{status:'unavailable'},staticFallback:{sourceUrl:'https://naptan.api.dft.gov.uk/',identities:[{pilotId:'west_croydon'}]}}},time);
 expect(result.records.find(r=>r.pilotId==='west_croydon'&&r.id==='tfl-stations')?.status).toBe('blocked');
 expect(result.records.find(r=>r.pilotId==='west_croydon'&&r.id==='naptan-stops')?.status).toBe('acquired');
});
