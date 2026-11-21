import { assertEquals } from 'jsr:@std/assert';
import { commitExternalEntity } from './externalImportCommit.ts';

Deno.test('partial developer saves retain original ownership and pending identity until final save', async()=>{
  const writes: any[]=[];
  const pending={source_url:'https://www.yad2.co.il/yad1/developers/1234',owner:'original-owner',developer_id:'original-developer'};
  const job:any={id:'job',lease_token:'lease',checkpoint:{externalPendingDeveloper:pending}};
  const admin:any={
    rpc:()=>Promise.resolve({data:{busy:false},error:null}),
    from:(table:string)=>{
      const query:any={
        select:()=>query,eq:()=>query,order:()=>query,range:()=>query,
        upsert:(rows:any)=>{writes.push({table,rows});return query;},
        update:(row:any)=>{writes.push({table,row});return query;},
        then:(resolve:any)=>Promise.resolve({data:[],error:null}).then(resolve),
      };return query;
    },
  };
  const body={action:'developer',url:pending.source_url,developer:{company_name:'חברת בדיקה'},projects:[{source_project_id:'project-1',source_url:'https://www.yad2.co.il/yad1/project/1234',name:'פרויקט בדיקה'}],partial:true};
  const partial=await commitExternalEntity(admin,job,body);
  assertEquals(partial.partial,true);
  assertEquals(partial.pending,pending);
  assertEquals(partial.result.developer_id,'original-developer');
  assertEquals(job.checkpoint.developerResults,undefined);
  assertEquals(writes[0].table,'developer_projects');
  assertEquals(writes[0].rows[0].developer_id,'original-developer');
  assertEquals(writes[0].rows[0].workspace_owner_id,'original-owner');
  assertEquals(partial.result.projects,1);
  const final=await commitExternalEntity(admin,job,{...body,partial:false});
  assertEquals(final.result.developer_id,'original-developer');
  assertEquals(final.developerResults.length,1);
  assertEquals(writes.at(-1).row.checkpoint.externalPendingDeveloper,undefined);
});