import test from 'node:test';
import assert from 'node:assert/strict';

test('module registers a native denomination and sheet menu action', async () => {
  const callbacks = new Map();
  globalThis.Hooks = {
    once: (name, cb) => callbacks.set(name, cb),
    on: (name, cb) => callbacks.set(name, cb)
  };
  class MockApp { constructor() {} render() { return Promise.resolve(this); } }
  globalThis.foundry = {
    applications: { api: { ApplicationV2: MockApp, HandlebarsApplicationMixin: Base => Base } },
    utils: {}
  };
  const persisted = [{id: 'suncoin', name: 'Sun Coin', abbreviation: 'SUN', valueGP: 5, icon:'icons/sun.webp'}];
  const registers = new Map();
  globalThis.game = {
    system: {id: 'dnd5e'},
    settings: {
      register: (mod,key,data) => registers.set(key,data),
      registerMenu: (mod,key,data) => registers.set(key,data),
      get: (mod,key) => key==='currencies' ? persisted : null
    },
    modules: new Map([['averis-currency-manager',{}]]),
    user: {isGM:true},
    i18n: {localize: text => text}
  };
  globalThis.CONFIG = {DND5E:{currencies:{gp:{label:'Gold',abbreviation:'GP',conversion:1,icon:'gold.webp'}}}};
  await import('../scripts/main.mjs');
  callbacks.get('init')();
  assert.equal(registers.get('currencies').requiresReload,true);
  assert.equal(registers.get('manageCurrencies').restricted,true);
  assert.equal(CONFIG.DND5E.currencies.suncoin.conversion,.2);
  assert.equal(CONFIG.DND5E.currencies.suncoin.icon,'icons/sun.webp');
  callbacks.get('ready')();
  const api = game.modules.get('averis-currency-manager').api;
  assert.equal(api.getCurrencies().find(c=>c.id==='suncoin').valueGP,5);
  const actor = {isOwner:true,system:{currency:{gp:10,suncoin:2}},name:'Rashira'};
  const controls = [];
  callbacks.get('getHeaderControlsActorSheetV2')({actor},controls);
  callbacks.get('getHeaderControlsActorSheetV2')({actor},controls);
  assert.equal(controls.length,1);
  assert.equal(controls[0].action,'acm-open-wallet');
});
