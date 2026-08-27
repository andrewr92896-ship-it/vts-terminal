import { test, expect } from '@playwright/test';
import { mkdir } from 'node:fs/promises';

const base='http://127.0.0.1:4173';
const out='test-results/public-terminal-portal-derived-v1';
await mkdir(out,{recursive:true});

async function capture(page,name,width,url){
  await page.setViewportSize({width,height:Math.max(720,Math.round(width*0.56))});
  await page.goto(`${base}${url}`,{waitUntil:'networkidle'});
  await expect(page.locator('#root')).toBeVisible();
  await page.screenshot({path:`${out}/${name}.png`,fullPage:false,animations:'disabled'});
}

test('portal-derived public evidence',async({page})=>{
  await capture(page,'01-live-wall-1440-expanded',1440,'/?evidence=1&sidebar=expanded#live');
  await capture(page,'02-market-data-1440-expanded',1440,'/?evidence=1&sidebar=expanded#data');
  await capture(page,'03-login-1440',1440,'/');
  await capture(page,'04-two-factor-1440',1440,'/?screen=two-factor');
  for(const width of [1440,1024,768,390]){
    await capture(page,`sidebar-${width}-expanded`,width,'/?evidence=1&sidebar=expanded#live');
    await capture(page,`sidebar-${width}-collapsed`,width,'/?evidence=1&sidebar=collapsed#live');
  }
});

test('public route and cookie contract',async({page,context})=>{
  const requests=[];
  page.on('request',(request)=>requests.push(request.url()));
  await page.goto(`${base}/?evidence=1#live`,{waitUntil:'networkidle'});
  const contract=await page.evaluate(()=>window.__VTS_PUBLIC_BOUNDARY__);
  expect(contract.routes).toEqual(['login','two-factor','live','data']);
  expect(contract.sessionCookie).toBe('vts_public_session');
  expect(requests.filter((url)=>url.includes('/api/'))).toEqual([]);
  expect(await context.cookies()).toEqual([]);
});
