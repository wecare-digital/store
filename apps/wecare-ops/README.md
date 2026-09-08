# WECARE Ops

Private administrator tooling for WECARE.DIGITAL.

## Initial dashboard

The prepared dashboard UI lives in `dashboard/` and defines the approved sections:

- Overview
- Orders
- Order IDs
- SKU Manager
- System Tools

This folder deliberately lives **outside** the Wix Site `src/` tree so administrator tooling is not shipped as visitor-facing site Velo.

## Registration state

The dashboard source is prepared but is not marked installed. Wix currently requires one of these platform registration paths before it can run privately in the site dashboard:

1. Create a Dashboard Page in Wix Editor, publish the site, then connect its generated page code to the prepared modules, or
2. Create/authenticate a Wix CLI app project, generate a dashboard page extension, and install that app on WECARE.DIGITAL.

The connected Wix management API available to this repository does not expose that Editor/app-project creation action, so `dashboard/sections.mjs` intentionally keeps `installed: false` until registration actually exists.

## Required Wix access for live adapters

When registered, the dashboard adapters need only the permissions required by their section:

- Orders: Wix eCommerce **Read Orders**.
- SKU Manager read/preview: Wix Stores Catalog V3 product read, including admin/non-visible product access when the complete catalog must be scanned for collisions.
- SKU Manager apply: Wix Stores Catalog V3 product write.

## SKU migration source

`src/legacy/` preserves the reviewed Catalog V3 SKU implementation while it is removed from live site Velo. Its existing safety contract remains covered by `tests/sku-safety.test.mjs`:

- dry run unless `dryRun === false`;
- collision checks across catalog and pending values;
- 8-character alphabet excluding `0/O/1/I`;
- `-01`, `-02`, ... variant suffixes;
- no overwrite of populated SKUs unless explicitly selected;
- preserve complete Catalog V3 option/variant arrays during writes.

No catalog mutation is performed by this migration.

## Development rule

New internal operational tooling belongs in this folder/dashboard track. Customer-facing site code should be added under `src/` only when it genuinely needs to execute for site visitors, members, checkout/order confirmation, or trusted Wix runtime events.
