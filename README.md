# Mess Split

A one-page web app for a student mess: who paid for bazar, and who owes whom. Built by Claude Code from
[`SPEC.md`](SPEC.md), tests first, in the DevStack Bangla video "AI দিয়ে App বানাই: Claude Code Bangla Tutorial,
Zero থেকে Live".

Live: https://touhidalam69.github.io/mess-split/

## What it does

- Members: add by name; empty or duplicate names (any case) are refused; a member with payments can't be removed.
- Payments: payer, whole taka from 1 to 100000, an optional note; a payment can be deleted.
- Balances: all payments added up and shared in whole taka; leftover taka go to the members added first
  (100 Tk for 3 members: 34, 33, 33). Balances always add up to 0.
- Settle up: the biggest debtor pays the biggest creditor until every balance is 0 ("Selim pays Rahim 33 Tk").
- Everything is saved in the browser's localStorage.

## Run it

No install and no build step. Open `index.html` in a browser, or serve the folder:

```
npx serve .
```

## Test it

Node.js 18 or later (the video used Node.js 26.12.1):

```
node --test
```

25 tests: names, amounts, notes, removing members, shares, balances, settle up, with seeded random checks.

## Files

| File | What it is |
| --- | --- |
| `SPEC.md` | the one-page spec the app was built from |
| `split.js` | the money logic as pure functions (works in the browser and in Node) |
| `test/split.test.js` | the tests, written before `split.js` |
| `index.html`, `style.css`, `app.js` | the page, its look, and the code that saves, draws and handles the forms |

Built with Claude Code 2.1.323 (claude-opus-5-5).
