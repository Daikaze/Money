import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeCurrency, validateCurrencyList, conversionForDnd5e,
  parseCoinAmount, calculateExchange, nextBalance
} from '../scripts/core.mjs';
const coin = {id:'suncoin',name:'Sun Coin',abbreviation:'SUN',valueGP:5,icon:'icons/sun.webp'};
test('normalize creates valid denomination', () => {
  assert.equal(normalizeCurrency(coin).id,'suncoin');
  assert.equal(conversionForDnd5e(5),.2);
});
test('reject malformed or conflicting denomination ids', () => {
  assert.throws(()=>normalizeCurrency({...coin,id:'gp'}),/Reserved/);
  assert.throws(()=>normalizeCurrency({...coin,id:'unsafe;x'}),/Currency ID/);
  assert.throws(()=>validateCurrencyList([coin,coin]),/Duplicate/);
  assert.throws(()=>validateCurrencyList([coin],['suncoin']),/already used/);
});
test('reject malformed image paths and conversion amounts', () => {
  assert.throws(()=>normalizeCurrency({...coin,icon:'url(\\"x\\")'}),/Invalid icon/);
  assert.throws(()=>normalizeCurrency({...coin,valueGP:0}),/Value in GP/);
});
test('exact whole coin exchange', () => {
  assert.equal(calculateExchange(2,5,1),10);
  assert.equal(calculateExchange(1,1,0.1),10);
  assert.throws(()=>calculateExchange(1,.1,1),/whole coins/);
});
test('balance checks', () => {
  assert.equal(nextBalance(10,-3),7);
  assert.throws(()=>nextBalance(1,-3),/Insufficient/);
  assert.throws(()=>nextBalance(0,-1),/Insufficient/);
  assert.throws(()=>parseCoinAmount('3.5'),/whole number/);
  assert.equal(parseCoinAmount('0',{allowZero:true}),0);
});
