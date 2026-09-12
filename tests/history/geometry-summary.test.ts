import { checksumRecords } from '../../services/ingestion/src/police/integrity';
import { describe, expect, it } from 'vitest';
import { containsPoint, scopeKey, toPolicePolygon, validateArea } from '../../services/ingestion/src/police/geometry';
import { type ApprovedArea, type MonthSnapshot } from '../../services/ingestion/src/police/types';
import { summarizeHistory } from '../../packages/history/src/index';

const area: ApprovedArea = {
  pilotId: 'camden_town', boundaryVersion: 'synthetic-test-v1', boundaryStatus: 'approved',
  reviewedBy: 'fictional-test-reviewer', reviewedAt: '2026-09-12T00:00:00Z', crs: 'EPSG:4326',
  geometry: { type: 'Polygon', coordinates: [[[-0.145,51.538],[-0.140,51.538],[-0.140,51.541],[-0.145,51.541],[-0.145,51.538]]] },
};
function snapshot(): MonthSnapshot {
  return seal({ schemaVersion: '1.0', parserVersion: 'police-street/1', sourceId: 'P01', sourceFamilyId: 'police-uk',
    scopeKey: scopeKey(area), area: structuredClone(area), month: '2026-07', sourceUrl: 'https://data.police.uk/api/crimes-street/all-crime',
    fetchedAt: '2026-09-12T00:00:00Z', checksum: 'a'.repeat(64), taxonomyChecksum: 'b'.repeat(64), recordsChecksum: 'c'.repeat(64), coverage: 'complete_response',
    synthetic: true, publicationAllowed: false, alertEligible: false, records: [{
      id: null, persistent_id: null, category: 'anti-social-behaviour', month: '2026-07', location_type: 'Force',
      location: { latitude: '51.539', longitude: '-0.142', street: { id: 1, name: 'Synthetic location' } }, outcome_status: null,
    }] });
}
function seal(snapshot:MonthSnapshot):MonthSnapshot {
 snapshot.recordsChecksum=checksumRecords(snapshot.records);
 snapshot.sourceUrl=`https://data.police.uk/api/crimes-street/all-crime?date=${snapshot.month}&poly=${encodeURIComponent(toPolicePolygon(snapshot.area))}`;
 return snapshot;
}
describe('approved police geometry', () => {
  it('converts GeoJSON longitude/latitude into the Police.uk order', () => {
    expect(toPolicePolygon(area)).toBe('51.538,-0.145:51.538,-0.14:51.541,-0.14:51.541,-0.145');
  });
  it('rejects unapproved boundaries, unknown pilots, wrong CRS and wrong coordinate order', () => {
    expect(() => validateArea({ ...area, boundaryStatus:'proposed_requires_review' })).toThrow();
    expect(() => validateArea({ ...area, pilotId:'croydon' })).toThrow();
    expect(() => validateArea({ ...area, crs:'EPSG:27700' })).toThrow();
    expect(() => validateArea({ ...area, geometry:{type:'Polygon',coordinates:[area.geometry.coordinates[0].map(([x,y])=>[y,x])]}})).toThrow();
  });
  it('rejects open, self-crossed, overlapping and degenerate rings', () => {
    const rings = [
      [[-0.145,51.538],[-0.14,51.538],[-0.14,51.541],[-0.145,51.541]],
      [[-0.145,51.538],[-0.14,51.541],[-0.14,51.538],[-0.145,51.541],[-0.145,51.538]],
      [[-0.145,51.538],[-0.14,51.538],[-0.142,51.538],[-0.14,51.541],[-0.145,51.538]],
      [[-0.145,51.538],[-0.142,51.538],[-0.14,51.538],[-0.145,51.538]],
    ];
    for (const ring of rings) expect(() => validateArea({...area,geometry:{type:'Polygon',coordinates:[ring]}})).toThrow();
  });
  it('rejects holes and excessive retrieval areas', () => {
    expect(() => validateArea({...area,geometry:{...area.geometry,coordinates:[...area.geometry.coordinates,...area.geometry.coordinates]}})).toThrow();
    expect(() => validateArea({...area,geometry:{type:'Polygon',coordinates:[[[-.20,51.50],[-.09,51.50],[-.09,51.57],[-.20,51.57],[-.20,51.50]]]}})).toThrow();
  });
  it('uses deterministic boundary inclusion and filters outside points', () => {
    expect(containsPoint(area,[-.145,51.539])).toBe(true);
    expect(containsPoint(area,[-.142,51.539])).toBe(true);
    expect(containsPoint(area,[-.15,51.539])).toBe(false);
  });
  it('invalidates scope for any boundary version or coordinate change', () => {
    expect(scopeKey({...area,boundaryVersion:'v2'})).not.toBe(scopeKey(area));
    const changed=structuredClone(area); changed.geometry.coordinates[0][1][0]=-.139;
    expect(scopeKey(changed)).not.toBe(scopeKey(area));
  });
});
describe('internal historical summaries', () => {
  it('preserves two records at one anonymous point and BTP provenance', () => {
    const source=snapshot(); source.records.push({...structuredClone(source.records[0]), location_type:'BTP'}); seal(source);
    const result=summarizeHistory(area,['2026-07'],[{status:'available',snapshot:source}]);
    expect(result.total).toBe(2);
    expect(result.months[0].locationTypes).toEqual({Force:1,BTP:1});
    expect(result.months[0].categories).toEqual({'anti-social-behaviour':2});
    expect(result).toMatchObject({kind:'historical_context',visibility:'internal',publicationAllowed:false,alertEligible:false,synthetic:true});
  });
  it('keeps available zero distinct from missing and unavailable months', () => {
    const source=snapshot(); source.records=[]; seal(source);
    const result=summarizeHistory(area,['2026-07','2026-06','2026-05'],[
      {status:'available',snapshot:source},{status:'unavailable',month:'2026-06',code:'rate_limited'},
    ]);
    expect(result.status).toBe('partial'); expect(result.total).toBeNull();
    expect(result.months.map(m=>[m.status,m.recordCount])).toEqual([['missing',null],['unavailable',null],['available',0]]);
    expect(summarizeHistory(area,['2026-07'],[{status:'available',snapshot:source}]).total).toBe(0);
  });
  it('does not count records outside the approved footprint', () => {
    const source=snapshot();source.records[0].location.longitude='-.15'; seal(source);
    const result=summarizeHistory(area,['2026-07'],[{status:'available',snapshot:source}]);
    expect(result.total).toBe(0);expect(result.months[0].excludedOutsideArea).toBe(1);
  });
  it('retains the actual offence taxonomy', () => {
    const source=snapshot();source.records[0].category='violence-and-sexual-offences'; seal(source);
    expect(summarizeHistory(area,['2026-07'],[{status:'available',snapshot:source}]).months[0].categories)
      .toEqual({'violence-and-sexual-offences':1});
  });
  it('rejects duplicate month snapshots instead of double-counting reruns', () => {
    const result={status:'available' as const,snapshot:snapshot()};
    expect(()=>summarizeHistory(area,['2026-07'],[result,result])).toThrow(/distinct/);
  });
  it('rejects another scope, mismatched record month and spoofed source', () => {
    for(const change of [(s:MonthSnapshot)=>{s.scopeKey='f'.repeat(64);},
      (s:MonthSnapshot)=>{s.records[0].month='2026-06';},
      (s:MonthSnapshot)=>{s.sourceUrl='https://evil.example/api/crimes-street/all-crime';}]) {
      const source=snapshot();change(source);
      expect(()=>summarizeHistory(area,['2026-07'],[{status:'available',snapshot:source}])).toThrow();
    }
    expect(()=>summarizeHistory({...area,boundaryVersion:'v2'},['2026-07'],[{status:'available',snapshot:snapshot()}])).toThrow();
  });
  it('rejects mixing synthetic records with a real source snapshot', () => {
    const source=snapshot(); const real=snapshot();real.synthetic=false;real.month='2026-06';real.records[0].month='2026-06'; seal(real);
    expect(()=>summarizeHistory(area,['2026-07','2026-06'],[{status:'available',snapshot:source},{status:'available',snapshot:real}])).toThrow(/remain separate/);
  });
  it('rejects modified records with an unchanged integrity checksum', () => {
    const source=snapshot(); source.records=[];
    expect(()=>summarizeHistory(area,['2026-07'],[{status:'available',snapshot:source}])).toThrow(/integrity/);
  });
  it('binds the source query to the month and polygon', () => {
    for (const suffix of ['?date=2000-01&poly=0,0:1,1:0,1','?date=2026-07','?date=2026-07&date=2026-07&poly=x']) {
      const source=snapshot();source.sourceUrl='https://data.police.uk/api/crimes-street/all-crime'+suffix;
      expect(()=>summarizeHistory(area,['2026-07'],[{status:'available',snapshot:source}])).toThrow(/query/);
    }
  });
  it('never reads category counts from object prototypes', () => {
    const source=snapshot();source.records[0].category='constructor';seal(source);
    expect(summarizeHistory(area,['2026-07'],[{status:'available',snapshot:source}]).months[0].categories?.constructor).toBe(1);
  });
  it('bounds month inputs and treats no data as unavailable', () => {
    expect(()=>summarizeHistory(area,[],[])).toThrow();
    expect(()=>summarizeHistory(area,['2026-00'],[])).toThrow();
    expect(()=>summarizeHistory(area,['2026-07','2026-07'],[])).toThrow();
    expect(summarizeHistory(area,['2026-07'],[])).toMatchObject({status:'unavailable',total:null});
  });
});
