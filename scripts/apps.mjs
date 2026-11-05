import {
  MODULE_ID, DEFAULT_ICON, MAX_CUSTOM_CURRENCIES, normalizeCurrency, validateCurrencyList,
  parseCoinAmount, calculateExchange, nextBalance
} from "./core.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;
const BaseApp = HandlebarsApplicationMixin(ApplicationV2);

function notifyError(error) {
  console.error(`${MODULE_ID} |`, error);
  ui.notifications.error(error?.message ?? String(error));
}

function knownDefinitions() {
  return game.settings.get(MODULE_ID, "currencies") ?? [];
}

export function nativeCurrencies() {
  return Object.entries(CONFIG.DND5E.currencies).map(([id, config]) => ({
    id,
    name: game.i18n.localize(config.label ?? id),
    abbreviation: game.i18n.localize(config.abbreviation ?? id),
    icon: config.icon || DEFAULT_ICON,
    valueGP: 1 / Number(config.conversion ?? 1),
    isCustom: knownDefinitions().some(currency => currency.id === id)
  })).filter(item => Number.isFinite(item.valueGP) && item.valueGP > 0);
}

function checkOwner(actor) {
  if (!actor || !actor.isOwner || !actor.system?.currency) {
    throw new Error("You must own an actor with a D&D 5e currency wallet.");
  }
}

function currencyExists(key) {
  if (!Object.hasOwn(CONFIG.DND5E.currencies, key)) throw new Error(`Unknown currency: ${key}`);
}

export async function adjustCurrency(actor, key, change) {
  checkOwner(actor);
  currencyExists(key);
  const current = actor.system.currency[key] ?? 0;
  const updated = nextBalance(current, change);
  await actor.update({ [`system.currency.${key}`]: updated });
  return updated;
}

export async function exchangeCurrency(actor, from, to, quantity) {
  checkOwner(actor);
  currencyExists(from);
  currencyExists(to);
  if (from === to) throw new Error("Choose different currencies for exchange.");
  const amount = parseCoinAmount(quantity);
  const configFrom = CONFIG.DND5E.currencies[from];
  const configTo = CONFIG.DND5E.currencies[to];
  const gained = calculateExchange(amount, 1 / configFrom.conversion, 1 / configTo.conversion);
  const oldFrom = Number(actor.system.currency[from] ?? 0);
  const oldTo = Number(actor.system.currency[to] ?? 0);
  const updatedFrom = nextBalance(oldFrom, -amount);
  const updatedTo = nextBalance(oldTo, gained);
  await actor.update({
    [`system.currency.${from}`]: updatedFrom,
    [`system.currency.${to}`]: updatedTo
  });
  return gained;
}

/** Two document updates cannot be fully atomic in Foundry; best-effort rollback is attempted. */
export async function transferCurrency(source, target, key, quantity) {
  checkOwner(source);
  checkOwner(target);
  if (source.uuid === target.uuid) throw new Error("Choose a different destination actor.");
  currencyExists(key);
  const amount = parseCoinAmount(quantity);
  const oldSource = Number(source.system.currency[key] ?? 0);
  const oldTarget = Number(target.system.currency[key] ?? 0);
  const updatedSource = nextBalance(oldSource, -amount);
  const updatedTarget = nextBalance(oldTarget, amount);
  await source.update({ [`system.currency.${key}`]: updatedSource });
  try {
    await target.update({ [`system.currency.${key}`]: updatedTarget });
  } catch (error) {
    try { await source.update({ [`system.currency.${key}`]: oldSource }); }
    catch (rollbackError) { console.error(`${MODULE_ID} | Transfer rollback failed`, rollbackError); }
    throw error;
  }
  return amount;
}

/** Finds references to a denomination before destructive removal, including unlinked scene actors. */
export function findCurrencyHolders(key) {
  const holders = new Set();
  const check = doc => {
    if (!doc) return;
    if (Number(doc.system?.currency?.[key] ?? 0) !== 0) holders.add(doc.name || doc.uuid || "Unknown");
    for (const item of doc.items ?? []) {
      if (Number(item.system?.currency?.[key] ?? 0) !== 0) holders.add(`${doc.name}: ${item.name}`);
    }
  };
  for (const actor of game.actors?.contents ?? []) check(actor);
  for (const item of game.items?.contents ?? []) check(item);
  for (const scene of game.scenes?.contents ?? []) {
    for (const token of scene.tokens?.contents ?? []) {
      if (!token.actorLink) check(token.actor);
    }
  }
  return [...holders];
}

export class CurrencySettingsApp extends BaseApp {
  static DEFAULT_OPTIONS = {
    id: "acm-settings",
    classes: ["acm-window", "acm-settings"],
    window: { title: "Averis | Manage Currencies", resizable: true },
    position: { width: 750, height: 555 },
    actions: {
      add: this._onAdd,
      remove: this._onRemove,
      save: this._onSave,
      reset: this._onReset,
      chooseIcon: this._onChooseIcon
    }
  };
  static PARTS = { body: { template: `modules/${MODULE_ID}/templates/settings.hbs` } };

  constructor(options = {}) {
    super(options);
    this.draft = structuredClone(knownDefinitions());
    this.saving = false;
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    if (!game.user.isGM) throw new Error("Only the GM can manage currencies.");
    return { ...context, currencies: this.draft.map(c => ({ ...c })), limit: MAX_CUSTOM_CURRENCIES };
  }

  _pullDraft() {
    const rows = this.element?.querySelectorAll(".acm-settings-row") ?? [];
    this.draft = Array.from(rows, row => ({
      id: row.querySelector('[data-field="id"]')?.value ?? "",
      name: row.querySelector('[data-field="name"]')?.value ?? "",
      abbreviation: row.querySelector('[data-field="abbreviation"]')?.value ?? "",
      valueGP: row.querySelector('[data-field="valueGP"]')?.value ?? "",
      icon: row.querySelector('[data-field="icon"]')?.value ?? DEFAULT_ICON
    }));
  }

  static async _onAdd() {
    if (!game.user.isGM) return;
    this._pullDraft();
    if (this.draft.length >= MAX_CUSTOM_CURRENCIES) {
      return ui.notifications.warn(`Maximum ${MAX_CUSTOM_CURRENCIES} currencies.`);
    }
    let n = 1;
    while (this.draft.some(c => c.id === `custom${n}`) || Object.hasOwn(CONFIG.DND5E.currencies, `custom${n}`)) n++;
    this.draft.push({ id: `custom${n}`, name: "New Currency", abbreviation: `C${n}`, valueGP: 1, icon: DEFAULT_ICON });
    await this.render();
  }

  static async _onRemove(_event, target) {
    if (!game.user.isGM) return;
    this._pullDraft();
    const row = target.closest("[data-currency-id]");
    const rows = Array.from(this.element.querySelectorAll(".acm-settings-row"));
    const index = rows.indexOf(row);
    if (index < 0) return;
    const id = row.dataset.currencyId;
    const existing = knownDefinitions().some(c => c.id === id);
    if (existing) {
      const holders = findCurrencyHolders(id);
      if (holders.length) {
        return ui.notifications.error(`Cannot remove ${id}; money exists on: ${holders.slice(0, 5).join(", ")}.`);
      }
      const approved = await foundry.applications.api.DialogV2.confirm({
        window: { title: "Remove Currency" },
        content: `<p>Remove <strong>${id}</strong>? Backup your World first. Compendium data cannot be checked automatically.</p>`
      });
      if (!approved) return;
    }
    this.draft.splice(index, 1);
    await this.render();
  }

  static async _onChooseIcon(_event, target) {
    if (!game.user.isGM) return;
    const row = target.closest(".acm-settings-row");
    const field = row?.querySelector('[data-field="icon"]');
    if (!field) return;
    const picker = new foundry.applications.apps.FilePicker({
      type: "image",
      current: field.value,
      callback: path => {
        field.value = path;
        const image = row.querySelector("img");
        if (image) image.src = path;
      }
    });
    await picker.render({ force: true });
  }

  static async _onSave() {
    if (!game.user.isGM || this.saving) return;
    this.saving = true;
    try {
      this._pullDraft();
      const stored = knownDefinitions();
      const ownedIds = new Set(stored.map(c => c.id));
      const otherIds = Object.keys(CONFIG.DND5E.currencies).filter(key => !ownedIds.has(key));
      const validated = validateCurrencyList(this.draft, otherIds);
      const removed = stored.filter(c => !validated.some(v => v.id === c.id));
      for (const currency of removed) {
        const holders = findCurrencyHolders(currency.id);
        if (holders.length) throw new Error(`Cannot remove ${currency.id}: ${holders.length} actor(s)/item(s) still hold it.`);
      }
      await game.settings.set(MODULE_ID, "currencies", validated);
      ui.notifications.info("Currencies saved. Reload all connected clients to refresh the native D&D 5e sheets.", { permanent: true });
      this.draft = structuredClone(validated);
      await this.render();
    } catch (error) { notifyError(error); }
    finally { this.saving = false; }
  }

  static async _onReset() {
    this.draft = structuredClone(knownDefinitions());
    await this.render();
  }
}

export class WalletApp extends BaseApp {
  static DEFAULT_OPTIONS = {
    classes: ["acm-window", "acm-wallet"],
    window: { title: "Averis | Currency Wallet", resizable: true },
    position: { width: 610, height: 610 },
    actions: {
      change: this._onChange,
      exchange: this._onExchange,
      transfer: this._onTransfer
    }
  };
  static PARTS = { body: { template: `modules/${MODULE_ID}/templates/wallet.hbs` } };

  constructor(actor, options = {}) {
    super(options);
    this.actor = actor;
    this.busy = false;
  }

  get title() { return `Currency Wallet | ${this.actor?.name || "Actor"}`; }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    checkOwner(this.actor);
    const currencies = nativeCurrencies().map(currency => ({
      ...currency,
      balance: Number(this.actor.system.currency?.[currency.id] ?? 0)
    }));
    const targets = game.actors.contents
      .filter(actor => actor.id !== this.actor.id && actor.isOwner && actor.system?.currency)
      .map(actor => ({ id: actor.id, name: actor.name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return { ...context, actorName: this.actor.name, currencies, targets, hasTargets: Boolean(targets.length) };
  }

  async _perform(action) {
    if (this.busy) return;
    this.busy = true;
    try {
      await action();
      await this.render();
    } catch (error) { notifyError(error); }
    finally { this.busy = false; }
  }

  static async _onChange(_event, target) {
    const row = target.closest("[data-currency-id]");
    const id = row?.dataset.currencyId;
    const quantity = row?.querySelector(".acm-change-amount")?.value;
    if (!id) return;
    await this._perform(async () => {
      const amount = parseCoinAmount(quantity);
      await adjustCurrency(this.actor, id, target.dataset.operation === "remove" ? -amount : amount);
      ui.notifications.info(`${this.actor.name}: currency balance updated.`);
    });
  }

  static async _onExchange() {
    await this._perform(async () => {
      const from = this.element.querySelector('[name="acm-exchange-from"]')?.value;
      const to = this.element.querySelector('[name="acm-exchange-to"]')?.value;
      const quantity = this.element.querySelector('[name="acm-exchange-quantity"]')?.value;
      const gained = await exchangeCurrency(this.actor, from, to, quantity);
      ui.notifications.info(`Currency exchanged. Received ${gained} ${to}.`);
    });
  }

  static async _onTransfer() {
    await this._perform(async () => {
      const id = this.element.querySelector('[name="acm-transfer-currency"]')?.value;
      const targetId = this.element.querySelector('[name="acm-transfer-target"]')?.value;
      const quantity = this.element.querySelector('[name="acm-transfer-quantity"]')?.value;
      const target = game.actors.get(targetId);
      if (!target) throw new Error("Choose a valid target actor.");
      await transferCurrency(this.actor, target, id, quantity);
      ui.notifications.info(`Transferred ${quantity} ${id} to ${target.name}.`);
    });
  }
}
