# Customer order IDs

## Existing collection, not a migration

The controller verified `OrderIds` exists on 2026-09-08 with ADMIN-only permissions and no records at that check. Do not create `OrderIDs`, replace the existing collection, modify immutable identifiers, or backfill historical orders. `orderids-collection.json` is an exact **new-environment-only** create payload for `POST https://www.wixapis.com/wix-data/v2/collections`; it is not an update payload for the current site.

Keep the existing fields and constraints. Add only these missing optional TEXT fields if needed: `memberId`, `productsSummary`, `totalAmount`, `currency`. The first supports secure member filtering; the others populate the existing My Orders repeater. Keep all four collection permissions ADMIN. Fetch the latest schema before each additive change; read it back afterward. No schema operation is performed by runtime code.

`customOrderId` is the canonical required custom identifier. New rows also populate the legacy `orderId` alias. Existing rows use `customOrderId || orderId` and are never rewritten. `wixOrderNumber`, `orderCreatedDate` (a JavaScript Date), and `source` match the existing schema. No buyer email or phone is retained by the new implementation.

## Security and creation

Member web methods require SiteMember access and obtain identity from `wix-members-backend.currentMember.getMember()`. A supplied member ID or email never authorizes reads. The thank-you creation method accepts only `wixOrderId`, retrieves the real order through `wix-ecom-backend.orders.getOrder()` without elevation, explicitly verifies `buyerInfo.memberId`, and requires APPROVED status. All persisted metadata is derived from that retrieved order.

The trusted `wixEcom_onOrderApproved` handler reads documented `event.data.order`, with compatibility for `event.entity`. It derives the same fields and creates guest IDs without assigning visitor/contact identifiers to `memberId`. It sends no messages, invokes no external service or secrets, and never reads or updates the read-only `Stores/Orders` collection. Mapping errors propagate instead of being swallowed.

New row `_id` equals the actual Wix order GUID, so concurrent approval events and member requests cannot insert two rows for that order. Legacy mappings are looked up first and preserved. Only Wix's explicit duplicate-ID errors (WDE0074 / WD_ITEM_ALREADY_EXISTS) are recovered by a consistent read of a matching winning row; other failures propagate. Random WD-ORD allocation also checks canonical and legacy IDs before insertion. This is not a global transactional uniqueness guarantee for different orders sharing a random display ID; IDs must not serve as authorization secrets.

## Retained UI dependencies

| Page | Required existing elements |
| --- | --- |
| My Orders | `ordersContainer`, `ordersRepeater`, `loadMoreButton`, `emptyStateText`; repeater children `slNoText`, `shopIdText`, `dateText`, `productText`, `amountText` |
| Thank You | native `thankYouPage1`, `orderContainer`, `orderIdText`, `orderDateText`; optional `orderIdFull` |
| Submit request (master page) | `dropdown_sr`; optional Wix Form under `wixForms1`, `form1`, `wixForms2`, or `submitRequestForm`, field `order_id_1` |

Wix Forms continues to own any native form submission. No custom request CRUD or OrderRequests dependency remains. The query-string selection is restricted to the current member's returned IDs. Repeater `onItemReady` is registered before its first data assignment.

Guest checkout always retains native Wix confirmation and its native order number. Custom guest IDs are created by the approval event but not disclosed through anonymous custom endpoints. Pending approval, unavailable CMS, or backend ownership mismatch leaves native confirmation usable. No automated guest-email linking or historical member reassignment occurs. Old mappings without a trusted member ID do not appear in member lists.

## Verification and deployment limits

Run `node --experimental-vm-modules --test tests/order-ids.test.mjs`. These behavioral tests execute real application modules with only Wix-hosted data/member/order/UI boundaries replaced. Initial regression run: 11 failed / 2 passed. The documented event-envelope regression also failed before its repair. Final suite includes ownership, anonymous access, spoofed metadata, required schema fields, concurrent insert deduplication, failure propagation, canonical/legacy reuse, pagination, IST formatting, first repeater binding, guest confirmation, and dropdown selection.

Local tests do not prove the live Wix runtime, page-element wiring, or backend member API behavior. Wix says backend events do not run in preview and member APIs are partially functional there. Use published-site verification without creating real orders/messages as tests. No commits, publication, schema mutations, or historical backfill are performed by these files.

## Official references

- [Backend current member](https://dev.wix.com/docs/velo/apis/wix-members-backend/current-member/get-member)
- [Get eCommerce order (Velo)](https://dev.wix.com/docs/velo/apis/wix-ecom-backend/orders/get-order)
- [Get eCommerce order ownership rules](https://dev.wix.com/docs/api-reference/business-solutions/e-commerce/orders/orders/get-order)
- [Approved-order event envelope and preview limitation](https://dev.wix.com/docs/velo/events-service-plugins/e-commerce/events/on-order-approved)
- [Wix Data duplicate-ID error codes](https://dev.wix.com/docs/api-reference/business-solutions/cms/wix-data-error-codes)
- [Create Data Collection](https://dev.wix.com/docs/api-reference/business-solutions/cms/collection-management/data-collections/create-data-collection)
