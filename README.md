# Torn Lending Bank — GitHub / Cloudflare edition

Version 1.1.0-beta.1. Owner: Aaron112293 [3542697].

This is a migration candidate, not a deployed replacement. The source and two installable script bundles are ready. The source is prepared for quill112293/torn-lending-bank. Cloudflare deployment and testing on the owner's iPhone/Torn PDA are still pending. Do not retire the existing bank until its records have been exported, imported and checked.

## What changed

- Full bank controls render inside Torn through the userscript. No hosted iframe or ChatGPT login is used.
- GitHub stores the source and can distribute script updates; Cloudflare Workers hosts the API and optional full-page dashboard, with D1 for shared records.
- Login verifies the Torn account against Torn's API. The key remains in client memory and passes only to this bank's backend and Torn for requested checks. The backend stores only a digest of a random 12-hour session token. It never stores Torn API keys. Reloading Torn requires a fresh login; signing in again rotates the old login for that account.
- Access starts with the owner. Active staff and owner-invited borrower IDs can sign in. Invitations do not grant lender privileges.
- Original calculation engine, trade reconciliation and role rules are preserved. Only the owner can lift restrictions.
- The owner can import an existing owner export once into an empty bank. No existing records are included in this repository or archive.

## Free account setup

Use Cloudflare's **Workers Free** plan. This project does not require a custom domain, paid Workers plan or paid database. Free usage limits apply; this is not a promise of unlimited capacity. Keep paid upgrades disabled unless you explicitly choose them later. The GitHub check workflow is manual so it does not spend CI minutes on each push.

1. The source repository is https://github.com/quill112293/torn-lending-bank. It contains application code and fictional demo data only. Never upload live record exports, API keys or credentials. The bank API remains invitation-only independently of the public source repository.
2. Create or sign into your free Cloudflare account.
3. On a computer with Node.js 22.13+ and this source, run:

```sh
npm ci
npx wrangler login
npx wrangler d1 create torn-lending-bank
```

4. Copy the actual `database_id` from Cloudflare's result and configure it:

```sh
node scripts/configure.mjs YOUR_ACTUAL_DATABASE_ID
npm run build
npm test
npm run deploy
```

`npm run deploy` applies the SQL migration to the configured database and publishes the Worker and static assets. Check that the configured database belongs to this new bank before running it. Account creation, login and any account permissions must be completed by the owner; never put Cloudflare tokens or Torn keys in chat, source files or a public repository.

5. Use the **actual** `https://…workers.dev` address returned by deployment. Open it and verify Torn ID 3542697 with your own API key. A Public key suffices for account/profile verification. A Limited or suitable custom key is needed only for trade checks.
6. Rebuild the native scripts using that exact bank origin. For a public GitHub repository, set `RELEASE_REPO` to its actual `owner/name` as well:

```sh
BANK_ORIGIN=https://YOUR_ACTUAL_WORKER.workers.dev RELEASE_REPO=YOUR_ACTUAL_OWNER/YOUR_ACTUAL_REPO npm run build
```

Omit `RELEASE_REPO` for a private source repository. Publish again after rebuilding, and copy the two generated `dist/public/downloads/*.user.js` files into the repository's top-level `downloads/` directory for GitHub raw links. The configured source must be rebuilt after every UI change. The included unconfigured script bundles instead ask for the deployed bank address on each page load and can open a disconnected demo.

7. Disable the older bank script, import the Lender script into Torn PDA and reload Torn. Install only one of the Lender/Borrower scripts per device. They share the same UI; server permissions come from the verified Torn ID, not the filename.

## Move existing records before inviting testers

1. Open **Connections → Export my accessible records** on the original bank while signed in as owner.
2. On the new bank, open **Connections → Move existing bank records**. Choose the owner JSON export, type `IMPORT`, and import it before recording new activity.
3. Compare loan counts, funding totals, balances, staff assignments and restrictions with the original bank.
4. Only after that comparison, use **Connections → Private beta access** to invite a trusted borrower's Torn ID. Use Team to grant staff roles deliberately.
5. Stop entering records in the old system once the new system is accepted. Keep the old export as a private backup.

The import rejects a changed owner and any destination with recorded activity. It does not overwrite a working bank. If an export exceeds the beta import size or fails validation, keep the original bank and arrange a reviewed migration. Do not commit exports into GitHub.

## Development and validation

```sh
npm ci
npm run build
npm test
npx wrangler deploy --dry-run
npm run db:local
npm run dev
```

The tests use an in-memory SQLite adapter for D1 SQL and mocked Torn responses. No real API keys, trades or loans are used. All 33 tests passed during preparation, including the original 21 lending tests and 12 authentication/migration tests. Live Cloudflare integration, browser UI review and iPhone/Torn PDA testing are still required.

API cross-origin access is restricted to Torn and the same bank origin. Native Torn PDA requests use its documented `PDA_httpGet` / `PDA_httpPost` functions; supported userscript managers use `GM_xmlhttpRequest`, with browser fetch as a fallback. Keys and session tokens are not put in URLs or local storage. Logs are disabled in the default Worker config. Database state remains capped for the beta; archiving is needed for large histories.

## Deployment status

- Existing Sites source inspected at commit `4a83550ff472e68c5d1e5c4ed82469cc4890b3ca`.
- Existing hosted bank left unchanged.
- Existing bank data has not been migrated. The available database preview truncated its state, so it was not treated as a valid backup.
- GitHub repository: https://github.com/quill112293/torn-lending-bank (created by the owner).
- Cloudflare account connection and deployment are pending.
- No paid plan, subscription or custom domain was purchased.

## References

- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/d1/platform/pricing/
- https://developers.cloudflare.com/workers/static-assets/binding/
- https://developers.cloudflare.com/d1/reference/migrations/
- https://github.com/Manuito83/torn-pda/blob/master/userscripts/README.md
