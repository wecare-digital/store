import { ok, notFound, forbidden, response as rawResponse } from 'wix-http-functions';
import wixData from 'wix-data';
import { getSecret } from 'wix-secrets-backend';
import { extractShortId, extractFriendlyDate, buildWhatsAppLabel, buildDisplayLabel, normalizePhone } from 'backend/orderId-helpers';
// This site is on Wix Stores Catalog V3. The legacy wix-data collections
// (Stores/Products, Stores/Collections, Stores/InventoryItems) are V1 surfaces
// and return 0 rows here — all catalog reads go through catalog-v3 instead.
import { countProducts, listProducts, getProduct, listCategories, listInventoryItems, normalizeProduct } from 'backend/catalog-v3.js';

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
    { name: 'Dastavez', category: 'Legal Services', path: '/dastavez' },
    { name: 'Ritual Guru', category: 'Spiritual/Cultural', path: '/ritual' },
    { name: 'Swdhya', category: 'Personal Growth', path: '/swdhya' },
    { name: 'ClearClosure', category: 'Dispute Resolution', path: '/clear-closure' },
    { name: 'Expo Week', category: 'Events', path: '/expoweek' },
    { name: 'Elsewhere', category: 'Travel', path: '/elsewhere' },
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
let _secret;
let _secretFetchedAt = 0;
const SECRET_TTL_MS = 5 * 60 * 1000;

async function auth ( req )
{
  try
  {
    if ( _secret === undefined || Date.now() - _secretFetchedAt > SECRET_TTL_MS )
    {
      _secret = await getSecret( 'WECARE_API_KEY' );
      _secretFetchedAt = Date.now();
    }
    if ( !_secret ) { console.error( '[auth] WECARE_API_KEY secret is empty - denying' ); return false; }
    const presented = req?.headers?.[ 'x-api-key' ];
    if ( typeof presented !== 'string' || presented.length !== _secret.length ) return false;
    let diff = 0;
    for ( let i = 0; i < presented.length; i++ ) diff |= presented.charCodeAt( i ) ^ _secret.charCodeAt( i );
    return diff === 0;
  }
  catch ( e )
  {
    _secret = undefined;
    console.error( '[auth] secret lookup failed, denying:', e?.message || e );
    return false;
  }
}

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
    '- [Sitemap](' + BASE + '/sitemap.xml): Wix native XML sitemap',
  ].join( '\n' );
  return txt(
    '# ' + BRAND + '\n\n' +
    '> A network of microservice brands serving everyday Bharat across travel, paperwork, disputes, rituals, reflection, and support. Based in Kolkata, India.\n\n' +
    BRAND + ' operates its microservice brands with simple access, transparent pricing, and reliable service. ' +
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
    BRAND + ' operates microservice brands across everyday needs. ' +
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
    '- [Sitemap](' + BASE + '/sitemap.xml): Wix native XML sitemap\n' +
    '- [Contact](' + BASE + '/_functions/contact): Structured contact info\n'
  );
}

export async function get_discovery () { return json( { name: SITE.name, feeds: { llms: '/_functions/llms', llmstxt: '/_functions/llmstxt', llmsfull: '/_functions/llmsfull', rss: '/_functions/rss', sitemap: '/sitemap.xml', contact: '/_functions/contact', faq: '/_functions/faq', agentCard: '/_functions/agentcard', productFeed: '/_functions/productfeed', services: '/_functions/services' } } ); }

export async function get_aiindex ()
{
  return json( { site: SITE.name, url: SITE.url, brands: SITE.brands.map( b => ( { name: b.name, category: b.category, url: b.url || ( BASE + b.path ) } ) ), feeds: { rss: BASE + '/_functions/rss', sitemap: BASE + '/sitemap.xml' } } );
}

export async function get_siteinfo ()
{
  return json( { name: SITE.name, url: SITE.url, description: SITE.description, language: 'en-IN', country: 'IN', city: SITE.address.city, email: SITE.email, phone: SITE.phone, sitemaps: [ BASE + '/sitemap.xml' ] } );
}

// ── Agentic Web / AI Agent Discovery ──

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
      sitemap: BASE + '/sitemap.xml',
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
