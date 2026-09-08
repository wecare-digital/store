# WECARE Ops + Minimal Velo Design

## Goal

Make Blog search feel immediate, reduce the live WECARE.DIGITAL Velo runtime to visitor/customer essentials, and move administrator SKU tooling into a private Wix-dashboard development track called **WECARE Ops**.

## Approved Scope

1. Ultra-fast Blog search on `/blog` and Blog Post pages.
2. Live-site Velo keeps only:
   - Blog search.
   - Customer order display/selection experience.
   - Trusted eCommerce order-approved event and order-ID backend helpers.
3. Remove all 1-2 byte Wix page-code stubs from `src/pages` for cleanliness.
4. Move SKU-generation/admin source out of `src/backend` and into `apps/wecare-ops`.
5. WECARE Ops starts with sections: **Overview · Orders · Order IDs · SKU Manager · System Tools**.
6. Future internal admin features belong under `apps/wecare-ops`, not visitor-facing site Velo.

## Blog Search Behavior

- Reduce input debounce from 150 ms to a near-immediate 50 ms.
- Do not clear currently rendered results while the user is typing the next non-empty query.
- Empty input still clears/collapses search results immediately.
- A new successful response replaces old results.
- A current no-results response shows `No posts found` and clears the stale result rows.
- A current error shows the existing temporary-unavailable state.
- Preserve request-version guards so stale responses cannot overwrite a newer query.
- Preserve Enter-to-open, result click navigation, mobile result limit/touch sizing/scrolling, URL resolution, and editor-ID fallbacks.

## Minimal Site Runtime Boundary

### Keep under `src/backend`

- `events.js`
- `member-orders.web.js`
- `orderId-helpers.js`
- `orderId.web.js`
- `permissions.json`

### Keep under `src/public`

- `blog-search.js`
- `blog-search-url.js`

### Keep page code

- `Blog.e4rsm.js`
- `Post.q5tyt.js`
- `My Orders.vznnd.js`
- `Thank You Page.f0at2.js`
- `masterPage.js`

### Remove from live-site backend

- `catalog-v3.js`
- `sku-batch.web.js`

These are administrator-only SKU tools and have no customer-facing caller in the repository. Their source is retained under `apps/wecare-ops` before deletion from `src/backend`.

### Delete empty Wix page stubs

Delete page-code files whose GitHub content size is 1-2 bytes. Do not delete the five retained functional page files or `src/pages/README.md`.

## WECARE Ops Architecture

The source lives under `apps/wecare-ops` as a private Wix dashboard-app/dashboard-page development package. It is separated from the site `src` tree so Wix Site Git Integration does not deploy admin source into the live visitor runtime.

### Sections

- **Overview** — operational summary and links/status.
- **Orders** — admin order view backed by Wix eCommerce Orders APIs.
- **Order IDs** — operational view of the existing `OrderIds` mapping model.
- **SKU Manager** — preview/apply missing SKU generation, overwrite mode, prefix management, collision checking, dry-run-first behavior.
- **System Tools** — health/readiness checks and future admin-only utilities.

### SKU Safety Rules

- Default to dry run.
- Keep 8-character alphabet excluding `0/O/1/I`.
- Preserve multi-variant suffixing (`-01`, `-02`, ...).
- Scan existing SKUs before generating replacements.
- Never overwrite populated SKUs unless explicitly requested.
- Preserve full Catalog V3 option/variant arrays when updating product variants.
- Never perform product mutations as part of the migration itself.

## Wix Platform Boundary

Wix supports private dashboard pages and dashboard page extensions. However:

- Wix Editor dashboard pages can only be created in the Editor.
- Wix CLI dashboard extensions require an authenticated Wix CLI app project before build/deploy/install.
- The currently connected Wix site-management API plugin does not expose a custom-app/project creation action.

Therefore this change can fully prepare and isolate the WECARE Ops source, but it must not falsely claim the dashboard page/app is installed until that one-time Wix Editor or authenticated Wix CLI registration step has actually occurred.

## Verification

- TDD regression for retained-result behavior and reduced debounce.
- Existing Blog-search tests remain green.
- Runtime-boundary test updated so live `src` contains no SKU admin modules and no empty page stubs.
- Existing order-ID tests remain unchanged and their source files remain intact.
- SKU safety tests are retained with the migrated source path.
- GitHub compare must show no unintended customer-order changes.
- Wix site publish after merge.
- Post-publish Wix Site Search check must still resolve Blog posts to `/post/<slug>`.
