import test from 'node:test';
import assert from 'node:assert/strict';
import {isBankPage,clampPosition} from '../src/panel-position.js';
test('bank route accepts both Torn hosts and rejects other screens',()=>{
 for(const url of ['https://www.torn.com/bank.php','https://torn.com/bank.php?step=deposit#tab'])assert.ok(isBankPage(url));
 for(const url of ['https://www.torn.com/index.php','https://www.torn.com/preferences.php','https://www.torn.com/bank.php/other','https://other.com/bank.php','bad'])assert.equal(isBankPage(url),false);
});
test('drag positions stay reachable after mobile viewport resize',()=>{
 assert.deepEqual(clampPosition({x:999,y:-30},360,500,393,661),{x:33,y:0});
 assert.deepEqual(clampPosition({x:120,y:200},360,500,300,236),{x:0,y:0});
});
