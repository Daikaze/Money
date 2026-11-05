import { MODULE_ID, validateCurrencyList, conversionForDnd5e } from "./core.mjs";
import {
  CurrencySettingsApp, WalletApp, nativeCurrencies, adjustCurrency, exchangeCurrency, transferCurrency
} from "./apps.mjs";

function configureCurrencies() {
  const raw = game.settings.get(MODULE_ID, "currencies") ?? [];
  const reserved = Object.keys(CONFIG.DND5E.currencies);
  let valid = [];
  try { valid = validateCurrencyList(raw, reserved); }
  catch (error) {
    // Skip broken entries rather than crashing Foundry during world load.
    console.error(`${MODULE_ID} | Invalid saved currency settings`, error);
    for (const entry of Array.isArray(raw) ? raw : []) {
      try { valid.push(...validateCurrencyList([entry], [...reserved, ...valid.map(v => v.id)])); }
      catch (skipError) { console.warn(`${MODULE_ID} | Skipped invalid entry`, entry, skipError); }
    }
  }
  for (const currency of valid) {
    CONFIG.DND5E.currencies[currency.id] = {
      label: currency.name,
      abbreviation: currency.abbreviation,
      conversion: conversionForDnd5e(currency.valueGP),
      icon: currency.icon
    };
  }
  console.log(`${MODULE_ID} | Registered ${valid.length} custom currencies in CONFIG.DND5E.currencies.`);
}

Hooks.once("init", () => {
  if (game.system.id !== "dnd5e") {
    console.warn(`${MODULE_ID} | Requires the D&D 5e system.`);
    return;
  }

  game.settings.register(MODULE_ID, "currencies", {
    name: "Custom Currencies",
    hint: "GM-defined currency denominations. Reload after changes.",
    scope: "world",
    config: false,
    requiresReload: true,
    type: Array,
    default: []
  });

  game.settings.registerMenu(MODULE_ID, "manageCurrencies", {
    name: "ACM.Settings",
    label: "ACM.Settings",
    hint: "ACM.SettingsHint",
    icon: "fa-solid fa-coins",
    type: CurrencySettingsApp,
    restricted: true
  });

  // Before dnd5e's "setup" hook generates its native currency icon CSS.
  configureCurrencies();
});

Hooks.on("getHeaderControlsActorSheetV2", (app, controls) => {
  if (game.system.id !== "dnd5e") return;
  const actor = app.actor ?? app.document;
  if (!actor?.isOwner || !actor.system?.currency || !Array.isArray(controls)) return;
  if (controls.some(control => control.action === "acm-open-wallet")) return;
  controls.push({
    action: "acm-open-wallet",
    icon: "fa-solid fa-coins",
    label: "ACM.Wallet",
    visible: true,
    onClick: () => new WalletApp(actor).render({ force: true })
  });
});

Hooks.once("ready", () => {
  if (game.system.id !== "dnd5e") return;
  const module = game.modules.get(MODULE_ID);
  module.api = Object.freeze({
    openSettings: () => {
      if (!game.user.isGM) throw new Error("Only the GM may edit currency definitions.");
      return new CurrencySettingsApp().render({ force: true });
    },
    openWallet: actor => new WalletApp(actor).render({ force: true }),
    getCurrencies: () => nativeCurrencies(),
    adjustCurrency,
    exchangeCurrency,
    transferCurrency
  });
});
