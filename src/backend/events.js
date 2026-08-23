/**
 * Wix Velo Backend Events
 * 
 * Auto-triggers when blog posts are published or updated.
 * 
 * NEW FLOW (AI SEO Autopilot):
 * 1. Author publishes a blog post in Wix Dashboard
 * 2. Wix fires onPostPublished event
 * 3. This handler calls stack.wecare.digital/api/seo-tools/ai-seo-audit
 * 4. AI (Claude Opus 4.7 via Bedrock) generates full SEO audit
 * 5. Result saved as "pending_review" in SEO dashboard
 * 6. Admin reviews and approves in dashboard
 * 7. On approval, SEO data is pushed back to the blog post
 * 
 * OLD FLOW (kept as fallback):
 * - Calls blog-seo-webhook for basic SEO push (no AI)
 * - Used when AI audit endpoint is unavailable
 * 
 * For OLD posts: trigger manually from dashboard by slug or batch.
 */

import { getSecret } from 'wix-secrets-backend';

const SITE_BASE = 'https://www.wecare.digital';
// AI SEO Audit endpoint (new — Claude Opus 4.7)
const AI_AUDIT_URL = 'https://stack.wecare.digital/api/seo-tools/ai-seo-audit';
// Legacy webhook (fallback — basic SEO push without AI)
const LEGACY_WEBHOOK_URL = 'https://stack.wecare.digital/api/seo-tools/blog-seo-webhook';

let _webhookSecret;
async function getWebhookSecret ()
{
  if ( _webhookSecret !== undefined ) return _webhookSecret;
  try
  {
    _webhookSecret = await getSecret( 'BLOG_WEBHOOK_SECRET' );
  } catch
  {
    _webhookSecret = '';
  }
  return _webhookSecret;
}

/**
 * Try AI audit first, fall back to legacy webhook if it fails.
 */
async function triggerSeoAudit ( postId, slug, title )
{
  const secret = await getWebhookSecret();
  const headers = {
    'Content-Type': 'application/json',
    ...( secret ? { 'x-webhook-secret': secret } : {} ),
  };

  // Try AI audit endpoint first
  try
  {
    const aiResponse = await fetch( AI_AUDIT_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify( { slug } ),
    } );

    const aiData = await aiResponse.json();

    if ( aiData.ok )
    {
      console.log( `[seo-ai] ✅ AI audit created for "${ title }" (${ slug }) — score: ${ aiData.audit?.seoScoreBefore } → ${ aiData.audit?.seoScoreAfter }, cost: $${ aiData.log?.costEstimate }` );
      console.log( `[seo-ai] Status: pending_review — admin must approve in dashboard` );
      return { method: 'ai', success: true, data: aiData };
    } else
    {
      console.log( `[seo-ai] ⚠️ AI audit returned error for "${ title }": ${ aiData.error }` );
    }
  } catch ( err )
  {
    console.log( `[seo-ai] ⚠️ AI audit endpoint unavailable: ${ err.message }` );
  }

  // Fallback to legacy webhook
  try
  {
    console.log( `[seo-legacy] Falling back to legacy webhook for "${ title }"...` );
    const legacyResponse = await fetch( LEGACY_WEBHOOK_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify( { postId, slug, title } ),
    } );

    const legacyData = await legacyResponse.json();

    if ( legacyData.action === 'skipped' )
    {
      console.log( `[seo-legacy] Skipped "${ title }" — already has custom JSON-LD` );
    } else if ( legacyData.action === 'pushed' )
    {
      console.log( `[seo-legacy] ✅ Basic SEO pushed for "${ title }" — ${ legacyData.tagCount } tags` );
    } else
    {
      console.log( `[seo-legacy] Response:`, JSON.stringify( legacyData ) );
    }
    return { method: 'legacy', success: true, data: legacyData };
  } catch ( err )
  {
    console.error( `[seo-legacy] Error: ${ err.message }` );
  }

  // Final fallback: this site's own blogseoapply endpoint.
  //
  // Both tiers above depend on stack.wecare.digital being reachable and on the
  // BLOG_WEBHOOK_SECRET secret. When either is missing, a newly published post
  // used to get no SEO at all and nothing said so. This tier has no external
  // dependency - it runs the in-repo builder against the Blog v3 API - so a
  // post always ends up with a title, description and BlogPosting JSON-LD.
  try
  {
    console.log( `[seo-local] Applying in-repo SEO for "${ title }"...` );
    const key = await getSecret( 'WECARE_API_KEY' ).catch( () => '' );
    const r = await fetch(
      SITE_BASE + '/_functions/blogseoapply?dryrun=0&slug=' + encodeURIComponent( slug ),
      { headers: key ? { 'x-api-key': key } : {} }
    );
    const data = await r.json();
    if ( data.ok )
    {
      console.log( `[seo-local] Applied for "${ title }" - ${ data.tagCount } tags, ${ ( data.jsonLdTypes || [] ).join( ' + ' ) }` );
      return { method: 'local', success: true, data };
    }
    console.error( `[seo-local] Failed for "${ title }":`, data.error );
    return { method: 'local', success: false, error: data.error };
  } catch ( err )
  {
    console.error( `[seo-local] Error: ${ err.message }` );
    return { method: 'none', success: false, error: err.message };
  }
}

/**
 * Fired when a NEW blog post is published.
 */
export async function wixBlog_onPostPublished ( event )
{
  try
  {
    const post = event.entity || event;
    const postId = post.id || post._id || '';
    const slug = post.slug || '';
    const title = post.title || '';

    if ( !postId && !slug )
    {
      console.log( '[seo-event] No postId or slug in event, skipping' );
      return;
    }

    console.log( `[seo-event] 🆕 Post PUBLISHED: "${ title }" (${ slug })` );
    await triggerSeoAudit( postId, slug, title );
  } catch ( err )
  {
    console.error( '[seo-event] Publish error:', err.message || err );
  }
}

/**
 * Fired when an existing blog post is updated (re-published after edit).
 * Only triggers AI audit — does NOT auto-apply. Admin must approve.
 */
export async function wixBlog_onPostUpdated ( event )
{
  try
  {
    const post = event.entity || event;
    const postId = post.id || post._id || '';
    const slug = post.slug || '';
    const title = post.title || '';

    if ( !postId && !slug ) return;

    console.log( `[seo-event] ✏️ Post UPDATED: "${ title }" (${ slug })` );
    await triggerSeoAudit( postId, slug, title );
  } catch ( err )
  {
    console.error( '[seo-event] Update error:', err.message || err );
  }
}


// ══════════════════════════════════════════════════════════════
// ORDER NOTIFICATIONS — WhatsApp + SMS on new order
// ══════════════════════════════════════════════════════════════

import wixData from 'wix-data';
import { createOrGetOrderId } from 'backend/orderId-helpers';

/**
 * Triggered when a new order is approved (paid).
 * 1. Generates WD-ORD number
 * 2. Sends WhatsApp via WABA1 (+919330994400) using wd_order template
 * 3. Sends SMS via Airtel IQ (WDBEEP, DLT 1007723091207562020)
 * 4. Logs delivery status to OrderNotifications collection
 */
export async function wixEcom_onOrderApproved ( event )
{
  const order = event.entity || event;
  const orderId = order._id || order.orderId;
  if ( !orderId ) return;

  const buyer = order.buyerInfo || {};
  const orderDate = order._createdDate || order._dateCreated || new Date();

  let wdOrderId = '';
  try
  {
    wdOrderId = await createOrGetOrderId( {
      wixOrderId: orderId,
      memberId: buyer.memberId || buyer.visitorId || '',
      orderNumber: order.number ? String( order.number ) : '',
      buyerEmail: buyer.email || '',
      buyerPhone: buyer.phone || '',
      totalAmount: '',
      currency: order.currency || '',
      productsSummary: '',
      orderDate,
    } );
    console.log( '[events] Order ' + orderId + ' → ' + wdOrderId );

    try
    {
      var orderRecord = await wixData.get( 'Stores/Orders', orderId, { suppressAuth: true } );
      if ( orderRecord )
      {
        await wixData.update( 'Stores/Orders', Object.assign( {}, orderRecord, {
          customField: { title: 'Order ID', value: wdOrderId },
        } ), { suppressAuth: true } );
      }
    } catch ( cfErr )
    {
      console.error( '[events] customField error:', cfErr?.message );
    }
  } catch ( err )
  {
    console.error( '[events] WD order number error:', err?.message || err );
  }

  // Send notifications
  var buyerPhone = buyer.phone || '';
  if ( buyerPhone )
  {
    _sendOrderNotifications( orderId, wdOrderId, buyerPhone, buyer.email || '' ).catch( function ( err )
    {
      console.error( '[events] Notification error:', err?.message || err );
    } );
  }
}

async function _sendOrderNotifications ( orderId, wdOrderId, phone, email )
{
  var STACK_API = 'https://stack.wecare.digital/api';
  var apiKey = '';
  try { apiKey = await getSecret( 'WECARE_API_KEY' ); } catch { }

  var notif = {
    _id: orderId,
    orderId: orderId,
    wdOrderId: wdOrderId || '',
    phone: phone,
    email: email || '',
    whatsappStatus: 'pending',
    whatsappMessageId: '',
    whatsappError: '',
    smsStatus: 'pending',
    smsMessageId: '',
    smsError: '',
    rcsStatus: 'not_available',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // 1. WhatsApp via WABA1 (+919330994400)
  try
  {
    var waResp = await fetch( STACK_API + '/messaging/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify( {
        phoneNumberId: 'phone-number-id-waba1-direct-1016149501586345',
        to: phone,
        type: 'template',
        template: {
          name: 'wd_order',
          language: { code: 'en' },
          components: [
            {
              type: 'header',
              parameters: [
                { type: 'video', video: { link: 'https://app.wecare.digital/stream/media/m/selfservice.mp4' } }
              ]
            }
          ]
        },
      } ),
    } );
    var waData = await waResp.json();
    if ( waData.messageId || waData.success )
    {
      notif.whatsappStatus = 'sent';
      notif.whatsappMessageId = waData.messageId || '';
      console.log( '[events] WhatsApp sent: ' + ( waData.messageId || 'ok' ) );
    } else
    {
      notif.whatsappStatus = 'failed';
      notif.whatsappError = waData.error || JSON.stringify( waData ).substring( 0, 200 );
    }
  } catch ( waErr )
  {
    notif.whatsappStatus = 'failed';
    notif.whatsappError = waErr?.message || String( waErr );
  }

  // 2. SMS via Airtel IQ (WDBEEP, DLT 1007723091207562020)
  try
  {
    var smsContent = 'Thanks for placing your order with WECARE.DIGITAL!\n\n'
      + 'Your order has been received. We\'ll review it and share updates shortly.\n\n'
      + 'Need help? Submit a request here: https://wecare.digital/selfservice '
      + 'or message / voice note us on WhatsApp: https://r.wecare.digital/wa.';

    var smsResp = await fetch( STACK_API + '/messaging/sms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify( {
        phoneNumber: phone,
        content: smsContent,
        provider: 'airtel',
        messageType: 'SERVICE_IMPLICIT',
        dltTemplateId: '1007723091207562020',
        entityId: '1201161991108627443',
        sourceAddress: 'WDBEEP',
        apiVersion: 'v5',
        metaData: { orderId: orderId, wdOrderId: wdOrderId || '' },
      } ),
    } );
    var smsData = await smsResp.json();
    if ( smsData.messageId || smsData.success )
    {
      notif.smsStatus = 'sent';
      notif.smsMessageId = smsData.messageId || '';
      console.log( '[events] SMS sent: ' + ( smsData.messageId || 'ok' ) );
    } else
    {
      notif.smsStatus = 'failed';
      notif.smsError = smsData.error || JSON.stringify( smsData ).substring( 0, 200 );
    }
  } catch ( smsErr )
  {
    notif.smsStatus = 'failed';
    notif.smsError = smsErr?.message || String( smsErr );
  }

  // 3. RCS via Sinch (if enabled)
  try
  {
    var rcsResp = await fetch( STACK_API + '/rcs/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify( {
        phoneNumber: phone,
        templateId: 'testing',
        language: 'en',
        parameters: {},
        metadata: JSON.stringify( { orderId: orderId, wdOrderId: wdOrderId || '', type: 'order_confirmation' } ),
      } ),
    } );
    var rcsData = await rcsResp.json();
    if ( rcsData.success || rcsData.messageId )
    {
      notif.rcsStatus = 'sent';
      notif.rcsMessageId = rcsData.messageId || rcsData.message_id || '';
    } else
    {
      notif.rcsStatus = rcsData.error === 'RCS not enabled' ? 'not_available' : 'failed';
    }
  } catch ( rcsErr )
  {
    notif.rcsStatus = 'failed';
  }

  // 4. Log to OrderNotifications collection
  notif.updatedAt = new Date();
  try
  {
    await wixData.insert( 'OrderNotifications', notif, { suppressAuth: true } );
  } catch ( logErr )
  {
    try { await wixData.update( 'OrderNotifications', notif, { suppressAuth: true } ); } catch { }
  }
}
