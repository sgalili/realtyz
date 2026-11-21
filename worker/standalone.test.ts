import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, copyFile, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

test('Node runtime completes a queued import from worker-only files without app source',async()=>{
  const folder=await mkdtemp(join(tmpdir(),'toraff-standalone-'));
  const root=fileURLToPath(new URL('.',import.meta.url));
  try{
    await copyFile(join(root,'index.js'),join(folder,'index.js'));
    await copyFile(join(root,'package.json'),join(folder,'package.json'));
    await symlink(join(root,'node_modules'),join(folder,'node_modules'),'dir');
    await writeFile(join(folder,'fixture.mjs'),`
      import assert from 'node:assert/strict';
      let claimed=false;let drafts=0;
      globalThis.fetch=async(url,options)=>{
        const body=JSON.parse(options.body);
        let result;
        if(String(url)==='https://api.brightdata.com/request')return new Response('test HTML');
        if(body.action==='claim'){
          assert.equal(claimed,false);claimed=true;
          result={job:{id:'j',lease_token:'l',target_brokers:1,checkpoint:{source:'urls',enrichUrls:['https://www.yad2.co.il/realestate/agency/1234']}}};
        }else if(body.action==='known')result={known:false};
        else if(body.action==='broker')result={brokerResults:[{broker_id:'b'}],broker:{broker_id:'b',listing_urls:['https://www.yad2.co.il/realestate/item/a','https://www.yad2.co.il/realestate/item/b']}};
        else if(body.action==='listing'){drafts++;result={listing_id:body.url};}
        else if(body.action==='progress'){
          result={stop:false};
          if(body.status==='completed'){
            assert.equal(drafts,2);assert.equal(body.counts.brokers_done,1);assert.equal(body.counts.listings_done,2);
            console.log('STANDALONE_IMPORT_VERIFIED');process.emit('SIGTERM');
          }
        }else throw new Error('Unexpected action');
        return new Response(JSON.stringify(result));
      };
    `);
    const result=spawnSync(process.execPath,['--import','./fixture.mjs','--env-file-if-exists=.env','index.js'],{
      cwd:folder,encoding:'utf8',timeout:10000,
      env:{PATH:process.env.PATH,IMPORT_WORKER_ENABLED:'true',TORAFF_IMPORT_API_URL:'https://worker.example.test',IMPORT_WORKER_SHARED_SECRET:'test',BRIGHT_DATA_API_KEY:'test',BRIGHTDATA_UNLOCKER_ZONE:'test',WORKER_REQUEST_INTERVAL_MS:'250'},
    });
    assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/STANDALONE_IMPORT_VERIFIED/);
  }finally{await rm(folder,{recursive:true,force:true});}
});