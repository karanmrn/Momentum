import {afterAll,beforeAll,expect,it,vi} from 'vitest';
import type {Server} from 'node:http';
import {createDatabase,type DemoDatabase} from '../../server/database';
import {createDemoState} from '../../packages/domain';
vi.mock('../../services/index',()=>({
 getSources:vi.fn(async(area:string)=>[{id:area,title:area,summary:'Source sample',url:'https://example.com',status:'available',sourceKind:'map_inventory',fetchedAt:null,publishedAt:null,synthetic:false,scope:area}]),
 getHelp:vi.fn(async()=>[]),
}));
import {getSources} from '../../services/index';
import {createApp} from '../../server/app';
let db:DemoDatabase,server:Server,base:string;
beforeAll(async()=>{
 db=await createDatabase(createDemoState,{path:'memory://'});
 server=createApp(db).listen(0,'127.0.0.1'); await new Promise<void>(resolve=>server.once('listening',resolve));
 const address=server.address(); if(!address||typeof address==='string')throw Error('No port');
 base=`http://127.0.0.1:${address.port}/api/sources?area=`;
});
afterAll(async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));await db.close();});
it('isolates concurrent area source responses and subsequent cache hits',async()=>{
 const areas=['camden_town','hounslow_town_centre','west_croydon'];
 for(let round=0;round<2;round++){
  const responses=await Promise.all(areas.map(async area=>{const response=await fetch(base+area);expect(response.status).toBe(200);return response.json();}));
  responses.forEach((response,index)=>expect(response.data[0].id).toBe(areas[index]));
 }
 expect(getSources).toHaveBeenCalledTimes(3);
});
