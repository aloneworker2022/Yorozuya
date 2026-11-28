import test from 'node:test';
import assert from 'node:assert/strict';
import { KEEPERS, keeperForDay } from '../web/content/shop_keeper.js';

test('five consecutive game days visit every attendant exactly once',()=>{
  assert.equal(new Set(Array.from({length:5},(_,i)=>keeperForDay(21000+i).id)).size,5);
});
test('same game day remains stable and repeats after five days',()=>{
  for(let day=-10;day<50;day++){
    assert.equal(keeperForDay(day),keeperForDay(day));
    assert.equal(keeperForDay(day),keeperForDay(day+5));
    assert.notEqual(keeperForDay(day),keeperForDay(day+1));
  }
});
test('every attendant has a unique asset key and varied chatter',()=>{
  assert.equal(new Set(KEEPERS.map(k=>k.id)).size,5);
  for(const k of KEEPERS){assert(k.name&&k.place);assert(new Set(k.lines).size>=5);}
});
