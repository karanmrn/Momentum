import {afterAll,beforeAll,expect,it} from 'vitest';
import type {Server} from 'node:http';
import {createApp} from '../../server/app';
import {createDatabase,type DemoDatabase} from '../../server/database';
import {createDemoState} from '../../packages/domain';
import type {DatasetCoverageRecord} from '../../packages/contracts';
let db:DemoDatabase,server:Server,base:string;
beforeAll(async()=>{
 db=await createDatabase(createDemoState,{path:'memory://'});
 server=createApp(db).listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
 const address=server.address();if(!address||typeof address==='string')throw Error('No port');
 base=`http://127.0.0.1:${address.port}/api/datasets?area=`;
});
afterAll(async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));await db.close();});
it.each(['hounslow_town_centre','camden_town','west_croydon'])('serves public acquisition coverage for %s without crime totals',async area=>{
 const response=await fetch(base+area);expect(response.status).toBe(200);
 const body=await response.json();expect(body.synthetic).toBe(false);
 expect(response.headers.get('cache-control')).toBe('no-store');
 expect(body.data.length).toBeGreaterThan(0);
 for(const record of body.data as DatasetCoverageRecord[]){
  expect(record.pilotId).toBe(area);expect(record.recordCount).toBeNull();
  expect(record.geographyDescription).toBeTruthy();expect(record.limitations.length).toBeGreaterThan(0);
 }
 expect(JSON.stringify(body)).not.toContain('ctxt_secret_');
});
it('rejects an unconfigured area',async()=>{
 const response=await fetch(base+'london');expect(response.status).toBe(400);
 expect((await response.json()).error.code).toBe('invalid_input');
});
