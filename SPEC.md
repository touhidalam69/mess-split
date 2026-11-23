# Mess Split: spec

One page for a student mess: who paid for bazar, who owes whom.

## Members
- Add a member by name. Empty or duplicate names (any case)
  are refused with a message.
- A member who has payments cannot be removed.

## Payments
- A payment has a payer, an amount and a note.
- The amount is whole taka, 1 to 100000. Anything else is refused.

## Balances
- Add up all payments. Each member's share is total / members,
  in whole taka. Leftover taka go to members in the order they
  were added: 100 Tk for 3 members -> 34, 33, 33.
- Balance = paid - share. Balances always add up to 0.

## Settle up
- The fewest transfers: the biggest debtor pays the biggest
  creditor, repeat until every balance is 0.
- Show each one as "Selim pays Rahim 500 Tk". No paisa anywhere.

## Storage
- Everything is saved in localStorage and survives a refresh.

## Tech
- Plain HTML, CSS and JavaScript: no framework, no build step.
- index.html at the root (GitHub Pages serves it as is).
- The money logic is pure functions in split.js, tested with
  node --test in test/. Works on a phone screen.
