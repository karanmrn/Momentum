import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const evidenceDir = new URL('../../.data/camden-evidence/browser/', import.meta.url);
await mkdir(evidenceDir, { recursive:true });
const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const errors=[];page.on('pageerror', e=>errors.push(e.message));
const base=process.env.CAMDEN_TEST_URL || 'http://127.0.0.1:4189/camden-evidence.html';
const checks=[];
try {
 await page.goto(base);
 await page.getByRole('heading',{name:'What can each source tell us?'}).waitFor();
 const choices=page.getByRole('navigation',{name:'Select a police record'}).getByRole('button');
 assert.equal(await choices.count(),5);checks.push('five record choices');
 for(let i=0;i<5;i++){
  await choices.nth(i).click();
  const id=`CAM-0${i+1}`;
  await page.getByRole('heading',{name:`${id} · Police record`}).waitFor();
  assert.equal(await choices.nth(i).getAttribute('aria-pressed'),'true');
  assert.match(await page.locator('.ce-columns').innerText(),/Cannot determine from this record/);
 }
 checks.push('each selected row keeps unknown subtype');
 await choices.nth(0).click();
 await page.getByText('Fictional intake detail',{exact:true}).click();
 assert.match(await page.locator('.ce-fiction').innerText(),/4 Jul 2026, 22:15/);
 await page.getByRole('button',{name:'Correct fictional time',exact:true}).click();
 assert.match(await page.locator('.ce-fiction').innerText(),/4 Jul 2026, 21:55/);
 assert.match(await page.locator('.ce-summary').innerText(),/unwanted contact/);
 checks.push('correction changes occurrence time and retains summary');
 await page.getByRole('button',{name:'Withdraw fictional account',exact:true}).click();
 assert.equal(await page.getByText('Fictional intake detail',{exact:true}).count(),0);
 assert.match(await page.locator('.ce-fiction').innerText(),/withdrawn/);
 await page.getByText(/Inspect \d+ nodes and \d+ qualified assertions/).click();
 assert.equal(await page.getByRole('table').first().getByText('Unwanted touching allegation',{exact:true}).count(),0);
 assert.match(await page.locator('.ce-columns').innerText(),/Under investigation/);
 checks.push('withdrawal removes intake and synthetic graph data, preserves police source');
 await choices.nth(1).click();
 assert.match(await page.locator('.ce-fiction').innerText(),/Fictional state: original/);
 await choices.nth(0).click();
 assert.match(await page.locator('.ce-fiction').innerText(),/Fictional state: withdrawn/);
 await page.getByRole('button',{name:'Reset example',exact:true}).click();
 checks.push('record states are independent and reset works');
 await page.reload();
 await page.getByRole('heading',{name:'What can each source tell us?'}).waitFor();
 assert.match(await page.locator('.ce-fiction').innerText(),/Fictional state: original/);
 checks.push('reload resets local exercise');
 await choices.nth(0).focus();await page.keyboard.press('Tab');await page.keyboard.press('Enter');
 assert.equal(await choices.nth(1).getAttribute('aria-pressed'),'true');checks.push('keyboard selection');
 for(const width of [1440,390,320]){
  await page.setViewportSize({width,height:1000});
  const dims=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));
  assert.ok(dims.scroll<=dims.client,`overflow at ${width}`);
  const boxes=await page.getByRole('button').evaluateAll(xs=>xs.map(x=>x.getBoundingClientRect().height));
  assert.ok(boxes.every(x=>x>=48));
  await page.screenshot({path:new URL(`component-${width}.png`,evidenceDir).pathname,fullPage:true});
 }
 checks.push('1440, 390 and 320px layouts and 48px button targets');
 assert.equal(errors.length,0,errors.join('\n'));checks.push('no page errors');
 await writeFile(new URL('result.json',evidenceDir),JSON.stringify({base,checks,errors,checkedAt:new Date().toISOString()},null,2));
 console.log(JSON.stringify({passed:checks.length,checks,errors}));
} finally {await browser.close();}
