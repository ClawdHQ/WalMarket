# WalMarket Seller Agent

This package runs the two off-chain services a **self-hosted** WalMarket seller needs:

- **`rental-key-manager`** — registers/revokes MemWal delegate keys when someone buys or rents your namespace.
- **`query-responder`** — answers prospective buyers' try-before-you-buy questions with a real AI-generated answer (MemWal's `/api/ask`), then posts the answer on-chain.

You run this package yourself, with your own credentials, and it acts on your behalf autonomously — WalMarket never sees this key.

> **Don't want to run anything?** The Sell page's default option ("Let WalMarket handle it") skips all of this: paste your memories in, and WalMarket creates and owns a dedicated MemWal account for you, running both services on its own infrastructure. This package and the rest of this README are only relevant if you specifically want full custody of your own MemWal account (the "I'll run my own agent" option on Sell).

## Why a separate agent keypair

You'll sign in to the WalMarket website with your wallet (e.g. via Google/zkLogin) to create and manage your listing — that's an ephemeral browser session with no exportable private key, which is fine for occasional actions like setting your price. But this agent needs to sign transactions continuously, with nobody watching a browser tab. That requires a long-lived keypair it holds directly — a different identity than your browser wallet.

This split is intentional: your **owner** wallet (browser/zkLogin) manages the listing — price, delisting, who's authorized to act for you. Your **operator** keypair (this agent) is the one actually authorized to answer queries on your behalf. You can change which operator address is authorized at any time, without touching your owner wallet.

## One-time setup

1. **Generate an agent keypair and MemWal account.** Set `MEMWAL_PRIVATE_KEY` in `.env` to a hex-encoded Ed25519 private key (generate one any way you like — `Ed25519Keypair.generate()` from `@mysten/sui`, or your own tooling). Then run:

   ```
   npm run create-account
   ```

   This creates a MemWal account *owned by that key* and prints the account ID. Copy it into `MEMWAL_ACCOUNT_ID` in `.env`.

2. **Seed your memories into MemWal** under whatever namespace you'll list (see `seeder.ts` for the pattern — store memories via the MemWal SDK against your new account/namespace).

3. **Create your listing on the WalMarket website**, signed by your normal wallet (owner). Note the listing ID.

4. **Authorize this agent to answer queries for that listing** — from the listing's Sell/manage page, run "Connect your seller agent" and paste in this agent's Sui address (derived from `MEMWAL_PRIVATE_KEY`; `npm run create-account` prints it). Under the hood this calls `set_operator(listing, yourAgentAddress)` — only your owner wallet can do this.

5. **Run the agent:**

   ```
   npm start
   ```

   or from the repo root: `pnpm agent`. Leave it running — it's what registers buyers' delegate keys and answers their queries. If it's down, purchases made in the meantime won't be queryable until you restart it (it replays missed on-chain events on every startup, so nothing is lost — it just needs to actually be running to catch up).

## Running standalone vs. via the web app

`apps/web`'s `instrumentation.ts` can also boot these same services in-process for local dev/single-seller deployments — see its comments for when that's appropriate vs. running this package yourself. For a real multi-seller marketplace, each seller runs their own copy of this package with their own `.env`; the web app itself never holds seller keys.

## Other scripts in this package

- `npm run seed` (`src/seeder.ts`) — seeds 3 demo namespaces (`sui-defi-research`, `move-dev-knowledge`, `web3-market-intel`) with real MemWal memories and creates a WalMarket listing for each. Useful for populating a fresh marketplace for local dev or a demo recording; not part of the one-time seller setup above. Re-running it without `SKIP_MEMORY_SEED=true` will duplicate the memories already stored.
- `npm run query-responder` / `npm run rental-key-manager` — run either service individually instead of both via `npm start`, useful for debugging one in isolation.

## Mainnet

Everything above targets testnet (`MEMWAL_PRIVATE_KEY`/`MEMWAL_ACCOUNT_ID` against testnet MemWal, `sui client switch --env testnet`). Moving a self-hosted agent to mainnet is a matter of switching the Sui CLI environment, generating a mainnet-funded keypair, and pointing at mainnet MemWal/relayer endpoints once WalMarket's own contracts are published there — see the root [README's Roadmap](../../README.md#roadmap).
