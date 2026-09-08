# Velo clean slate: order IDs, SKUs and blog search

## Approved scope

Remove all custom Velo behavior except customer order IDs, custom product SKUs, and the dependencies those features require. The user's latest instruction adds custom search on BOTH Blog and Post pages as an explicit exception: that shared feature must remain functional. This change does not delete Wix pages, blog posts, products, native orders, members, forms, apps, or CMS collections.

The source before cleanup is retained in GitHub commit `7e882d98f430bb3215cbb72cb9a450cfafe5cb05`. Deleted code can be restored from that commit. Do not restore it by overwriting newer unrelated work.

## Retained runtime

| File | Role |
| --- | --- |
| `src/backend/events.js` | Trusted order-approved event creates an ID; no notifications. |
| `src/backend/orderId-helpers.js` | ID formatting, mapping persistence, member paging. |
| `src/backend/orderId.web.js` | Member-authorized order-ID operations and display formatting. |
| `src/backend/member-orders.web.js` | Current member's order-ID dropdown options only. |
| `src/backend/catalog-v3.js` | Minimal Catalog V3 access required by SKU tools. |
| `src/backend/sku-batch.web.js` | Admin-only SKU assignment and prefix changes, dry-run by default. |
| `src/pages/My Orders.vznnd.js` | Customer order-ID history display. |
| `src/pages/Thank You Page.f0at2.js` | Order confirmation/custom-ID display; guest fallback preserves native confirmation. |
| `src/pages/masterPage.js` | Order-ID selection on the existing request form only. |
| `src/public/blog-search.js` | Shared, page-scoped Wix Search controller for blog posts. |
| `src/public/blog-search-url.js` | Search-result post URL resolution. |
| `src/pages/Blog.e4rsm.js` | Blog page search initialization. |
| `src/pages/Post.q5tyt.js` | Post page search initialization. |

Other page code files remain as empty placeholders. The native Wix page content is unchanged. Project metadata, dependency lockfiles, and permission configuration are scaffolding, not additional custom features.

## Removed custom behavior

- All custom HTTP endpoints, including discovery/LLM feeds, FAQ structured data, RSS, product feeds, catalog/order proxy endpoints and external WhatsApp Flow routes.
- SEO/self-hit scheduled job and its pinger.
- Translation/read-aloud relay, injected button styling, and URL hygiene.
- General product CRUD web module; SKU-specific management remains.
- Custom WhatsApp, SMS, RCS and AWS synchronization automation provider.
- Unused schema/SEO normalization and other catalog helpers not needed by SKU management.

External clients calling the removed HTTP endpoints or custom automation actions must be retired or rebuilt separately. The native Wix business apps remain installed. Preserve the custom search controls on both Blog and Post pages; the latest user instruction explicitly retains them.

## Order collection

The live `OrderIds` collection already exists. Its read/insert/update/remove permissions were verified as ADMIN. Its required keys are `customOrderId` and `wixOrderId`; `orderId` is a legacy alias. No collection is deleted or recreated by this cleanup. Existing IDs must not be renumbered. Additional optional fields, if required by the retained display code, must be added without replacing this collection or altering its required/immutable fields.

## Verification and release

Run `node --experimental-vm-modules --test tests/*.test.mjs` and `git diff --check`. Behavioral tests use controlled Wix API boundaries: they must not send notifications, create real orders, or write real SKUs.

On 2026-09-08, four optional TEXT fields were added to the existing live `OrderIds` collection: `memberId`, `productsSummary`, `totalAmount`, and `currency`. Read-back verified revision 6, all four fields, unchanged ADMIN permissions, and preserved required/immutable fields. No data items were created, updated, or deleted.

Before production publication, verify the schema requirements in `orderids-collection.json`, check actual Editor element IDs for the five retained page scripts, preview signed-in and guest confirmation behavior, and run SKU dry-run only. Verify search input, results, clicks, Enter, clearing, no-results and mobile behavior on both `/blog` and an actual `/post/<slug>` page. Do not run a non-dry-run catalog rewrite as a smoke test.

Wix Git integration syncs the default branch into the Editor; that is not a site publication. Use an authenticated Wix Editor or Wix CLI for Sites session to preview and publish, then verify the live revision. An unmerged branch/PR must never be described as a deployed cleanup.

This is the Velo-code cleanup. It does not claim to disable Wix-managed native SEO patterns, native sitemaps, dashboard custom-code injections, or external search-engine caches. Those are separate site settings and are not removed by deleting repository code.

An independent local review found no blocking defect. Release acceptance still needs actual Wix event delivery, member-owned order access, page-element wiring, and Catalog V3 behavior checked in Wix. SKU uniqueness is based on the fetched catalog and the current batch: run one batch at a time. Legacy mappings without a trusted member ID remain excluded from member lists; no historical ownership backfill is included.

## Blog and Post search exception

Both page scripts initialize the same page-scoped search controller with their own `$w` selector. Keep the current `wix-search` provider and the `Blog/Posts` document type; do not replace them with a CMS title-only query. Keep Wix Site Search installed and native indexing enabled. Search is not a custom SEO writer.

On 2026-09-08, a read-only query to Wix Site Search for `BLOG_POSTS` returned three indexed documents with a limit of three. A separate `wecare` query returned zero documents. These establish API/index availability, not browser or publication success. Published click/Enter acceptance still needs a real post URL (`/post/<slug>`), not merely the post route prefix `/post`.

Final local verification: 99/99 behavioral tests pass, including the 20 added search cases plus 14 search cases from concurrent main-branch commit `f3fd282f4df80df219907165ec713c4f3e5fd436`. That newer main search implementation and both page hooks are preserved exactly. All 61 source JavaScript files pass syntax checks and `git diff --check` is clean. Only 13 source files contain custom behavior (six backend modules, two shared search modules, five page scripts). The added search regressions first failed 15/20 cases against the earlier baseline, then passed after repair and again with the newer main implementation. No Wix publication was performed.
