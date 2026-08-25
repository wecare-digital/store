import { ok, notFound, forbidden, response as rawResponse } from 'wix-http-functions';
import wixData from 'wix-data';
import { getSecret } from 'wix-secrets-backend';
import { extractShortId, extractFriendlyDate, buildWhatsAppLabel, buildDisplayLabel, normalizePhone } from 'backend/orderId-helpers';
import { seoMap, defaultSeo } from 'public/seo-map.js';
// This site is on Wix Stores Catalog V3. The legacy wix-data collections
// (Stores/Products, Stores/Collections, Stores/InventoryItems) are V1 surfaces
// and return 0 rows here — all catalog reads go through catalog-v3 instead.
import { countProducts, listProducts, getProduct, listCategories, listInventoryItems, normalizeProduct } from 'backend/catalog-v3.js';
import { applyProductSeo, buildProductSeo } from 'backend/product-seo.js';

const BASE = 'https://www.wecare.digital';
const BRAND = 'WECARE.DIGITAL';
const LOGO = 'https://app.wecare.digital/stream/media/m/wecare-digital.png';
const AUTH_OPTS = { suppressAuth: true };
const ORIGINS = [ 'https://base.wecare.digital', 'https://wecare.digital', 'https://app.wecare.digital' ];

const SITE = {
  name: BRAND, url: BASE, email: 'one@wecare.digital', phone: '+919330994400',
  logo: LOGO, inLanguage: 'en-IN',
  description: 'A network of microservice brands serving everyday Bharat across travel, paperwork, disputes, rituals, reflection, and support.',
  address: { streetAddress: 'The W.B.S.I.D.C. Building, Unit 1/20, 81/2/7, Phears Lane', city: 'Kolkata', state: 'West Bengal', pincode: '700012', country: 'IN' },
  instagram: 'https://www.instagram.com/wecare.digital/',
  brands: [
    { name: 'Legal Champ', category: 'Legal Services', path: '/legal-champ' },
    { name: 'Ritual Guru', category: 'Spiritual/Cultural', path: '/ritual' },
    { name: 'Swdhya', category: 'Personal Growth', path: '/swdhya' },
    { name: 'No Fault', category: 'Dispute Resolution', path: '/no-fault' },
    { name: 'Expo Week', category: 'Events', path: '/expoweek' },
    { name: 'Bharat Stack', category: 'Technology Platform', url: 'https://stack.wecare.digital' },
  ],
};

const FAQS = [
  { q: 'How do I submit a request?', a: 'You can submit a new request online in a few simple steps. Start by entering your basic details, then add a short summary and your Order ID. After submission, your case is created and you receive a reference ID so you can track progress.' },
  { q: 'How can I track my request?', a: 'You can check the status of your request at any time. This helps you stay informed as your case moves through stages such as received, under review, and completed.' },
  { q: 'How do I request an amendment?', a: 'If you need to update a request you have already submitted, you can request an amendment without starting over. Once your changes are reviewed and approved, the updated information will be applied to your case.' },
  { q: 'How do I book or reschedule an RX slot?', a: 'You can book or reschedule an RX slot for doctor or treatment appointments based on your travel plans and prior prescription needs.' },
  { q: 'How do I upload supporting documents?', a: 'If you have been asked for files, or if you need to add supporting documents to your case, you can upload them securely through Drop Docs.' },
  { q: 'How do I get enterprise support?', a: 'If you need help with an active business or service-related case, you can contact Enterprise Assist.' },
  { q: 'How do I book an appointment?', a: 'You can book an appointment through self-service for supported services. Once you choose your preferred slot and provide the required details, you will receive confirmation based on availability.' },
  { q: 'How do I leave a review?', a: 'You can leave a review after using a service to share your experience with us. Your feedback helps improve service quality.' },
  { q: 'What payment methods do you accept?', a: 'We accept UPI, debit cards, credit cards, net banking, and other supported digital payment methods.' },
  { q: 'What are your business hours?', a: 'Monday to Friday, 9:00 AM to 6:00 PM IST. Self-service portal available 24/7.' },
  { q: 'Is there a mobile app?', a: 'Yes. WECARE.DIGITAL offers an app for iOS and Android.' },
  { q: 'What is WECARE.DIGITAL?', a: 'A network of microservice brands serving everyday Bharat across travel, paperwork, disputes, rituals, and reflection.' },
  { q: 'Can I buy a gift card?', a: 'Yes. WECARE.DIGITAL offers e-gift cards that can be sent instantly.' },
];

// Auth fails CLOSED.
//
// This previously returned true whenever the secret was missing or the lookup
// threw, which meant a renamed secret or one transient Secrets Manager error
// silently opened every admin endpoint - orders, customer PII, product writes -
// to the public internet. The failure was also sticky: a single rejected
// promise cached null in module scope, so the site stayed open until redeploy.
//
// Now: no secret, no access. If every endpoint starts returning 403 after a
// deploy, the WECARE_API_KEY secret is missing from the Secrets Manager.
let _secret;
let _secretFetchedAt = 0;
const SECRET_TTL_MS = 5 * 60 * 1000;

async function auth ( req )
{
  try
  {
    // Re-read periodically so a rotated or restored secret takes effect
    // without a redeploy, instead of being cached for the life of the instance.
    if ( _secret === undefined || Date.now() - _secretFetchedAt > SECRET_TTL_MS )
    {
      _secret = await getSecret( 'WECARE_API_KEY' );
      _secretFetchedAt = Date.now();
    }
    if ( !_secret ) { console.error( '[auth] WECARE_API_KEY secret is empty - denying' ); return false; }

    const presented = req?.headers?.[ 'x-api-key' ];
    if ( typeof presented !== 'string' || presented.length !== _secret.length ) return false;
    // Constant-time compare so the key can't be recovered by timing.
    let diff = 0;
    for ( let i = 0; i < presented.length; i++ ) diff |= presented.charCodeAt( i ) ^ _secret.charCodeAt( i );
    return diff === 0;
  }
  catch ( e )
  {
    // Do not cache the failure - next request retries the lookup.
    _secret = undefined;
    console.error( '[auth] secret lookup failed, denying:', e?.message || e );
    return false;
  }
}

// Echo the origin only when we recognise it. Returning ORIGINS[0] for unknown
// origins hands out a usable CORS header to callers we never approved.
function origin ( req ) { const o = req?.headers?.origin || ''; return ORIGINS.includes( o ) ? o : 'null'; }
function json ( body, req ) { return ok( { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin( req ) }, body: JSON.stringify( body ) } ); }
function err ( body, s = 500, req ) { return rawResponse( { status: s, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin( req ) }, body: JSON.stringify( body ) } ); }
function deny ( req ) { return forbidden( { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin( req ) }, body: '{"error":"Unauthorized"}' } ); }
function miss ( body, req ) { return notFound( { headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': origin( req ) }, body: JSON.stringify( body ) } ); }
function txt ( body ) { return rawResponse( { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body } ); }

async function enrichOrder ( order )
{
  if ( !order?._id ) return order;
  try
  {
    const r = await wixData.query( 'OrderIds' ).eq( 'wixOrderId', order._id ).limit( 1 ).find( AUTH_OPTS );
    if ( r.items.length > 0 ) { order.customOrderNumber = r.items[ 0 ].orderId; order.shortOrderId = extractShortId( r.items[ 0 ].orderId ); order.displayLabel = buildDisplayLabel( r.items[ 0 ].orderId ); }
  } catch { }
  return order;
}

function orderAmount ( order )
{
  if ( !order?.totals?.total ) return '';
  const c = order.currency === 'INR' ? '₹' : ( order.currency || '' );
  const t = typeof order.totals.total === 'number' ? order.totals.total.toLocaleString( 'en-IN', { minimumFractionDigits: 2 } ) : String( order.totals.total );
  return c + t;
}

// ── Store API ──

export async function get_products ( req )
{
  if ( !( await auth( req ) ) ) return deny( req );
  try
  {
    const { limit = '100', search = '', collectionId = '' } = req.query;
    const lim = Math.min( parseInt( limit ) || 100, 100 );
    let items = ( await listProducts( { limit: lim } ) ).map( normalizeProduct );
    if ( search ) { const s = search.toLowerCase(); items = items.filter( p => p.name.toLowerCase().includes( s ) ); }
    if ( collectionId ) items = items.filter( p => p.categoryIds.includes( collectionId ) );
    return json( { products: items, totalResults: items.length } );
  } catch ( e ) { return err( { error: e.message }, 500, req ); }
}

export async function get_product ( req )
{
  if ( !( await auth( req ) ) ) return deny( req );
  try
  {
    const { id } = req.query;
    if ( !id ) return miss( { error: 'Missing id' }, req );
    const p = await getProduct( id );
    if ( !p ) return miss( { error: 'Not found' }, req );
    let inv = null;
    try { inv = await listInventoryItems( { productId: p.id } ); } catch { }
    return json( { product: { ...p, _inventory: inv } } );
  } catch ( e ) { return err( { error: e.message }, 500, req ); }
}

export async function get_orders ( req )
{
  if ( !( await auth( req ) ) ) return deny( req );
  try
  {
    const { limit = '50', status = '', email = '', customOrderNumber = '', memberId = '' } = req.query;
    const lim = Math.min( parseInt( limit ) || 50, 500 );

    if ( customOrderNumber )
    {
      try
      {
        const m = await wixData.query( 'OrderIds' ).eq( 'orderId', customOrderNumber ).limit( 1 ).find( AUTH_OPTS );
        if ( m.items.length > 0 ) { const o = await wixData.get( 'Stores/Orders', m.items[ 0 ].wixOrderId, AUTH_OPTS ); if ( o ) { o.customOrderNumber = customOrderNumber; delete o.number; return json( { orders: [ o ], totalResults: 1 } ); } }
        return json( { orders: [], totalResults: 0 } );
      } catch { return json( { orders: [], totalResults: 0 } ); }
    }

    if ( memberId )
    {
      try
      {
        const ms = await wixData.query( 'OrderIds' ).eq( 'memberId', memberId ).descending( '_createdDate' ).limit( lim ).find( AUTH_OPTS );
        const orders = [];
        for ( const m of ms.items ) { try { const o = await wixData.get( 'Stores/Orders', m.wixOrderId, AUTH_OPTS ); if ( o ) { o.customOrderNumber = m.orderId; delete o.number; orders.push( o ); } } catch { } }
        return json( { orders, totalResults: ms.totalCount } );
      } catch { return json( { orders: [], totalResults: 0 } ); }
    }

    let q = wixData.query( 'Stores/Orders' ).limit( lim ).descending( '_dateCreated' );
    if ( status ) q = q.eq( 'paymentStatus', status );
    if ( email ) q = q.eq( 'buyerEmail', email );
    const r = await q.find( AUTH_OPTS );
    const enriched = [];
    for ( let i = 0; i < r.items.length; i += 10 )
    {
      const batch = await Promise.all( r.items.slice( i, i + 10 ).map( async o => { await enrichOrder( o ); delete o.number; return o; } ) );
      enriched.push( ...batch );
    }
    return json( { orders: enriched, totalResults: r.totalCount } );
  } catch ( e ) { return err( { error: e.message }, 500, req ); }
}

export async function get_order ( req )
{
  if ( !( await auth( req ) ) ) return deny( req );
  try
  {
    const { id } = req.query;
    if ( !id ) return miss( { error: 'Missing id' }, req );
    const o = await wixData.get( 'Stores/Orders', id, AUTH_OPTS );
    if ( !o ) return miss( { error: 'Not found' }, req );
    await enrichOrder( o ); delete o.number;
    return json( { order: o } );
  } catch ( e ) { return err( { error: e.message }, 500, req ); }
}

export async function get_collections ( req )
{
  if ( !( await auth( req ) ) ) return deny( req );
  try
  {
    // V3 replaced collections with categories.
    // req.query is absent when the URL has no query string, so guard it.
    const cats = await listCategories( { limit: Math.min( parseInt( req?.query?.limit ) || 100, 100 ) } );
    return json( { collections: cats, totalResults: cats.length } );
  } catch ( e ) { return err( { error: e.message }, 500, req ); }
}

export async function get_inventory ( req )
{
  if ( !( await auth( req ) ) ) return deny( req );
  try
  {
    const { productId } = req.query;
    if ( !productId ) return miss( { error: 'Missing productId' }, req );
    const items = await listInventoryItems( { productId } );
    return json( { productId, inventoryItems: items } );
  } catch ( e ) { return err( { error: e.message }, 500, req ); }
}

export async function get_inventoryAll ( req )
{
  if ( !( await auth( req ) ) ) return deny( req );
  try
  {
    const items = await listInventoryItems( { limit: Math.min( parseInt( req?.query?.limit ) || 100, 100 ) } );
    return json( { inventoryItems: items, totalResults: items.length } );
  } catch ( e ) { return err( { error: e.message }, 500, req ); }
}

export async function get_health ()
{
  let c = 0; try { c = await countProducts(); } catch { }
  return json( { status: 'ok', service: 'wecare-digital-velo', catalogVersion: 'V3', productCount: c, timestamp: new Date().toISOString() } );
}

// SEO head (read-only): returns the SEO config the live controller applies for a path.
function _normSeoPath ( p )
{
  if ( !p ) return '/';
  p = String( p ).trim();
  if ( !p.startsWith( '/' ) ) p = '/' + p;
  return p.replace( /\/+$/, '' ) || '/';
}

export async function get_seohead ( req )
{
  const path = _normSeoPath( req && req.query && req.query.path );
  const cfg = seoMap[ path ] || seoMap[ path.toLowerCase() ] || defaultSeo || {};
  return json( {
    path,
    title: cfg.title || '',
    description: cfg.description || '',
    keywords: cfg.keywords || [],
    canonical: cfg.canonical || '',
    robots: cfg.robots || 'index, follow',
    structuredData: cfg.structuredData || [],
  }, req );
}

export async function get_sampleProducts ( req )
{
  if ( !( await auth( req ) ) ) return deny( req );
  try { const { getSampleProducts } = await import( './product-manager.web' ); return json( await getSampleProducts() ); } catch ( e ) { return err( { error: e.message }, 500, req ); }
}

export async function post_createProduct ( req )
{
  if ( !( await auth( req ) ) ) return deny( req );
  try
  {
    const body = await req.body.json();
    if ( !body.product?.name ) return err( { error: 'Missing product.name' }, 400, req );
    const { createProduct } = await import( './product-manager.web' );
    const r = await createProduct( body.product );
    return r.success ? json( { product: r.product, created: true } ) : err( { error: r.error }, 400, req );
  } catch ( e ) { return err( { error: e.message }, 500, req ); }
}

export async function post_bulkCreateProducts ( req )
{
  if ( !( await auth( req ) ) ) return deny( req );
  try
  {
    const body = await req.body.json();
    if ( !Array.isArray( body.products ) || !body.products.length ) return err( { error: 'Missing products array' }, 400, req );
    const { bulkCreateProducts } = await import( './product-manager.web' );
    return json( await bulkCreateProducts( body.products ) );
  } catch ( e ) { return err( { error: e.message }, 500, req ); }
}

export async function post_updateProduct ( req )
{
  if ( !( await auth( req ) ) ) return deny( req );
  try
  {
    const body = await req.body.json();
    if ( !body.productId ) return err( { error: 'Missing productId' }, 400, req );
    const { updateProduct } = await import( './product-manager.web' );
    const r = await updateProduct( body.productId, body.updates || {} );
    return r.success ? json( { product: r.product, updated: true } ) : err( { error: r.error }, 400, req );
  } catch ( e ) { return err( { error: e.message }, 500, req ); }
}

export async function post_deleteProduct ( req )
{
  if ( !( await auth( req ) ) ) return deny( req );
  try
  {
    const body = await req.body.json();
    if ( !body.productId ) return err( { error: 'Missing productId' }, 400, req );
    const { deleteProduct } = await import( './product-manager.web' );
    const r = await deleteProduct( body.productId );
    return r.success ? json( { deleted: true } ) : err( { error: r.error }, 400, req );
  } catch ( e ) { return err( { error: e.message }, 500, req ); }
}

export async function post_reprefixSkus ( req )
{
  if ( !( await auth( req ) ) ) return deny( req );
  try
  {
    const body = await req.body.json();
    const { reprefixSKUs } = await import( './sku-batch.web' );
    return json( await reprefixSKUs( { oldPrefix: body.oldPrefix || '', newPrefix: body.newPrefix || 'WD', dryRun: body.dryRun !== false } ) );
  } catch ( e ) { return err( { error: e.message }, 500, req ); }
}

export async function post_assignSkus ( req )
{
  if ( !( await auth( req ) ) ) return deny( req );
  try
  {
    const body = await req.body.json();
    const { assignMissingSKUs } = await import( './sku-batch.web' );
    return json( await assignMissingSKUs( { prefix: body.prefix || 'WD', dryRun: body.dryRun !== false } ) );
  } catch ( e ) { return err( { error: e.message }, 500, req ); }
}

export async function post_backfillOrderCustomFields ( req )
{
  if ( !( await auth( req ) ) ) return deny( req );
  try
  {
    const all = await wixData.query( 'OrderIds' ).limit( 100 ).find( AUTH_OPTS );
    let updated = 0, skipped = 0, errors = [];
    for ( const m of all.items )
    {
      if ( !m.wixOrderId || !m.orderId ) { skipped++; continue; }
      try
      {
        const o = await wixData.get( 'Stores/Orders', m.wixOrderId, AUTH_OPTS );
        if ( !o || o.customField?.value === m.orderId ) { skipped++; continue; }
        await wixData.update( 'Stores/Orders', { ...o, customField: { title: 'Order ID', value: m.orderId } }, AUTH_OPTS );
        updated++;
      } catch ( e ) { errors.push( { wixOrderId: m.wixOrderId, error: e.message } ); }
    }
    return json( { updated, skipped, errors: errors.slice( 0, 10 ), total: all.items.length } );
  } catch ( e ) { return err( { error: e.message }, 500, req ); }
}

// ── WhatsApp Flow ──

async function flowAuth ( req )
{
  try
  {
    if ( _secret === undefined ) _secret = await getSecret( 'WECARE_API_KEY' ).catch( () => null );
    if ( _secret ) { const p = req.headers[ 'x-api-key' ] || req.headers[ 'x-flow-secret' ]; if ( p !== _secret ) return false; }
    return true;
  } catch { return true; }
}

export async function post_flowOrders ( req )
{
  if ( !( await flowAuth( req ) ) ) return deny( req );
  try
  {
    const body = await req.body.json();
    const phone = ( body.phone || '' ).trim(), email = ( body.email || '' ).trim();
    if ( !phone && !email ) return err( { error: 'phone or email required' }, 400, req );
    let mappings = [];
    if ( email ) { mappings = ( await wixData.query( 'OrderIds' ).eq( 'buyerEmail', email ).descending( '_createdDate' ).limit( 50 ).find( AUTH_OPTS ) ).items; }
    if ( !mappings.length && phone )
    {
      for ( const v of normalizePhone( phone ) )
      {
        if ( mappings.length ) break;
        try { const r = await wixData.query( 'Stores/Orders' ).eq( 'buyerInfo.phone', v ).descending( '_dateCreated' ).limit( 50 ).find( AUTH_OPTS ); for ( const o of r.items ) { const id = o.customField?.value; if ( id?.startsWith( 'WD-ORD' ) ) mappings.push( { wixOrderId: o._id, orderId: id, _order: o } ); } } catch { }
      }
    }
    const orders = [];
    for ( const m of mappings )
    {
      let o = m._order; if ( !o && m.wixOrderId ) try { o = await wixData.get( 'Stores/Orders', m.wixOrderId, AUTH_OPTS ); } catch { }
      orders.push( { id: m.orderId, shortId: extractShortId( m.orderId ), label: buildWhatsAppLabel( m.orderId, orderAmount( o ) ), displayLabel: buildDisplayLabel( m.orderId ), date: extractFriendlyDate( m.orderId ), amount: orderAmount( o ), itemCount: o?.lineItems?.length || 0, status: o?.fulfillmentStatus || o?.paymentStatus || 'unknown' } );
    }
    return json( { orders }, req );
  } catch ( e ) { return err( { error: e.message }, 500, req ); }
}

export async function post_flowOrderDetail ( req )
{
  if ( !( await flowAuth( req ) ) ) return deny( req );
  try
  {
    const body = await req.body.json();
    const wdOrd = ( body.orderId || '' ).trim();
    if ( !wdOrd ) return err( { error: 'orderId required' }, 400, req );
    const m = await wixData.query( 'OrderIds' ).eq( 'orderId', wdOrd ).limit( 1 ).find( AUTH_OPTS );
    if ( !m.items.length ) return miss( { error: 'Not found' }, req );
    let o; try { o = await wixData.get( 'Stores/Orders', m.items[ 0 ].wixOrderId, AUTH_OPTS ); } catch { }
    if ( !o ) return miss( { error: 'Order data not found' }, req );
    const products = ( o.lineItems || [] ).map( li => ( { name: li.name || 'Product', quantity: li.quantity || 1, price: li.price || '', image: li.mediaItem?.url || li.image || null } ) );
    const ship = o.shippingInfo?.shipmentDetails?.address;
    const ful = o.fulfillments?.[ 0 ];
    return json( { orderId: wdOrd, shortId: extractShortId( wdOrd ), displayLabel: buildDisplayLabel( wdOrd ), date: extractFriendlyDate( wdOrd ), amount: orderAmount( o ), status: o.fulfillmentStatus || o.paymentStatus || 'unknown', paymentStatus: o.paymentStatus || 'unknown', products, productsSummary: products.map( p => p.name + ' × ' + p.quantity ).join( ', ' ), shipping: ship ? [ ship.addressLine, ship.city, ship.subdivision, ship.zipCode, ship.country ].filter( Boolean ).join( ', ' ) : null, tracking: ful?.trackingInfo ? { number: ful.trackingInfo.trackingNumber, url: ful.trackingInfo.trackingLink, carrier: ful.trackingInfo.shippingProvider } : null, buyerEmail: o.buyerInfo?.email || '', buyerPhone: o.buyerInfo?.phone || '' }, req );
  } catch ( e ) { return err( { error: e.message }, 500, req ); }
}

export async function post_flowOrderStatus ( req )
{
  if ( !( await flowAuth( req ) ) ) return deny( req );
  try
  {
    const body = await req.body.json();
    const wdOrd = ( body.orderId || '' ).trim();
    if ( !wdOrd ) return err( { error: 'orderId required' }, 400, req );
    const m = await wixData.query( 'OrderIds' ).eq( 'orderId', wdOrd ).limit( 1 ).find( AUTH_OPTS );
    if ( !m.items.length ) return miss( { error: 'Not found' }, req );
    let o; try { o = await wixData.get( 'Stores/Orders', m.items[ 0 ].wixOrderId, AUTH_OPTS ); } catch { }
    if ( !o ) return json( { orderId: wdOrd, shortId: extractShortId( wdOrd ), status: 'unknown', message: 'Order data unavailable' }, req );
    const statusMap = { FULFILLED: 'Shipped', NOT_FULFILLED: 'Processing', PARTIALLY_FULFILLED: 'Partially Shipped', PAID: 'Payment Confirmed', NOT_PAID: 'Payment Pending', REFUNDED: 'Refunded' };
    const raw = o.fulfillmentStatus || o.paymentStatus || 'unknown';
    const ful = o.fulfillments?.[ 0 ];
    return json( { orderId: wdOrd, shortId: extractShortId( wdOrd ), displayLabel: buildDisplayLabel( wdOrd ), status: raw, friendlyStatus: statusMap[ raw ] || raw, tracking: ful?.trackingInfo ? { number: ful.trackingInfo.trackingNumber, url: ful.trackingInfo.trackingLink, carrier: ful.trackingInfo.shippingProvider } : null, date: extractFriendlyDate( wdOrd ) }, req );
  } catch ( e ) { return err( { error: e.message }, 500, req ); }
}

// ── Blog SEO Bulk ──

export async function get_blogseobulk ( req )
{
  if ( !( await auth( req ) ) ) return deny( req );
  try
  {
    const { elevate } = await import( 'wix-auth' );
    const { draftPosts } = await import( 'wix-blog-backend' );
    let ok = 0, fail = 0, tot = 0, errs = [];
    let offset = 0;
    while ( true )
    {
      const q = await wixData.query( 'Blog/Posts' ).limit( 50 ).skip( offset ).find( AUTH_OPTS );
      if ( !q.items?.length ) break;
      tot += q.items.length;
      for ( const p of q.items )
      {
        const id = p.uuid || p._id, t = p.title || 'Untitled', s = p.slug || '';
        const ex = ( p.excerpt || '' ).substring( 0, 155 );
        const d = ex.length > 50 ? ex : ( t + '. ' + ex + ' Read more on ' + BRAND + '.' ).substring( 0, 160 );
        let tt = t + ' | ' + BRAND + ' Blog'; if ( tt.length > 60 ) tt = t + ' | ' + BRAND; if ( tt.length > 60 ) tt = t.substring( 0, 57 ) + '...';
        const u = BASE + '/post/' + s, author = p.authorName || 'Swdhya Vaksetu';
        const blogLD = JSON.stringify( { '@context': 'https://schema.org', '@type': 'BlogPosting', headline: t, description: d, url: u, author: { '@type': 'Person', name: author, url: BASE + '/swdhya' }, publisher: { '@type': 'Organization', name: BRAND, logo: { '@type': 'ImageObject', url: LOGO } }, mainEntityOfPage: { '@type': 'WebPage', '@id': u }, inLanguage: 'en-IN' } );
        const bcLD = JSON.stringify( { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [ { '@type': 'ListItem', position: 1, name: 'Home', item: BASE + '/' }, { '@type': 'ListItem', position: 2, name: 'Blog', item: BASE + '/blog' }, { '@type': 'ListItem', position: 3, name: t, item: u } ] } );
        const seoData = {
          tags: [
            { type: 'title', children: tt, custom: true, disabled: false },
            { type: 'meta', props: { name: 'description', content: d }, children: '', custom: true, disabled: false },
            { type: 'meta', props: { name: 'robots', content: 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1' }, children: '', custom: true, disabled: false },
            { type: 'meta', props: { property: 'og:title', content: t }, children: '', custom: true, disabled: false },
            { type: 'meta', props: { property: 'og:description', content: d }, children: '', custom: true, disabled: false },
            { type: 'meta', props: { property: 'og:url', content: u }, children: '', custom: true, disabled: false },
            { type: 'meta', props: { property: 'og:type', content: 'article' }, children: '', custom: true, disabled: false },
            { type: 'meta', props: { property: 'og:site_name', content: BRAND }, children: '', custom: true, disabled: false },
            { type: 'meta', props: { property: 'article:author', content: author }, children: '', custom: true, disabled: false },
            { type: 'link', props: { rel: 'canonical', href: u }, children: '', custom: true, disabled: false },
            { type: 'script', props: { type: 'application/ld+json' }, children: blogLD, custom: true, disabled: false },
            { type: 'script', props: { type: 'application/ld+json' }, children: bcLD, custom: true, disabled: false },
          ]
        };
        try { await elevate( draftPosts.unpublishPost )( id ); await elevate( draftPosts.updateDraftPost )( id, { seoData } ); await elevate( draftPosts.publishDraftPost )( id ); ok++; }
        catch ( e ) { fail++; if ( errs.length < 10 ) errs.push( { id, title: t.substring( 0, 40 ), error: e.message || String( e ) } ); }
      }
      if ( q.items.length < 50 ) break;
      offset += 50;
    }
    return json( { ok: true, updated: ok, failed: fail, total: tot, errors: errs }, req );
  } catch ( e ) { return err( { error: e.message }, 500, req ); }
}

const WIX_API = 'https://www.wixapis.com';
// Key loaded from Wix Secrets Manager (secret name: 'api') at runtime
// Backup: AWS Secrets Manager → wecare/wix-api-key
let _wixKeyCache = null;
async function getWixKey ()
{
  if ( _wixKeyCache ) return _wixKeyCache;
  try
  {
    _wixKeyCache = await getSecret( 'api' );
  } catch
  {
    _wixKeyCache = '';
  }
  return _wixKeyCache;
}
const WIX_SITE = 'd3ed75eb-e0b7-45c2-a743-f83cfa19379a';

async function wixApi ( method, path, body )
{
  const key = await getWixKey();
  const opts = { method, headers: { Authorization: key, 'Content-Type': 'application/json', 'wix-site-id': WIX_SITE } };
  if ( body ) opts.body = JSON.stringify( body );
  const r = await fetch( WIX_API + path, opts );
  const text = await r.text();
  try { return { ok: r.ok, status: r.status, data: JSON.parse( text ) }; } catch { return { ok: r.ok, status: r.status, data: text }; }
}

async function findPostBySlug ( slug )
{
  const r = await wixApi( 'GET', '/v3/posts?paging.limit=100&fieldsToInclude=SEO' );
  if ( !r.ok || !r.data?.posts ) return null;
  return r.data.posts.find( p => p.slug === slug ) || null;
}

const FOCUS_KEYWORDS = {
  'stand': 'standing with another, conscious choice, intentionality, integrity, relationship, free choice, support, responsibility, reciprocity, self-inquiry',
  'the-stone-must-fall-as-the-tiger-must-leap': 'choice and transformation, stone must fall, tiger must leap, discontinuous shift',
  'vitality': 'vitality and well-being, energy, aliveness, life force',
  'transformation': 'transformation and possibility, discontinuous shift, new realm, change',
  '__act': 'inauthentic act, self-image, looking good, being right',
  'no-agreement': 'no explicit agreement, implicit agreement, make explicit',
  'velocity': 'velocity, speed, momentum, action',
  'values': 'values, principles, what matters, core values',
  'trump-card': 'trump card, advantage, leverage, winning',
  'transformative-learning': 'transformative learning, education, growth, insight',
};

function buildSeoTags ( post )
{
  const t = post.title || 'Untitled', s = post.slug || '';
  const rawEx = ( post.excerpt || '' ).trim();
  let d = rawEx.substring( 0, 160 );
  if ( d.length >= 160 ) { const lastSpace = d.lastIndexOf( ' ' ); if ( lastSpace > 100 ) d = d.substring( 0, lastSpace ); }
  if ( !d || d.length < 30 ) d = t + '. Read more on ' + BRAND + '.';
  let tt = t + ' | ' + BRAND; if ( tt.length > 60 ) tt = t.substring( 0, 57 ) + '...';
  const u = BASE + '/post/' + s, author = 'Swdhya Vaksetu';
  const kw = FOCUS_KEYWORDS[ s ] || t.toLowerCase().replace( /[^a-z0-9\s]/g, '' ).trim();
  const img = ( post.media?.coverImage?.image?.url || post.coverImage || LOGO );
  return {
    tags: [
      { type: 'title', children: tt, custom: true, disabled: false },
      { type: 'meta', props: { name: 'description', content: d }, children: '', custom: true, disabled: false },
      { type: 'meta', props: { name: 'robots', content: 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1' }, children: '', custom: true, disabled: false },
      // NO meta keywords tag — keywords go in content, title, description, tags, hashtags, and schema instead
      { type: 'meta', props: { property: 'og:title', content: tt }, children: '', custom: true, disabled: false },
      { type: 'meta', props: { property: 'og:description', content: d }, children: '', custom: true, disabled: false },
      { type: 'meta', props: { property: 'og:url', content: u }, children: '', custom: true, disabled: false },
      { type: 'meta', props: { property: 'og:type', content: 'article' }, children: '', custom: true, disabled: false },
      { type: 'meta', props: { property: 'og:site_name', content: BRAND }, children: '', custom: true, disabled: false },
      { type: 'meta', props: { property: 'og:locale', content: 'en_IN' }, children: '', custom: true, disabled: false },
      { type: 'meta', props: { property: 'og:image', content: img }, children: '', custom: true, disabled: false },
      { type: 'meta', props: { property: 'og:image:width', content: '1200' }, children: '', custom: true, disabled: false },
      { type: 'meta', props: { property: 'og:image:height', content: '630' }, children: '', custom: true, disabled: false },
      { type: 'meta', props: { property: 'og:image:alt', content: tt }, children: '', custom: true, disabled: false },
      { type: 'meta', props: { name: 'twitter:card', content: 'summary_large_image' }, children: '', custom: true, disabled: false },
      { type: 'meta', props: { name: 'twitter:title', content: tt }, children: '', custom: true, disabled: false },
      { type: 'meta', props: { name: 'twitter:description', content: d }, children: '', custom: true, disabled: false },
      { type: 'meta', props: { name: 'twitter:image', content: img }, children: '', custom: true, disabled: false },
      { type: 'meta', props: { property: 'article:author', content: author }, children: '', custom: true, disabled: false },
      { type: 'meta', props: { property: 'article:published_time', content: post.publishedDate || post._createdDate || '' }, children: '', custom: true, disabled: false },
      { type: 'meta', props: { property: 'article:modified_time', content: post.lastPublishedDate || post._updatedDate || '' }, children: '', custom: true, disabled: false },
      { type: 'meta', props: { name: 'ai-summary', content: ( 'Blog post by ' + author + ' on ' + BRAND + ': ' + t + '. ' + d ).substring( 0, 300 ) }, children: '', custom: true, disabled: false },
      { type: 'link', props: { rel: 'canonical', href: u }, children: '', custom: true, disabled: false },
      { type: 'script', props: { type: 'application/ld+json' }, children: JSON.stringify( { '@context': 'https://schema.org', '@type': 'BlogPosting', headline: t, description: d, keywords: kw, image: img ? [ img ] : undefined, datePublished: post.publishedDate || post._createdDate, dateModified: post.lastPublishedDate || post._updatedDate, url: u, author: { '@type': 'Person', name: author, url: BASE + '/swdhya' }, publisher: { '@type': 'Organization', name: BRAND, logo: { '@type': 'ImageObject', url: LOGO } }, mainEntityOfPage: { '@type': 'WebPage', '@id': u }, inLanguage: 'en-IN' } ), custom: true, disabled: false },
      { type: 'script', props: { type: 'application/ld+json' }, children: JSON.stringify( { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [ { '@type': 'ListItem', position: 1, name: 'Home', item: BASE + '/' }, { '@type': 'ListItem', position: 2, name: 'Blog', item: BASE + '/blog' }, { '@type': 'ListItem', position: 3, name: t, item: u } ] } ), custom: true, disabled: false },
    ], settings: {
      keywords: ( function ()
      {
        var stop = { the: 1, a: 1, an: 1, and: 1, or: 1, but: 1, in: 1, on: 1, at: 1, to: 1, for: 1, of: 1, with: 1, by: 1, as: 1, is: 1, was: 1, are: 1, it: 1, its: 1, this: 1, that: 1, be: 1, not: 1, no: 1, vs: 1, s: 1 };
        var words = t.toLowerCase().replace( /[^a-z0-9\s]/g, '' ).split( /\s+/ ).filter( function ( w ) { return w.length > 2 && !stop[ w ]; } );
        var primary = t.toLowerCase().replace( /[^a-z0-9\s]/g, '' ).trim();
        var kws = [ { term: primary, isMain: true } ];
        words.slice( 0, 4 ).forEach( function ( w ) { if ( w !== primary ) kws.push( { term: w, isMain: false } ); } );
        return kws;
      } )()
    }, titleTag: tt, description: d, canonical: u, author, focusKeyword: kw, image: img
  };
}

function validateJsonLd ( tags )
{
  for ( const tag of tags )
  {
    if ( tag.type === 'script' && tag.props?.type === 'application/ld+json' )
    {
      try { JSON.parse( tag.children ); } catch ( e ) { return { valid: false, error: 'Invalid JSON-LD: ' + e.message }; }
    }
  }
  return { valid: true };
}

export async function get_blogseoclear ( req )
{
  if ( !( await auth( req ) ) ) return deny( req );
  try
  {
    const { slug = '', dryrun = '' } = req.query;
    if ( !slug ) return err( { error: 'slug required' }, 400, req );
    const post = await findPostBySlug( slug );
    if ( !post ) return err( { error: 'Post not found: ' + slug }, 404, req );
    const id = post.id;
    console.log( '[blogseoclear] postId=' + id + ' slug=' + slug + ' title=' + post.title );
    if ( dryrun === '1' ) return json( { ok: true, action: 'clear', dryRun: true, slug, postId: id, title: post.title, message: 'Would clear all seoData tags' } );
    const r1 = await wixApi( 'PATCH', '/blog/v3/draft-posts/' + id, { draftPost: { seoData: { tags: [], settings: { keywords: [] } } }, action: 'UPDATE_REVERT_TO_DRAFT' } );
    if ( !r1.ok ) return err( { error: 'revert+clear failed', status: r1.status, detail: r1.data }, 500, req );
    const r2 = await wixApi( 'POST', '/blog/v3/draft-posts/' + id + '/publish', {} );
    if ( !r2.ok ) return err( { error: 'republish failed', status: r2.status, detail: r2.data }, 500, req );
    console.log( '[blogseoclear] DONE slug=' + slug );
    return json( { ok: true, action: 'clear', slug, postId: id, title: post.title } );
  } catch ( e ) { return err( { error: e.message }, 500, req ); }
}

export async function get_blogseoapply ( req )
{
  if ( !( await auth( req ) ) ) return deny( req );
  try
  {
    const { slug = '', dryrun = '' } = req.query;
    if ( !slug ) return err( { error: 'slug required' }, 400, req );
    const post = await findPostBySlug( slug );
    if ( !post ) return err( { error: 'Post not found: ' + slug }, 404, req );
    const id = post.id;
    const seo = buildSeoTags( post );
    const v = validateJsonLd( seo.tags );
    if ( !v.valid ) return err( { error: v.error, slug }, 400, req );
    console.log( '[blogseoapply] postId=' + id + ' slug=' + slug + ' tags=' + seo.tags.length + ' keyword=' + seo.focusKeyword );
    if ( dryrun === '1' ) return json( { ok: true, action: 'apply', dryRun: true, slug, postId: id, title: post.title, titleTag: seo.titleTag, description: seo.description, canonical: seo.canonical, focusKeyword: seo.focusKeyword, image: seo.image, tagCount: seo.tags.length, jsonLdValid: true } );
    const r1 = await wixApi( 'PATCH', '/blog/v3/draft-posts/' + id, { draftPost: { seoData: { tags: seo.tags, settings: seo.settings } }, action: 'UPDATE_REVERT_TO_DRAFT' } );
    if ( !r1.ok ) return err( { error: 'revert+update failed', status: r1.status, detail: r1.data }, 500, req );
    const r2 = await wixApi( 'POST', '/blog/v3/draft-posts/' + id + '/publish', {} );
    if ( !r2.ok ) return err( { error: 'republish failed', status: r2.status, detail: r2.data }, 500, req );
    console.log( '[blogseoapply] DONE slug=' + slug + ' tags=' + seo.tags.length );
    return json( { ok: true, action: 'apply', slug, postId: id, title: post.title, titleTag: seo.titleTag, description: seo.description, canonical: seo.canonical, author: seo.author, focusKeyword: seo.focusKeyword, image: seo.image, jsonLdTypes: [ 'BlogPosting', 'BreadcrumbList' ], tagCount: seo.tags.length } );
  } catch ( e ) { return err( { error: e.message }, 500, req ); }
}

// Product SEO writer — mirrors get_blogseoapply for the store.
// Defaults to a dry run; pass dryrun=0 to actually write seoData.
export async function get_productseo ( req )
{
  if ( !( await auth( req ) ) ) return deny( req );
  try
  {
    const { dryrun = '1', slug = '' } = req.query;
    return json( await applyProductSeo( { dryRun: dryrun !== '0', slug } ), req );
  } catch ( e ) { return err( { error: e.message }, 500, req ); }
}

// ── Schema endpoints ──

export async function get_schemablog ( req )
{
  try
  {
    const { slug = '' } = req.query;
    if ( !slug ) return json( null );
    let post; try { const r = await wixData.query( 'Blog/Posts' ).eq( 'slug', slug ).limit( 1 ).find( AUTH_OPTS ); post = r.items[ 0 ]; } catch { return json( null ); }
    if ( !post ) return json( null );
    const u = BASE + '/post/' + slug, t = post.title || 'Untitled', d = ( post.excerpt || post.plainContent || '' ).slice( 0, 160 );
    return json( {
      '@context': 'https://schema.org', '@graph': [
        { '@type': 'BlogPosting', '@id': u + '#blogposting', mainEntityOfPage: { '@type': 'WebPage', '@id': u + '#webpage' }, headline: t, description: d, author: { '@type': 'Person', name: 'Swdhya Vaksetu', url: BASE + '/swdhya' }, publisher: { '@type': 'Organization', '@id': BASE + '/#organization', name: BRAND, url: BASE + '/', logo: { '@type': 'ImageObject', url: LOGO } }, url: u, articleSection: 'Swdhya Vaksetu', inLanguage: 'en-IN', isPartOf: { '@id': BASE + '/#website' }, breadcrumb: { '@id': u + '#breadcrumb' }, datePublished: post.publishedDate || post._createdDate, dateModified: post.lastPublishedDate || post._updatedDate, image: post.coverImage || post.heroImage },
        { '@type': 'BreadcrumbList', '@id': u + '#breadcrumb', itemListElement: [ { '@type': 'ListItem', position: 1, name: 'Home', item: BASE + '/' }, { '@type': 'ListItem', position: 2, name: 'Blog', item: BASE + '/blog' }, { '@type': 'ListItem', position: 3, name: t, item: u } ] }
      ]
    } );
  } catch { return json( null ); }
}

export async function get_schemaproduct ( req )
{
  try
  {
    const { id = '' } = req.query;
    if ( !id ) return json( null );
    const raw = await getProduct( id );
    if ( !raw ) return json( null );
    // Single source of truth: the same builder that writes each product's
    // seoData, so the endpoint and the live page can never drift apart.
    const seo = buildProductSeo( normalizeProduct( raw ) );
    const graph = seo.tags
      .filter( t => t.type === 'script' && t.props?.type === 'application/ld+json' )
      .map( t => JSON.parse( t.children ) );
    return json( { '@context': 'https://schema.org', '@graph': graph } );
  } catch { return json( null ); }
}

// ── Info endpoints ──

export async function get_contact ()
{
  return json( { name: SITE.name, url: SITE.url, email: SITE.email, telephone: SITE.phone, logo: SITE.logo, image: SITE.logo, description: SITE.description, address: { '@type': 'PostalAddress', streetAddress: SITE.address.streetAddress, addressLocality: SITE.address.city, addressRegion: SITE.address.state, postalCode: SITE.address.pincode, addressCountry: SITE.address.country }, sameAs: [ SITE.instagram ] } );
}

export async function get_faq ()
{
  const schema = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQS.map( f => ( { '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } } ) ) };
  return json( { faqs: { general: FAQS }, schema, count: FAQS.length } );
}

export async function get_canonicalize ( req )
{
  try
  {
    const { url = '' } = req.query;
    if ( !url ) return json( { ok: false, error: 'url required' } );
    let p; try { p = new URL( url ); } catch { return json( { ok: false, error: 'invalid url' } ); }
    const strip = [ 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id', 'fbclid', 'gclid', 'msclkid', 'wbraid', 'gbraid', 'ttclid', 'twclid', 'mc_eid', 'irclickid', 'ref', 'src', 'wixCodeMetaId', 'wixCodePageId', 'wixCodeInstance', 'instance', 'compId', 'viewerCompId', 'siteRevision', 'appSectionParams' ];
    let changed = false;
    strip.forEach( k => { if ( p.searchParams.has( k ) ) { p.searchParams.delete( k ); changed = true; } } );
    if ( p.hostname === 'wecare.digital' ) { p.hostname = 'www.wecare.digital'; changed = true; }
    const lp = p.pathname.toLowerCase(); if ( p.pathname !== lp ) { p.pathname = lp; changed = true; }
    if ( p.pathname.length > 1 && p.pathname.endsWith( '/' ) ) { p.pathname = p.pathname.slice( 0, -1 ); changed = true; }
    return json( { ok: true, canonical: p.toString(), changed, original: url } );
  } catch ( e ) { return err( { error: e.message }, 500, req ); }
}

// ── RSS ──

function rssXml ( title, link, desc, items )
{
  const esc = s => String( s || '' ).replace( /&/g, '&amp;' ).replace( /</g, '&lt;' ).replace( />/g, '&gt;' );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>${ esc( title ) }</title><link>${ esc( link ) }</link><description>${ esc( desc ) }</description><language>en-IN</language><lastBuildDate>${ new Date().toUTCString() }</lastBuildDate>${ items.map( i => `<item><title>${ esc( i.title ) }</title><link>${ esc( i.link ) }</link><description>${ esc( i.description ) }</description>${ i.pubDate ? '<pubDate>' + i.pubDate + '</pubDate>' : '' }</item>` ).join( '' ) }</channel></rss>`;
}

export async function get_rss ()
{
  try
  {
    const items = [];
    try { const r = await wixData.query( 'Blog/Posts' ).descending( 'publishedDate' ).limit( 20 ).find( AUTH_OPTS ); r.items.forEach( p => items.push( { title: p.title || '', link: BASE + '/post/' + ( p.slug || '' ), description: ( p.excerpt || '' ).slice( 0, 300 ), pubDate: p.publishedDate ? new Date( p.publishedDate ).toUTCString() : '' } ) ); } catch { }
    return rawResponse( { status: 200, headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' }, body: rssXml( BRAND, BASE, 'Latest from ' + BRAND, items ) } );
  } catch ( e ) { return err( { error: e.message } ); }
}

export async function get_rssblog ()
{
  try
  {
    const items = [];
    try { const r = await wixData.query( 'Blog/Posts' ).descending( 'publishedDate' ).limit( 50 ).find( AUTH_OPTS ); r.items.forEach( p => items.push( { title: p.title || '', link: BASE + '/post/' + ( p.slug || '' ), description: ( p.excerpt || '' ).slice( 0, 300 ), pubDate: p.publishedDate ? new Date( p.publishedDate ).toUTCString() : '' } ) ); } catch { }
    return rawResponse( { status: 200, headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' }, body: rssXml( BRAND + ' Blog', BASE + '/blog', 'Blog posts from ' + BRAND, items ) } );
  } catch ( e ) { return err( { error: e.message } ); }
}

export async function get_rssproducts ()
{
  try
  {
    const items = [];
    try
    {
      const ps = ( await listProducts() ).map( normalizeProduct )
        .sort( ( a, b ) => new Date( b.createdDate ) - new Date( a.createdDate ) )
        .slice( 0, 50 );
      ps.forEach( p => items.push( { title: p.name, link: p.url, description: p.description.slice( 0, 300 ), pubDate: p.createdDate ? new Date( p.createdDate ).toUTCString() : '' } ) );
    } catch { }
    return rawResponse( { status: 200, headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' }, body: rssXml( BRAND + ' Products', BASE, 'Products from ' + BRAND, items ) } );
  } catch ( e ) { return err( { error: e.message } ); }
}

// ── Diagnostic ──

// Derived from seoMap rather than hand-maintained. The two lists had drifted:
// seoMap carried 50+ paths while this array listed 37, so pages existed in one
// and not the other and the sitemap silently omitted real pages. Anything
// marked noindex in seoMap is excluded, which is the correct rule anyway - a
// sitemap should not advertise pages you have told crawlers to skip.
const ALL_PAGES = Object.keys( seoMap )
  .filter( p => !/noindex/i.test( seoMap[ p ].robots || 'index, follow' ) )
  .sort( ( a, b ) => ( a === '/' ? -1 : b === '/' ? 1 : a.localeCompare( b ) ) );

export async function get_robots () { return txt( 'User-agent: *\nAllow: /\n\n# AI Agents & LLM Crawlers — explicitly allowed\nUser-agent: GPTBot\nAllow: /\n\nUser-agent: ChatGPT-User\nAllow: /\n\nUser-agent: Google-Extended\nAllow: /\n\nUser-agent: PerplexityBot\nAllow: /\n\nUser-agent: ClaudeBot\nAllow: /\n\nUser-agent: Applebot-Extended\nAllow: /\n\nUser-agent: cohere-ai\nAllow: /\n\nSitemap: ' + BASE + '/pages-sitemap.xml\nSitemap: ' + BASE + '/store-products-sitemap.xml\nSitemap: ' + BASE + '/blog-posts-sitemap.xml\n' ); }
export async function get_smindex () { return json( { sitemaps: [ BASE + '/pages-sitemap.xml', BASE + '/store-products-sitemap.xml', BASE + '/blog-posts-sitemap.xml' ] } ); }
export async function get_sitemap () { return rawResponse( { status: 301, headers: { Location: BASE + '/pages-sitemap.xml' }, body: '' } ); }
export async function get_smtxt () { return txt( [ BASE + '/' ].concat( ALL_PAGES.slice( 1 ).map( p => BASE + p ) ).join( '\n' ) ); }

export async function get_stats ()
{
  let p = 0, c = 0;
  try { p = await countProducts(); } catch { }
  try { c = ( await listCategories() ).length; } catch { }
  return json( { products: p, collections: c, timestamp: new Date().toISOString() } );
}

// ── AI / LLM ──

export async function get_llms ()
{
  return json( { name: SITE.name, url: SITE.url, description: SITE.description, brands: SITE.brands.map( b => ( { name: b.name, category: b.category, url: b.url || ( BASE + b.path ) } ) ), contact: { email: SITE.email, phone: SITE.phone, city: SITE.address.city, country: SITE.address.country } } );
}

export async function get_llmslong ()
{
  return json( { name: SITE.name, url: SITE.url, description: BRAND + ' is a network of microservice brands built for everyday Bharat. We operate ' + SITE.brands.map( b => b.name + ' (' + b.category.toLowerCase() + ')' ).join( ', ' ) + '. Based in Kolkata, India. Contact: ' + SITE.email + ', +91 9330994400.' } );
}

export async function get_llmstxt ()
{
  const brands = SITE.brands.map( b => '- [' + b.name + '](' + ( b.url || ( BASE + b.path ) ) + '): ' + b.category ).join( '\n' );
  const services = [
    '- [Submit Request](' + BASE + '/submit-request): Submit a new service request with basic details and Order ID',
    '- [Track Request](' + BASE + '/track-request): Check the status of an existing request',
    '- [Book Appointment](' + BASE + '/appointment): Book an appointment for supported services',
    '- [Upload Documents](' + BASE + '/drop-docs): Securely upload supporting documents to a case',
    '- [Enterprise Assist](' + BASE + '/enterprise-assist): Get help with business or service-related cases',
    '- [Gift Card](' + BASE + '/gift-card): Buy e-gift cards with custom amount and message',
  ].join( '\n' );
  const feeds = [
    '- [FAQ](' + BASE + '/_functions/faq): Frequently asked questions with FAQPage schema',
    '- [Product Feed](' + BASE + '/_functions/productfeed): Structured product data (JSON)',
    '- [Agent Card](' + BASE + '/_functions/agentcard): Agent discovery card with capabilities and protocols',
    '- [RSS Feed](' + BASE + '/_functions/rss): Latest content feed',
    '- [Blog RSS](' + BASE + '/_functions/rssblog): Blog posts feed',
    '- [Product RSS](' + BASE + '/_functions/rssproducts): Products feed',
    '- [Contact](' + BASE + '/_functions/contact): Structured contact information',
    '- [Sitemap](' + BASE + '/pages-sitemap.xml): XML sitemap for all pages',
  ].join( '\n' );
  return txt(
    '# ' + BRAND + '\n\n' +
    '> A network of microservice brands serving everyday Bharat across travel, paperwork, disputes, rituals, reflection, and support. Based in Kolkata, India.\n\n' +
    BRAND + ' operates six microservice brands designed to solve real problems for real people with simple access, transparent pricing, and reliable service. ' +
    'Contact: ' + SITE.email + ' | ' + SITE.phone + ' | ' + SITE.address.city + ', ' + SITE.address.state + ' ' + SITE.address.pincode + ', India.\n\n' +
    '## Brands\n\n' + brands + '\n\n' +
    '## Services\n\n' + services + '\n\n' +
    '## Feeds & APIs\n\n' + feeds + '\n\n' +
    '## Optional\n\n' +
    '- [Blog](' + BASE + '/blog): Philosophical reflections by Swdhya Vaksetu on being, choice, and transformation\n' +
    '- [Legal Stuff](' + BASE + '/legal-stuff): Terms and conditions\n' +
    '- [Privacy Policy](' + BASE + '/privacy): Privacy policy\n' +
    '- [Careers](' + BASE + '/careers-plus-culture): Careers and culture\n'
  );
}

export async function get_llmsfull ()
{
  let blogList = '';
  try
  {
    const r = await wixData.query( 'Blog/Posts' ).descending( 'publishedDate' ).limit( 50 ).find( AUTH_OPTS );
    blogList = r.items.map( p => '- [' + ( p.title || 'Untitled' ) + '](' + BASE + '/post/' + ( p.slug || '' ) + '): ' + ( ( p.excerpt || '' ).slice( 0, 150 ) || 'Blog post by Swdhya Vaksetu' ) ).join( '\n' );
  } catch { }
  let productList = '';
  try
  {
    productList = ( await listProducts() ).map( normalizeProduct ).slice( 0, 50 ).map( p =>
      '- [' + p.name + '](' + p.url + '): ' + ( p.description.slice( 0, 100 ) || 'Product' ) +
      ' — ₹' + p.price + ( p.hasPriceRange ? '–₹' + p.priceMax : '' )
    ).join( '\n' );
  } catch { }
  const brands = SITE.brands.map( b => '- [' + b.name + '](' + ( b.url || ( BASE + b.path ) ) + '): ' + b.category ).join( '\n' );
  const faqList = FAQS.map( f => '- **' + f.q + '** — ' + f.a ).join( '\n' );
  return txt(
    '# ' + BRAND + '\n\n' +
    '> A network of microservice brands serving everyday Bharat across travel, paperwork, disputes, rituals, reflection, and support. Based in Kolkata, India.\n\n' +
    BRAND + ' operates six microservice brands: ' + SITE.brands.map( b => b.name + ' (' + b.category.toLowerCase() + ')' ).join( ', ' ) + '. ' +
    'We focus on simple access, transparent pricing, and reliable service through digital-first experiences.\n\n' +
    'Contact: ' + SITE.email + ' | ' + SITE.phone + ' | ' + SITE.address.streetAddress + ', ' + SITE.address.city + ', ' + SITE.address.state + ' ' + SITE.address.pincode + ', India.\n\n' +
    '## Brands\n\n' + brands + '\n\n' +
    '## FAQ\n\n' + faqList + '\n\n' +
    ( blogList ? '## Blog Posts\n\n' + blogList + '\n\n' : '' ) +
    ( productList ? '## Products\n\n' + productList + '\n\n' : '' ) +
    '## Feeds & APIs\n\n' +
    '- [Agent Card](' + BASE + '/_functions/agentcard): Agent discovery with capabilities and protocols\n' +
    '- [Product Feed](' + BASE + '/_functions/productfeed): Structured product data (JSON)\n' +
    '- [FAQ Schema](' + BASE + '/_functions/faq): FAQPage structured data\n' +
    '- [RSS](' + BASE + '/_functions/rss): Latest content\n' +
    '- [Sitemap](' + BASE + '/pages-sitemap.xml): XML sitemap\n' +
    '- [Contact](' + BASE + '/_functions/contact): Structured contact info\n'
  );
}

export async function get_discovery () { return json( { name: SITE.name, feeds: { llms: '/_functions/llms', llmstxt: '/_functions/llmstxt', llmsfull: '/_functions/llmsfull', rss: '/_functions/rss', sitemap: '/pages-sitemap.xml', contact: '/_functions/contact', faq: '/_functions/faq', agentCard: '/_functions/agentcard', productFeed: '/_functions/productfeed', services: '/_functions/services', schemaBlog: '/_functions/schemablog', schemaProduct: '/_functions/schemaproduct' } } ); }

export async function get_aiindex ()
{
  return json( { site: SITE.name, url: SITE.url, pages: ALL_PAGES.map( p => ( { url: p, fullUrl: BASE + p } ) ), brands: SITE.brands.map( b => ( { name: b.name, category: b.category, url: b.url || ( BASE + b.path ) } ) ), feeds: { rss: BASE + '/_functions/rss', sitemap: BASE + '/pages-sitemap.xml' } } );
}

export async function get_siteinfo ()
{
  return json( { name: SITE.name, url: SITE.url, description: SITE.description, language: 'en-IN', country: 'IN', city: SITE.address.city, email: SITE.email, phone: SITE.phone, sitemaps: [ BASE + '/pages-sitemap.xml', BASE + '/store-products-sitemap.xml', BASE + '/blog-posts-sitemap.xml' ] } );
}

// ── Agentic Web / AI Agent Discovery (Wix AI Search Lab + ACP compliance) ──

export async function get_agentcard ()
{
  return json( {
    schema_version: '1.0',
    name: SITE.name,
    description: SITE.description,
    url: SITE.url,
    logo: SITE.logo,
    contact: { email: SITE.email, phone: SITE.phone },
    address: { city: SITE.address.city, region: SITE.address.state, country: SITE.address.country, postal_code: SITE.address.pincode },
    capabilities: {
      booking: { enabled: true, endpoint: BASE + '/appointment', description: 'Book appointments for supported services' },
      inquiry: { enabled: true, endpoint: BASE + '/submit-request', description: 'Submit service requests and inquiries' },
      tracking: { enabled: true, endpoint: BASE + '/track-request', description: 'Track existing requests by Order ID' },
      shopping: { enabled: true, endpoint: BASE + '/product-page/{slug}', description: 'Browse and purchase products' },
      gift_cards: { enabled: true, endpoint: BASE + '/gift-card', description: 'Purchase e-gift cards' },
      faq: { enabled: true, endpoint: BASE + '/_functions/faq', description: 'Frequently asked questions with structured data' },
    },
    feeds: {
      llms_txt: BASE + '/_functions/llmstxt',
      llms_full: BASE + '/_functions/llmsfull',
      llms_json: BASE + '/_functions/llms',
      rss: BASE + '/_functions/rss',
      rss_blog: BASE + '/_functions/rssblog',
      rss_products: BASE + '/_functions/rssproducts',
      faq: BASE + '/_functions/faq',
      contact: BASE + '/_functions/contact',
      products: BASE + '/_functions/productfeed',
      sitemap: BASE + '/pages-sitemap.xml',
    },
    schema: {
      blog: BASE + '/_functions/schemablog?slug={slug}',
      product: BASE + '/_functions/schemaproduct?id={id}',
    },
    brands: SITE.brands.map( b => ( { name: b.name, category: b.category, url: b.url || ( BASE + b.path ) } ) ),
    protocols: [ 'schema.org', 'llms.txt' ],
    language: 'en-IN',
    currency: 'INR',
    payment_methods: [ 'UPI', 'Credit Card', 'Debit Card', 'Net Banking' ],
    business_hours: { timezone: 'Asia/Kolkata', weekdays: '09:00-18:00', weekends: 'Closed', self_service: '24/7' },
  } );
}

export async function get_productfeed ()
{
  if ( !( await auth( arguments[ 0 ] ) ) ) return deny( arguments[ 0 ] );
  try
  {
    const products = ( await listProducts() ).map( normalizeProduct ).map( p => ( {
      id: p.id,
      name: p.name,
      slug: p.slug,
      url: p.url,
      description: p.description.slice( 0, 500 ),
      image: p.image || LOGO,
      price: { amount: p.price, currency: p.currency },
      compare_at_price: p.compareAtPrice || null,
      price_max: p.hasPriceRange ? p.priceMax : null,
      in_stock: p.inStock,
      brand: p.brand,
      category: p.ribbon || 'General',
      variants: p.variantCount,
    } ) );
    return json( { products, count: products.length, currency: 'INR', brand: BRAND, updated: new Date().toISOString() } );
  } catch ( e ) { return err( { error: e.message }, 500, arguments[ 0 ] ); }
}

export async function get_services ()
{
  return json( {
    services: [
      { name: 'Submit Request', path: '/submit-request', type: 'inquiry', description: 'Submit a new service request with basic details and Order ID' },
      { name: 'Track Request', path: '/track-request', type: 'tracking', description: 'Check the status of an existing request' },
      { name: 'Book Appointment', path: '/appointment', type: 'booking', description: 'Book an appointment for supported services' },
      { name: 'Amendment Request', path: '/amend-request', type: 'inquiry', description: 'Request changes to an existing submission' },
      { name: 'Upload Documents', path: '/drop-docs', type: 'upload', description: 'Securely upload supporting documents to a case' },
      { name: 'RX Slot Booking', path: '/rx-slot', type: 'booking', description: 'Book or reschedule doctor/treatment appointments' },
      { name: 'Enterprise Assist', path: '/enterprise-assist', type: 'support', description: 'Get help with business or service-related cases' },
      { name: 'Leave Review', path: '/leave-review', type: 'feedback', description: 'Share your experience after using a service' },
      { name: 'Gift Card', path: '/gift-card', type: 'purchase', description: 'Buy e-gift cards with custom amount and message' },
    ],
    brand: BRAND,
    base_url: BASE,
  } );
}