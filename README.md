# Torn Lending Bank — GitHub / Cloudflare edition

Version 1.1.0-beta.8. Owner: Aaron112293 [3542697].

The bank is deployed at https://torn-lending-bank.975y7srs57.workers.dev. The source and two native userscripts are configured for that address and for updates from this GitHub repository. The owner’s beta.5 diagnostics confirm successful login/logout and account checks. The beta.6 iPhone/Torn PDA report confirms remembered bank access and eight successful bank reads with no HTTP 0. Three account checks returned HTTP 400; the empty-key path reproduces the same 52-byte error response. Lending operations still need a signed-in trial. Do not retire the existing bank until its records have been exported, imported and checked.

## What changed

- Private beta invitations now use an explicit button action and app-rendered validation, so browser form constraints cannot silently prevent the submit handler. Paste a numeric Torn ID, Name [ID], or a Torn profile link. Invalid input shows guidance; successful writes show the exact ID enabled and update the list immediately. Repeated taps while a request is pending are ignored.
- Invitations grant borrower access only and do not send a Torn message. Share the borrower userscript with the tester, who signs in using their own key. Inviting uses the owner’s bank session and does not require re-entering the owner’s Torn API key. A Refresh access list button reloads the saved list.
- The owner reported that tapping Invite borrower had no visible effect. The exact on-device cause has not been reproduced; the beta.8 form changes address the silent browser-validation path and add clear feedback for retesting.

- Connections now explains that the bank login remains active while live Torn checks need the API key entered again after closing the panel. Account, trade and borrower-check buttons stay disabled until a complete 16-character alphanumeric key is present. Automatic checks pause if the key becomes incomplete.
- The client also rejects empty or malformed keys before sending a login, account-check or trade-check request. This preserves the remembered bank session and leaves bank records accessible. Keys are still held only in memory.

- Sign-in now performs exactly one bank read after the account check. Previously the nested check handler refreshed the bank, then sign-in immediately refreshed it again; the owner’s diagnostic report showed that duplicate returning an undefined Torn PDA response (HTTP 0).
- Overlapping bank refreshes share one in-flight request. Results are not cached, failures can be retried, and writes/session changes invalidate the shared read. Writes are never combined or automatically retried. A failed optional account check still loads the bank once and keeps its warning visible.

- Copy diagnostics is available on the sign-in screen, bank header and Connections. It copies only version, time, screen, session/key-presence booleans, storage type, request capabilities and the last 16 connection results. Results contain operation names, timings, HTTP status and response field types/lengths. Request bodies, response bodies, URLs with paths or queries, API keys, session tokens, account identities and bank records are excluded. The report is never sent automatically or saved by the app. If clipboard access fails, a selectable report opens for manual copying.
- The duplicate refresh is removed. The beta.6 iPhone report has eight successful bank reads and no HTTP 0. The reason Torn PDA returned undefined for the old duplicate remains unconfirmed. Diagnostics remain available for any further failure.

- A labelled Log out button is visible at the top of every signed-in bank screen. It clears the API key and account checks, pauses automatic checks, removes the remembered bank login and requests server-side session revocation. In the fictional demo it exits the demo. Closing or minimizing the panel still preserves the bank login.

- Full bank controls render inside Torn through the userscript. No hosted iframe or ChatGPT login is used.
- GitHub stores the source and can distribute script updates; Cloudflare Workers hosts the API and optional full-page dashboard, with D1 for shared records.
- Login verifies the Torn account against Torn's API. The key remains in client memory and passes only to this bank's backend and Torn for requested checks. The backend stores only a digest of a random 12-hour session token. It never stores Torn API keys. Remember this device saves only that bank session, with its original expiry, for up to 12 hours. The Torn API key is never persisted. Closing the panel clears the key but preserves the bank session; Log out at the top of the bank (also available in Connections) removes the saved session and revokes it on the server. Signing in again rotates the old login for that account.
- Create key in Torn opens Torn’s official custom-key creation link. Borrower keys request user/basic, profile, personalstats and job; lender keys add trades and trade. The page identifies these permissions before opening Torn. Users review Torn’s permission popup and copy the key back themselves. The script does not create keys in the background or read the key from Torn’s settings page.
- Native HTTP requests identify the app with a descriptive User-Agent, following Cloudflare’s guidance for workers.dev error 1010. Unexpected responses report a safe status message, never their raw contents. Saves are not automatically retried.
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

The build defaults to this bank's live address and `quill112293/torn-lending-bank`; normal Cloudflare builds need no build variables. To build for another bank, override both variables. For private repositories, set `RELEASE_REPO=` to omit public update links. Publish again after rebuilding, and copy the two generated `dist/public/downloads/*.user.js` files into the repository's top-level `downloads/` directory for GitHub raw links. Rebuild the scripts after every UI change. Setting `BANK_ORIGIN=` creates unconfigured bundles that ask for a bank address.

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

The tests use an in-memory SQLite adapter for D1 SQL and mocked Torn responses. No real API keys, trades or loans are used. All 77 tests passed during preparation: the original 21 lending tests, 15 backend/authentication/migration tests, 29 transport/session/key tests, 4 invite-input tests, 4 sign-in flow tests and 4 diagnostic privacy/shape tests. Regression tests cover exactly one bank read after login, optional-check failure, shared refreshes, retry after an undefined response and invalidation on writes/session changes. The beta.6 diagnostic report confirms successful live iPhone bank reads without HTTP 0. New tests reproduce the empty-key HTTP 400, verify that invalid keys send no request or revoke no session, and confirm that entering a complete key enables live checks without signing in again. Invitation regressions cover supported pasted formats, rejected ambiguous input, persisted duplicate-safe invitations using only the bank session, and owner-only access management. The beta.8 invitation controls need an on-device retest; lending operations need a signed-in trial.

API cross-origin access is restricted to Torn and the same bank origin. Native Torn PDA requests use its documented `PDA_httpGet` / `PDA_httpPost` functions; supported userscript managers use `GM_xmlhttpRequest`, with browser fetch as a fallback. Keys and session tokens are never put in URLs. Remembered bank sessions use Torn PDA’s per-script PDA_storage when available, then userscript-manager storage, then origin-scoped localStorage. These device stores are not an encryption boundary; the saved session permits access to that account’s bank records until expiry or revocation. Torn API keys stay in memory only. Live Torn account/trade checks therefore need the key again after a page reload. Expired, malformed, other-bank and revoked sessions are discarded. A storage failure keeps only an in-memory login and displays a notice. Logs are disabled in the default Worker config. Database state remains capped for the beta; archiving is needed for large histories.

## Deployment status

- Existing Sites source inspected at commit `4a83550ff472e68c5d1e5c4ed82469cc4890b3ca`.
- Existing hosted bank left unchanged.
- Existing bank data has not been migrated. The available database preview truncated its state, so it was not treated as a valid backup.
- GitHub repository: https://github.com/quill112293/torn-lending-bank (created by the owner).
- The owner deployed the bank successfully with `npm run deploy`; the public health endpoint responds successfully.
- Configured D1 database: `acc5f973-6395-4fc5-ab5d-5832ddc4a322`.
- The production build defaults to the verified workers.dev address, and native script metadata includes GitHub update URLs.
- No paid plan, subscription or custom domain was purchased.

## References

- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/d1/platform/pricing/
- https://developers.cloudflare.com/workers/static-assets/binding/
- https://developers.cloudflare.com/d1/reference/migrations/
- https://github.com/Manuito83/torn-pda/blob/master/userscripts/README.md

- https://github.com/Manuito83/torn-pda/blob/master/userscripts/TornPDA_Storage.md
- https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/error-1010/
- https://www.torn.com/forums.php?a=0&b=0&f=63&p=threads&t=16249068
- https://www.torn.com/swagger.php
