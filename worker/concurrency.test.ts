import test from 'node:test';
import assert from 'node:assert/strict';
import { RequestGate, readAndCommit, activatePendingInventory } from './concurrency.ts';
import { configuration } from './policy.ts';

const env={TORAFF_IMPORT_API_URL:'https://worker.example.test',IMPORT_WORKER_SHARED_SECRET:'test',BRIGHT_DATA_API_KEY:'test',BRIGHTDATA_UNLOCKER_ZONE:'test'};
test('default concurrency is four channels and never more than five',()=>{
  assert.equal(configuration(env).concurrency,4);
  assert.equal(configuration({...env,WORKER_CONCURRENCY:'5'}).concurrency,5);
  assert.throws(()=>configuration({...env,WORKER_CONCURRENCY:'6'}),/1..5/);
});
test('parallel requests reserve distinct rate slots',async()=>{
  const waits:number[]=[];
  const gate=new RequestGate(1000,()=>0,async(ms)=>{waits.push(ms);});
  await Promise.all([gate.enter(),gate.enter(),gate.enter(),gate.enter()]);
  assert.deepEqual(waits,[0,1000,2000,3000]);
});
test('four source reads overlap while saves never overlap',async()=>{
  let reading=0,maxReading=0,saving=0,maxSaving=0;
  const saved:string[]=[];
  await readAndCommit(['a','b','c','d'],async url=>{
    reading++;maxReading=Math.max(maxReading,reading);
    await new Promise(r=>setTimeout(r,5));reading--;return url;
  },async(url)=>{
    saving++;maxSaving=Math.max(maxSaving,saving);
    await new Promise(r=>setTimeout(r,5));saved.push(url);saving--;
  });
  assert.equal(maxReading,4);assert.equal(maxSaving,1);assert.equal(saved.length,4);
});
test('429 cooldown reschedules waiting callers into separate rate slots',async()=>{
  const waits:{ms:number;resolve:()=>void}[]=[];
  const gate=new RequestGate(1000,()=>0,ms=>new Promise<void>(resolve=>waits.push({ms,resolve})));
  const work=Promise.all([gate.enter(),gate.enter(),gate.enter()]);
  gate.defer(15000);
  for(const wait of waits.slice())wait.resolve();
  await Promise.resolve();await Promise.resolve();
  assert.deepEqual(waits.slice(3).map(w=>w.ms),[15000,16000,17000]);
  for(const wait of waits.slice(3))wait.resolve();
  await work;
});
test('successful sibling draft saves finish before a failed batch returns',async()=>{
  const saved:string[]=[];
  await assert.rejects(readAndCommit(['bad','good'],async url=>{
    if(url==='bad')throw Object.assign(new Error('429'),{status:429});return url;
  },async url=>{saved.push(url);}),/429/);
  assert.deepEqual(saved,['good']);
});
test('suspended provider error takes priority over temporary sibling failures',async()=>{
  await assert.rejects(readAndCommit(['temporary','suspended'],async url=>{
    throw Object.assign(new Error(url),{status:url==='suspended'?407:503});
  },async()=>{}),/suspended/);
});
test('imports the first queued broker before more identity discovery and retains the backlog',()=>{
  const first={broker_id:'first'},second={broker_id:'second'};
  const c={activeBroker:null as null|typeof first,workerEnrichment:[first,second],workerListingIndex:3,workerListingDoneUrls:['saved']};
  assert.equal(activatePendingInventory(c),first);assert.deepEqual(c.workerEnrichment,[second]);
  assert.equal(activatePendingInventory(c),first);assert.deepEqual(c.workerEnrichment,[second]);
  assert.equal(c.workerListingIndex,3);assert.deepEqual(c.workerListingDoneUrls,['saved']);
});
