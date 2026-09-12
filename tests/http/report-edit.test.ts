import {afterAll,beforeAll,expect,it} from 'vitest';
import type {Server} from 'node:http';
import {createApp} from '../../server/app';
import {createDatabase,type DemoDatabase} from '../../server/database';
import {createDemoState} from '../../packages/domain/index';
import type {Report} from '../../packages/contracts';
let db:DemoDatabase, server:Server, base:string;
beforeAll(async()=>{
  db=await createDatabase(createDemoState,{path:'memory://'});
  server=createApp(db).listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  const address=server.address();if(!address||typeof address==='string')throw Error('No test port');
  base=`http://127.0.0.1:${address.port}/api`;
});
afterAll(async()=>{await new Promise<void>(r=>server.close(()=>r()));await db.close();});
function browser(){let cookie='';return async(path:string,method='GET',body?:unknown,key?:string)=>{
  const response=await fetch(base+path,{method,headers:{'content-type':'application/json',cookie,...(key?{'Idempotency-Key':key}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  cookie=response.headers.get('set-cookie')?.split(';')[0]??cookie;
  return {status:response.status,headers:response.headers,body:await response.json()};
};}
const input={pilotId:'hounslow_town_centre',category:'infrastructure',title:'Fictional lighting concern',description:'Original fictional private account.',place:'Broad fictional approach',observedAt:'2026-09-12T10:00:00Z',synthetic:true};
const changes={category:'access',title:'Revised fictional access concern',description:'Corrected fictional private account.',place:'Broad fictional pedestrian area',observedAt:'2026-09-12T11:00:00Z',synthetic:true};
const edit=(revision=1, fields:unknown=changes)=>({action:'edit',expectedRevision:revision,changes:fields});
it('lets an owner correct an unreviewed private report without publishing it',async()=>{
  const request=browser();const made=await request('/reports','POST',input,'owner-edit-main');
  expect(made.status).toBe(201);const before=made.body.data as Report;
  const response=await request(`/reports/${before.id}`,'PATCH',edit());
  expect(response.status).toBe(200);
  expect(response.body.data).toMatchObject({...changes,id:before.id,owner:before.owner,pilotId:before.pilotId,createdAt:before.createdAt,status:'submitted',noticeId:null,revision:2});
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(JSON.stringify((await request('/feed?area=hounslow_town_centre')).body)).not.toContain(changes.description);
  const replay=await request('/reports','POST',input,'owner-edit-main');
  expect(replay.body.data).toEqual(response.body.data);
  expect(JSON.stringify(replay.body)).not.toContain(input.description);
});
