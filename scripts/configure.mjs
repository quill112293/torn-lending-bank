import {readFile,writeFile} from 'node:fs/promises';
const id=process.argv[2];
if(!/^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(id||''))throw Error('Pass the actual database_id returned by Cloudflare: node scripts/configure.mjs DATABASE_ID');
const path=new URL('../wrangler.jsonc',import.meta.url),config=JSON.parse(await readFile(path,'utf8'));
config.d1_databases[0].database_id=id;
await writeFile(path,JSON.stringify(config,null,2)+'\n');
console.log('Cloudflare database configured.');
