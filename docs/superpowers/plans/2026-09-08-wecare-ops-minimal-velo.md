# WECARE Ops + Minimal Velo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Blog search near-instant, minimize live-site Velo to customer/runtime essentials, and relocate administrator SKU tooling into a WECARE Ops dashboard development package.

**Architecture:** Keep visitor/customer logic under the Wix Site `src` tree. Move administrator-only SKU code under `apps/wecare-ops`, where it can be attached to a private Wix dashboard page/app without shipping admin code as visitor site Velo. Preserve current order-ID behavior and Wix Search routing.

**Tech Stack:** Wix Editor + Velo, Wix Search, Wix Stores Catalog V3, Wix eCommerce Orders, Node `node:test`, GitHub Site Git Integration, future Wix dashboard page/CLI app.

**Spec:** `docs/superpowers/specs/2026-09-08-wecare-ops-minimal-velo-design.md`

## Global Constraints

- Preserve Blog/Post search, `/post/<slug>` navigation, mobile behavior and request-version guards.
- Preserve customer order ID creation/display/selection and the trusted `wixEcom_onOrderApproved` event.
- Do not modify Wix products during migration.
- Delete only confirmed 1-2 byte page-code stubs.
- SKU operations remain dry-run-first and admin-only.
- Do not claim WECARE Ops is installed until Wix Editor/CLI registration actually succeeds.

---

### Task 1: Ultra-fast Blog search

**Files:**
- Modify: `src/public/blog-search.js`
- Modify: `tests/blog-search-behavior.test.mjs`

**Interfaces:**
- Consumes: `initBlogSearch(select)` and existing Wix Search result state.
- Produces: same public `initBlogSearch(select)` API; changed latency/state-retention only.

- [ ] **Step 1: Write the failing regression tests**

Add tests that first render `Resentment`, then type `Flame` without resolving the new query and assert the old result remains visible; also assert the source debounce is 50 ms.

```js
test('keeps previous results visible while a new typed query is waiting', async () => {
  const f = fixture(); f.init();
  f.type('Resentment'); f.runTimers(); await f.resolve(0, [resentment]);
  f.type('Flame');
  assert.equal(f.rep.data[0]?.title, 'Resentment');
  f.runTimers(); await f.resolve(1, [flame]);
  assert.equal(f.rep.data[0]?.title, 'Flame');
});

test('uses a near-immediate 50 ms typing debounce', () => {
  assert.match(source, /const DEBOUNCE = 50;/);
});
```

- [ ] **Step 2: Verify RED**

Run:

```bash
node --test tests/blog-search-behavior.test.mjs
```

Expected on the old controller: the retained-results test fails because `onInput()` calls `reset()`, and the debounce source assertion fails at `150`.

- [ ] **Step 3: Implement the minimal change**

In `src/public/blog-search.js`:

```js
const DEBOUNCE = 50;
```

Change the input handler so only an empty query calls `reset()`:

```js
input.onInput(() => {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  const requestVersion = ++version;
  const q = input.value.trim();
  if (!q) {
    reset();
    return;
  }
  timer = setTimeout(() => {
    timer = null;
    search(q, requestVersion, false);
  }, DEBOUNCE);
});
```

- [ ] **Step 4: Verify GREEN**

Run all Blog-search tests.

```bash
node --test tests/blog-search*.test.mjs tests/search-page-selector-wiring.test.mjs
```

Expected: all pass.

---

### Task 2: Relocate SKU admin source into WECARE Ops

**Files:**
- Create: `apps/wecare-ops/README.md`
- Create: `apps/wecare-ops/src/legacy/catalog-v3.js`
- Create: `apps/wecare-ops/src/legacy/sku-batch.web.js`
- Delete: `src/backend/catalog-v3.js`
- Delete: `src/backend/sku-batch.web.js`
- Modify: `tests/sku-safety.test.mjs`
- Modify: `tests/sku-test-utils.mjs`

**Interfaces:**
- Retains existing SKU safety logic as migration source.
- Removes all SKU web methods from the public Wix Site runtime.
- Does not execute a catalog mutation.

- [ ] **Step 1: Change SKU test imports to the WECARE Ops location and verify RED before source move.**
- [ ] **Step 2: Copy the two current SKU files byte-for-byte into `apps/wecare-ops/src/legacy/`.**
- [ ] **Step 3: Run SKU tests and confirm they pass from the new location.**
- [ ] **Step 4: Delete the original `src/backend` SKU files.**
- [ ] **Step 5: Re-run SKU tests.**

This preserves the reviewed SKU implementation while removing it from the live Wix Site deployment boundary.

---

### Task 3: Delete empty Wix page-code stubs and lock the runtime boundary

**Files:**
- Delete: every `src/pages/*.js` file with GitHub size 1 or 2 bytes.
- Keep: `Blog.e4rsm.js`, `Post.q5tyt.js`, `My Orders.vznnd.js`, `Thank You Page.f0at2.js`, `masterPage.js`, `README.md`.
- Modify: `tests/runtime-boundary.test.mjs`.

**Interfaces:**
- Produces a minimal page-code directory containing only functional custom page code.

- [ ] **Step 1: Update runtime-boundary expectations**

```js
assert.deepEqual(actualNonPageModules, [
  'backend/events.js',
  'backend/member-orders.web.js',
  'backend/orderId-helpers.js',
  'backend/orderId.web.js',
  'public/blog-search-url.js',
  'public/blog-search.js',
]);
```

Add an explicit page-file assertion:

```js
assert.deepEqual(pageFiles, [
  'Blog.e4rsm.js',
  'My Orders.vznnd.js',
  'Post.q5tyt.js',
  'Thank You Page.f0at2.js',
  'masterPage.js',
]);
```

- [ ] **Step 2: Verify RED while stubs still exist.**
- [ ] **Step 3: Delete only the confirmed 1-2 byte stubs.**
- [ ] **Step 4: Verify runtime-boundary test GREEN.**
- [ ] **Step 5: Run order-ID tests unchanged to prove the customer order flow still passes its existing contract.**

---

### Task 4: Prepare the private WECARE Ops dashboard source

**Files:**
- Create: `apps/wecare-ops/dashboard/README.md`
- Create: `apps/wecare-ops/dashboard/wecare-ops.extension.ts`
- Create: `apps/wecare-ops/dashboard/wecare-ops.tsx`
- Create: `apps/wecare-ops/dashboard/sections.ts`

**Interfaces:**
- Produces the source contract for one private dashboard page with sections: Overview, Orders, Order IDs, SKU Manager, System Tools.
- Consumes the migrated SKU logic and future Wix SDK adapters.

- [ ] **Step 1: Create the extension builder using the documented dashboard-page shape.**

```ts
export default extensions.dashboardPage({
  id: '5b2ec2ca-7d41-4b90-8e9c-1db2dd77f6d0',
  title: 'WECARE Ops',
  routePath: 'wecare-ops',
  component: './extensions/dashboard/pages/wecare-ops/wecare-ops.tsx',
});
```

- [ ] **Step 2: Build a Wix Design System page with five tabs and explicit read-only/migration states.**
- [ ] **Step 3: Document the required Wix permissions for Orders and Catalog V3 before live API wiring.**
- [ ] **Step 4: Keep Apply/overwrite actions disabled until the dashboard project is registered and authenticated.**

This task deliberately does not fake a deployment: Wix docs require creating the dashboard page in the Editor or creating an authenticated Wix CLI app project before the extension can be installed.

---

### Task 5: Review, merge, publish and verify

**Files:** all changed files.

- [ ] **Step 1: Compare branch to `main`; confirm only approved search/runtime/admin-source changes.**
- [ ] **Step 2: Run all available repository tests.**
- [ ] **Step 3: Open a PR with the exact platform limitation called out.**
- [ ] **Step 4: Merge after review.**
- [ ] **Step 5: Publish WECARE.DIGITAL with the Wix publisher API.**
- [ ] **Step 6: Run a post-publish Wix Site Search query for `transformation` and confirm `/post/transformation` still resolves.**
- [ ] **Step 7: Verify GitHub `main` no longer contains empty page stubs or live-site SKU modules.**
