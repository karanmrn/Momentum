import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../../server/app';
import { createDatabase, type DemoDatabase } from '../../server/database';
import { createDemoState } from '../../packages/domain/index';
let db: DemoDatabase, server: Server, base: string;
beforeAll(async () => {
 db = await createDatabase(createDemoState, {path:'memory://'});
 server = createApp(db).listen(0,'127.0.0.1');
 await new Promise<void>(resolve => server.once('listening', resolve));
 const address = server.address(); if (!address || typeof address === 'string') throw Error('No port');
 base = `http://127.0.0.1:${address.port}/api`;
});
afterAll(async () => {await new Promise<void>(resolve => server.close(() => resolve())); await db.close();});
function browser() {
 let cookie = '';
 return async (path: string, method = 'GET', body?: unknown, key?: string) => {
  const response = await fetch(base + path, {method, headers:{'Content-Type':'application/json',Cookie:cookie,...(key?{'Idempotency-Key':key}:{})}, body:body === undefined ? undefined : JSON.stringify(body)});
  cookie = response.headers.get('set-cookie')?.split(';')[0] ?? cookie;
  expect(response.status).toBeLessThan(300);
  return (await response.json()).data;
 };
}
const input = {pilotId:'hounslow_town_centre',category:'infrastructure',title:'Fictional lamp observation',description:'Fictional observation for the private review queue.',place:'Fictional pedestrian approach',observedAt:'2026-09-11T09:20:00.000Z',synthetic:true};
it('preserves reported observation time through HTTP publication and evidence', async () => {
 const request = browser(); await request('/session');
 const report = await request('/reports','POST',input,'timestamp-report');
 await request('/session','POST',{persona:'moderator'});
 const approved = await request(`/moderation/${report.id}/decision`,'POST',{expectedRevision:1,action:'approve',summary:'Reviewed fictional lighting concern.'},'timestamp-approve');
 const notice = await request(`/notices/${approved.noticeId}`);
 expect(notice.observedAt).toBe(input.observedAt);
 expect(notice.evidence[0].observedAt).toBe(input.observedAt);
 expect(Date.parse(notice.updatedAt)).toBeGreaterThan(Date.parse(report.createdAt)-1000);
});
it('suppresses queued ordinary notices after a category change', async () => {
 const request = browser(); await request('/session');
 const report = await request('/reports','POST',input,'unfollow-report');
 await request('/session','POST',{persona:'moderator'});
 const approved = await request(`/moderation/${report.id}/decision`,'POST',{expectedRevision:1,action:'approve',summary:'Reviewed fictional lighting concern.'},'unfollow-approve');
 await request('/session','POST',{persona:'alex'});
 const preferences = await request('/preferences');
 await request('/preferences','PUT',{expectedRevision:preferences.revision,areas:['hounslow_town_centre'],categories:['transport'],inAppEnabled:true});
 const inbox = await request('/me/notifications/dispatch','POST',{});
 expect(inbox.find((item: {noticeId:string}) => item.noticeId === approved.noticeId)?.state).toBe('suppressed');
});
it('delivers corrections to previous recipients after they change categories', async () => {
 const request = browser(); await request('/session');
 const report = await request('/reports','POST',input,'correction-report');
 await request('/session','POST',{persona:'moderator'});
 const approved = await request(`/moderation/${report.id}/decision`,'POST',{expectedRevision:1,action:'approve',summary:'Reviewed fictional lighting concern.'},'correction-approve');
 await request('/session','POST',{persona:'alex'});
 const delivered = await request('/me/notifications/dispatch','POST',{});
 expect(delivered.find((item: {noticeId:string}) => item.noticeId === approved.noticeId)?.state).toBe('delivered');
 const preferences = await request('/preferences');
 await request('/preferences','PUT',{expectedRevision:preferences.revision,areas:['camden_town'],categories:['transport'],inAppEnabled:true});
 await request('/session','POST',{persona:'moderator'});
 await request(`/moderation/${report.id}/decision`,'POST',{expectedRevision:approved.revision,action:'retract',summary:'The fictional summary was retracted.'},'correction-retract');
 await request('/session','POST',{persona:'alex'});
 const inbox = await request('/me/notifications/dispatch','POST',{});
 expect(inbox.find((item: {noticeId:string;kind:string}) => item.noticeId === approved.noticeId && item.kind === 'correction')?.state).toBe('delivered');
});
