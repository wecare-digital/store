import { getSecret } from 'wix-secrets-backend';
import wixData from 'wix-data';
import { createOrGetOrderId } from 'backend/orderId-helpers';

// ══════════════════════════════════════════════════════════════
// ORDER NOTIFICATIONS — WhatsApp + SMS on new order
// ══════════════════════════════════════════════════════════════

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

  notif.updatedAt = new Date();
  try
  {
    await wixData.insert( 'OrderNotifications', notif, { suppressAuth: true } );
  } catch ( logErr )
  {
    try { await wixData.update( 'OrderNotifications', notif, { suppressAuth: true } ); } catch { }
  }
}
