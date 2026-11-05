/** Pure helpers for Averis Currency Manager. No Foundry globals are used here. */
export const MODULE_ID = "averis-currency-manager";
export const MAX_CUSTOM_CURRENCIES = 30;
export const DEFAULT_ICON = "modules/averis-currency-manager/assets/coin.svg";
export const STANDARD_KEYS = new Set(["pp", "gp", "ep", "sp", "cp"]);

export function normalizeCurrency(raw) {
  if (!raw || typeof raw !== "object") throw new Error("Invalid currency definition.");
  const id = String(raw.id ?? "").trim().toLowerCase();
  const name = String(raw.name ?? "").trim();
  const abbreviation = String(raw.abbreviation ?? "").trim();
  const icon = String(raw.icon ?? DEFAULT_ICON).trim() || DEFAULT_ICON;
  const valueGP = Number(raw.valueGP);
  if (!/^[a-z][a-z0-9_]{1,19}$/.test(id)) {
    throw new Error("Currency ID: use 2-20 lowercase letters, numbers or underscores; start with a letter.");
  }
  if (STANDARD_KEYS.has(id)) throw new Error(`Reserved D&D 5e currency ID: ${id}`);
  if (name.length < 1 || name.length > 60) throw new Error(`Invalid name for ${id} (1-60 characters).`);
  if (abbreviation.length < 1 || abbreviation.length > 12) {
    throw new Error(`Invalid abbreviation for ${id} (1-12 characters).`);
  }
  if (!Number.isFinite(valueGP) || valueGP <= 0 || valueGP > 1e9) {
    throw new Error(`Value in GP must be greater than 0 and at most 1,000,000,000 (${id}).`);
  }
  // Prevent CSS/script injection into the dnd5e currency icon styles generated during setup.
  const validLocal = /^(?!\/)(?!.*\.\.)(?!.*["'<>\\])(?:[a-zA-Z0-9_~.()\/%+\- ]+\/)*[a-zA-Z0-9_~.()\/%+\- ]+$/;
  const validRemote = /^https?:\/\/[a-zA-Z0-9._~%:/?#\[\]@!$&()*+,;=+-]+$/;
  if (!validLocal.test(icon) && !validRemote.test(icon)) {
    throw new Error(`Invalid icon path for ${id}. Use a Foundry asset path or an HTTPS URL.`);
  }
  return { id, name, abbreviation, icon, valueGP };
}

export function validateCurrencyList(raw, existingConfigKeys = []) {
  if (!Array.isArray(raw)) throw new Error("Currency settings must be an array.");
  if (raw.length > MAX_CUSTOM_CURRENCIES) {
    throw new Error(`Maximum ${MAX_CUSTOM_CURRENCIES} custom currencies are supported.`);
  }
  const used = new Set();
  const reserved = new Set([...STANDARD_KEYS, ...existingConfigKeys]);
  return raw.map(row => {
    const item = normalizeCurrency(row);
    if (used.has(item.id)) throw new Error(`Duplicate currency ID: ${item.id}`);
    if (reserved.has(item.id)) throw new Error(`Currency ID already used by D&D 5e or another module: ${item.id}`);
    used.add(item.id);
    return item;
  });
}

export function conversionForDnd5e(valueGP) {
  // D&D 5e's conversion field means "how many of this coin equal one gold".
  return 1 / valueGP;
}

export function parseCoinAmount(input, { allowZero = false } = {}) {
  const text = String(input ?? "").trim();
  if (!/^(0|[1-9]\d*)$/.test(text)) throw new Error("Enter a whole number of coins.");
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) {
    throw new Error(allowZero ? "Enter a non-negative, safe integer." : "Enter a positive, safe integer.");
  }
  return value;
}

export function calculateExchange(quantity, fromGP, toGP) {
  const amount = parseCoinAmount(quantity);
  if (!(Number.isFinite(fromGP) && fromGP > 0 && Number.isFinite(toGP) && toGP > 0)) {
    throw new Error("Invalid exchange rates.");
  }
  const result = (amount * fromGP) / toGP;
  const rounded = Math.round(result);
  if (!Number.isSafeInteger(rounded) || rounded < 1 || Math.abs(result - rounded) > 1e-8) {
    throw new Error("The exchange must yield an exact, positive number of whole coins. Adjust the amount.");
  }
  return rounded;
}

export function nextBalance(current, change) {
  const balance = Number(current ?? 0);
  if (!Number.isSafeInteger(balance) || balance < 0) throw new Error("Current balance is invalid.");
  if (!Number.isSafeInteger(change)) throw new Error("Change must be a whole number.");
  const next = balance + change;
  if (!Number.isSafeInteger(next) || next < 0) throw new Error("Insufficient funds or amount exceeds the safe limit.");
  return next;
}
