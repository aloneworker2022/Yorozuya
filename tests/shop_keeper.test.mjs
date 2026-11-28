import test from 'node:test';
import assert from 'node:assert/strict';
import { KEEPERS, validBannerUrl } from '../web/content/shop_keeper.js';

test('only generated shop assets are accepted as banner URLs',()=>{
  assert(validBannerUrl('/assets/shop/day-20785.png'));
  for(const url of ['https://example.com/image.png','javascript:alert(1)','/assets/shop/../save','/img/shop-rustic-blink.png',null])assert(!validBannerUrl(url));
});
test('every attendant has a unique asset key and varied chatter',()=>{
  assert.equal(new Set(KEEPERS.map(k=>k.id)).size,5);
  for(const k of KEEPERS){assert(k.name&&k.place);assert(new Set(k.lines).size>=5);}
});
