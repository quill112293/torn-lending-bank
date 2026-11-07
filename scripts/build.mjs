import {build} from 'esbuild';
import {mkdir,writeFile,copyFile,readFile} from 'node:fs/promises';
const out='dist/public';await mkdir(out+'/downloads',{recursive:true});
const origin=process.env.BANK_ORIGIN||'';
if(origin){const u=new URL(origin);if(u.protocol!=='https:'||u.origin!==origin||!u.hostname.endsWith('.workers.dev'))throw Error('BANK_ORIGIN must be the deployed https://…workers.dev origin, with no trailing slash.');}
const repo=process.env.RELEASE_REPO||'';if(repo&&!/^[\w.-]+\/[\w.-]+$/.test(repo))throw Error('Invalid RELEASE_REPO');
const common={bundle:true,minify:true,target:['es2022'],jsx:'automatic',loader:{'.css':'text'},legalComments:'eof',define:{'process.env.NODE_ENV':'"production"'}};
await build({...common,entryPoints:['src/main.tsx'],outfile:out+'/bank.js',format:'iife',define:{...common.define,__NATIVE__:'false',__BANK_ORIGIN__:JSON.stringify(origin),__ROLE_LABEL__:'"Bank"'}});
for(const role of ['Lender','Borrower']){
 const filename='Torn-Lending-Bank-'+role+'.user.js';
 const metadata=['// ==UserScript==','// @name         Torn Lending Bank '+role,'// @namespace    Aaron112293.TornLendingBank','// @version      1.1.0-beta.1','// @description  Shared bank controls directly in Torn. Records only; no game actions.','// @author       Aaron112293 [3542697]','// @match        https://www.torn.com/*','// @match        https://torn.com/*','// @run-at       document-end','// @grant        GM_xmlhttpRequest','// @connect      '+(origin?new URL(origin).hostname:'workers.dev'),'// @noframes',...(repo?['// @downloadURL  https://raw.githubusercontent.com/'+repo+'/main/downloads/'+filename,'// @updateURL    https://raw.githubusercontent.com/'+repo+'/main/downloads/'+filename]:[]),'// ==/UserScript=='];
 await build({...common,entryPoints:['src/main.tsx'],outfile:out+'/downloads/'+filename,format:'iife',banner:{js:metadata.join('\n')},define:{...common.define,__NATIVE__:'true',__BANK_ORIGIN__:JSON.stringify(origin),__ROLE_LABEL__:JSON.stringify(role)}});
}
await build({entryPoints:['server/worker.js'],outfile:'dist/worker.mjs',bundle:true,format:'esm',platform:'neutral',target:'es2022'});
await writeFile(out+'/index.html','<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>Torn Lending Bank</title></head><body><script src="/bank.js" defer></script></body></html>');
await writeFile(out+'/_headers','/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  X-Frame-Options: DENY\n  Content-Security-Policy: default-src \'self\'; script-src \'self\'; style-src \'self\' \'unsafe-inline\'; connect-src \'self\'; img-src \'self\' data:; frame-ancestors \'none\'; base-uri \'none\'\n/downloads/*\n  Content-Type: application/javascript; charset=utf-8\n');
console.log('Built bank page, native Torn scripts, and Worker. '+(origin?'Live server configured.':'Native scripts await the deployed bank address.'));
