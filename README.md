# Averis Currency Manager v0.1.0

Add **real, custom currencies** to the native D&D 5e currency system. Built for Foundry VTT **v14** / D&D 5e **6.0.6** (code-level verification only; requires testing in a running Foundry world).

## Features

- GM can create currencies with unique ID, full name, abbreviation, icon path and conversion value relative to GP.
- New denominations are registered in `CONFIG.DND5E.currencies` on load, and stored on actors in **`system.currency.<id>`**, alongside built-in GP, SP, CP, EP and PP.
- Existing D&D 5e currencies remain unchanged.
- Native character/NPC currency sheet fields use the system's built-in display. An optional **Currency Wallet** appears in the actor sheet's header menu (three dots).
- Add/remove coins, exchange currencies with whole-coin exactness, and transfer coins between actors you own.
- Security: GM-only world currency definition settings, plus actor ownership checks. Negative balances are rejected.
- Basic programmatic API for other modules (see below).
- Scoped styling built on the existing Foundry theme, no alternate sheet styling or framework.

## Installation (ZIP, offline)

1. **Back up your Foundry World.**
2. Unzip and put the entire folder **`averis-currency-manager`** in `<Foundry User Data>/Data/modules/` so the manifest is at `Data/modules/averis-currency-manager/module.json`.
3. Restart Foundry if the module doesn't appear immediately. Enable **Averis Currency Manager** in Manage Modules.
4. As GM, open **Game Settings → Configure Settings → Averis Currency Manager → Manage Custom Currencies**.
5. Click **Add Currency**, define your coin, and **Save Currencies**.
6. **Reload the Foundry client for the GM and all connected players.** The dnd5e data model and native coin icons are set up during initialization.
7. Open a D&D 5e actor sheet. New currencies should appear with the ordinary currency fields. Open the actor sheet's **header menu → Currency Wallet** to adjust, exchange or transfer money.

## Example

- ID: `suncoin`
- Name: `Sun Coin`
- Abbreviation: `SUN`
- Value (GP): `5` (one Sun Coin is worth five GP)
- Icon: `modules/averis-currency-manager/assets/coin.svg`

Use the asset browser to copy image paths into the settings. You can use custom `.svg`, `.webp`, `.png` or similar image assets already uploaded to Foundry.

## Data, compatibility & limitations

- The module **does not** replace the Foundry D&D 5e sheet or monkeypatch core methods.
- The source of truth is the native actor `system.currency` object; it is not a parallel wallet.
- **Do not disable/remove custom currencies while actors hold them.** The manager checks actors, world items and unlinked scene tokens before removing a denomination, but it cannot exhaustively check compendium content. Make a world backup before deleting or changing rates.
- New currency keys should be treated as permanent; renaming an ID is functionally removing one currency and creating another, and balances are **not** automatically migrated.
- D&D 5e `conversion` config is *number of units per GP*. The manager displays *GP value of a single unit* and calculates `conversion = 1 / valueGP`.
- Exact-coin exchange rejects fractional results and applies no fee.
- Transfers use two document updates, with best-effort rollback if the second fails. They are **not a fully atomic database transaction**; avoid simultaneous transfers from the same wallet. A GM can use native sheet fields for manual corrections.
- Players need OWNER permissions on both actors for transfers. Sending to an actor they do not own is not supported in this first version.
- Existing actors should inherit the configured currency data after world reload. If an actor sheet does not show new currencies, try reopening it or making a trivial currency update; an older dnd5e bug affected some existing actors.
- NPC Shops and other shop modules may recognize custom currencies **only if they read the native config and handle extra currency keys dynamically**. Integration is not yet verified.
- No automatic migration from other currency modules; do not enable competing currency-overhaul modules without testing.
- This first release uses English in the manager and wallet; some UI entry labels are localized BG/EN.

## API for other Foundry modules

```js
const api = game.modules.get("averis-currency-manager")?.api;
api.getCurrencies();
api.openSettings();                 // GM only
api.openWallet(actor);              // owned actor
await api.adjustCurrency(actor, "suncoin", 3);
await api.adjustCurrency(actor, "suncoin", -1);
await api.exchangeCurrency(actor, "suncoin", "gp", 2);
await api.transferCurrency(sourceActor, targetActor, "suncoin", 1);
```

No module source is required to build the ZIP; this is an installable Foundry package. A live v14/6.0.6 runtime check is still recommended.
