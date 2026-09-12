import { describe,expect,it } from 'vitest';
import { getDatasetCoverage,parseDatasetCoverage,datasetCoverageSchema } from '../../packages/datasets/src/coverage';
import type { PilotId } from '../../packages/contracts/index';
describe('public acquisition coverage',()=>{
 it.each(['camden_town','hounslow_town_centre','west_croydon'] as const)('returns only %s with an explicit community gap',pilot=>{
  const rows=getDatasetCoverage(pilot);
  expect(rows.length).toBeGreaterThan(0);expect(rows.every(row=>row.pilotId===pilot)).toBe(true);
  expect(rows.every(row=>row.recordCount===null)).toBe(true);
  expect(rows.find(row=>row.sourceKind==='community')).toMatchObject({status:'not_collected',acquiredUnits:null,fetchedAt:null,sourceUrl:''});
  const police=rows.find(row=>row.sourceKind==='historical_police')!;
  expect(police.acquiredUnits).toBe(police.acquiredMonths.length);expect(police.unitLabel).toBe('monthly source files');
  expect(police.geographyDescription).toContain('not an approved');
 });
 it('rejects unknown pilots and does not change snapshot dates on reads',()=>{
  expect(()=>getDatasetCoverage('london' as PilotId)).toThrow();
  const a=getDatasetCoverage('camden_town'),b=getDatasetCoverage('camden_town');
  expect(a.map(r=>r.fetchedAt)).toEqual(b.map(r=>r.fetchedAt));a[0].limitations.push('Mutated caller data');
  expect(getDatasetCoverage('camden_town')[0].limitations).not.toContain('Mutated caller data');
 });
 it('rejects crime totals, raw evidence and unsafe links',()=>{
  const row=getDatasetCoverage('camden_town')[0];
  expect(()=>datasetCoverageSchema.parse({...row,recordCount:12})).toThrow();
  expect(()=>datasetCoverageSchema.parse({...row,rawRecords:[]})).toThrow();
  expect(()=>datasetCoverageSchema.parse({...row,sourceUrl:'javascript:alert(1)'})).toThrow();
  expect(()=>datasetCoverageSchema.parse({...row,unitLabel:'local crimes'})).toThrow();
 });
 it('rejects duplicated months and acquired rows without provenance',()=>{
  const row=getDatasetCoverage('camden_town')[0];
  expect(()=>datasetCoverageSchema.parse({...row,acquiredMonths:['2026-07','2026-07']})).toThrow();
  expect(()=>datasetCoverageSchema.parse({...row,fetchedAt:null})).toThrow();
  expect(()=>datasetCoverageSchema.parse({...row,sourceUrl:''})).toThrow();
 });
 it('rejects duplicate source cards and invented collection in a missing row',()=>{
  const row=getDatasetCoverage('camden_town')[0];
  expect(()=>parseDatasetCoverage({schemaVersion:'1.0',generatedAt:'2026-09-12T12:00:00Z',records:[row,row]})).toThrow();
  const missing=getDatasetCoverage('camden_town').find(row=>row.status==='not_collected')!;
  expect(()=>datasetCoverageSchema.parse({...missing,acquiredUnits:3})).toThrow();
 });
});
