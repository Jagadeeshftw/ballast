# Ballast — backend and convenience layer

The money path stays trustless and on-chain. A lightweight backend handles the convenience
layer: notifications, runway alerts, and prompting the user to top up. No backend code ever
moves funds or touches a wallet.

---

## 0. Before building anything

**Update the claim everywhere first.** "Nothing of ours running" is in seven places:

- landing page hero subheading
- landing page How it works
- README
- `/docs/how-it-works`
- shot 3 narration in `docs/video-script.md`
- shot 2 narration
- any other surface you find

Change every instance to: **"no keeper in the money path."**

That is still true and still meaningful. The engine is still reactive. The backend handles
notifications and alerts, not funds.

---

## 1. Database

Use the connection string from `.env`. Preferred: Postgres (Neon or similar).

Schema:

```sql
-- one row per connected wallet, upserted on connect
wallets (
  address         text primary key,
  created_at      timestamptz default now(),
  last_seen_at    timestamptz
)

-- notifications for a wallet
notifications (
  id              uuid primary key default gen_random_uuid(),
  address         text references wallets(address),
  kind            text not null,   -- see kinds below
  title           text not null,
  body            text not null,
  data            jsonb,           -- tx hash, amount, reason, etc.
  read            boolean default false,
  created_at      timestamptz default now()
)

-- engine runway snapshots, written by the watcher
engine_snapshots (
  id              uuid primary key default gen_random_uuid(),
  engine_address  text not null,
  balance_stt     numeric not null,
  callbacks_per_hour numeric,
  hours_remaining numeric,
  snapshot_at     timestamptz default now()
)
```

Notification kinds:
- `cover_opened` — cover bought this window
- `cover_declined` — window declined, with reason
- `cover_settled_won` — window paid out
- `cover_settled_lost` — window closed up, premium spent
- `vault_low` — free balance below two windows of premium
- `vault_empty` — free balance zero
- `engine_low` — runway under 8 hours
- `engine_stopped` — engine below the 32 STT floor

---

## 2. Backend server

Minimal Express or Next.js API routes. Two jobs and a REST surface.

### Chain watcher (runs continuously)

Polls the chain every 30 seconds:

- reads enrolled wallets from the engine's cursor set
- for each enrolled wallet: reads vault balance, policy, exposure, and the last 10 events
  from the engine for that wallet
- compares against the previous snapshot and writes new notifications for any change
- reads engine balance and writes an `engine_snapshot` row
- fires `engine_low` if runway under 8 hours, `engine_stopped` if below 32 STT floor

This is the only thing that watches. It does not send transactions, does not call
`approve()`, and has no access to any private key.

### REST endpoints

```
GET  /api/notifications?address=0x…     list unread, newest first, max 50
POST /api/notifications/read            mark as read: { ids: [...] }
GET  /api/engine/health                 current snapshot
GET  /api/vault/status?address=0x…      balance, policy, exposure, isCoverable
```

All endpoints are read-only on chain state or write-only on notification state. None of them
touch funds.

### Authentication

Sign a message with the connected wallet. Store a session token in an httpOnly cookie.
Never store a private key server-side.

---

## 3. Notifications panel

A bell icon in the top bar with an unread count badge. Clicking it opens a panel.

Each notification shows: kind icon, title, body, time (relative, UTC on hover), and a link
to the relevant transaction or page.

Empty state: "No notifications yet. When Ballast buys cover, settles a window, or needs
attention, it will appear here."

Mark as read on open. Individual dismiss. Clear all.

The panel polls the `/api/notifications` endpoint every 30 seconds when open.

Notification copy:

| Kind | Title | Body |
| --- | --- | --- |
| `cover_opened` | Cover bought | Spent {premium} tUSDC for {contracts} Down contracts. Makes you whole at {achieved}% of a fall. |
| `cover_declined` | Window declined | {reason in plain English} |
| `cover_settled_won` | Window paid out | ETH closed below the strike. {payout} tUSDC credited to your vault. |
| `cover_settled_lost` | Window closed up | ETH did not fall. Premium of {premium} tUSDC spent. |
| `vault_low` | Vault running low | {balance} tUSDC free — about {n} windows left at the current premium. Deposit more to stay covered. |
| `vault_empty` | Vault empty | No tUSDC free. Ballast will not buy cover until you deposit. |
| `engine_low` | Engine runway low | {hours} hours of STT remaining. Send STT to {engine_address} to keep the engine running. |
| `engine_stopped` | Engine stopped | Below the 32 STT scheduling floor. Send STT to {engine_address} to restart. |

---

## 4. Auto top-up prompt

Not an automatic transaction. A prompt that tells the user their vault is low and lets
them top up in one click.

When vault balance falls below two windows of estimated premium:

1. a notification fires (`vault_low`)
2. on Overview, a banner appears above the live window: "Your vault is running low — about
   {n} windows left. Top up now." with a button that opens Funds pre-filled with a suggested
   amount (ten windows of premium)
3. the Funds page highlights the deposit field and pre-fills it

The user still sends the transaction. Nothing automatic moves funds.

A "remind me later" dismisses the banner for the current session. It comes back next session
if the balance is still low.

---

## 5. What does not change

- The engine contracts. No new contract, no redeploy.
- The same-block reactive path. Still no keeper in the money path.
- The custody model. Unreserved balance is still withdrawable unconditionally.
- The quality floor. All seventeen routes still pass, both themes, four widths.
- The no-JS render on `/`. The backend is for `/app` only.

---

## 6. Build order

1. Update the claim in all seven places.
2. Schema and database connection.
3. Chain watcher as a standalone script, verified against the live chain.
4. REST endpoints.
5. Notifications panel on the frontend.
6. Vault-low banner and Funds pre-fill.
7. Full sweep.

Report after step 3 with what the watcher is actually reading, before wiring it to the
database.

---

## 7. Environment

Database connection string is in `.env`. Do not commit it. Do not log it. Confirm it is
absent from the working tree and history before the first push.