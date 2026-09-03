import { initHygiene } from 'public/site-hygiene.js';
import { initButtonNormalize } from 'public/button-normalize.js';
import { initLanguage } from 'public/wecare-language.js';
import wixLocationFrontend from 'wix-location-frontend';
import { currentMember } from 'wix-members-frontend';
import { getMyOrderIdList } from 'backend/member-orders.web.js';

$w.onReady(function () {
  initHygiene();
  initButtonNormalize();

  // Read-aloud + on-page translation. Self-disables when the language relay
  // cannot serve this origin or the capability it needs, so it never renders a
  // dead control. Wrapped so order forms still run if the widget throws.
  try { initLanguage(); } catch (e) { console.warn('[lang] init skipped', e); }

  var path = (wixLocationFrontend.path || []).join('/').toLowerCase();
  if (path === 'submitrequest' || path === 'submit-request') {
    fillSubmitRequestForm();
  }
});

async function fillSubmitRequestForm() {
  console.log('[SR] fillSubmitRequestForm running');

  // Find form element (try multiple IDs)
  var form = null;
  var formIds = ['#wixForms1', '#form1', '#wixForms2', '#submitRequestForm'];
  for (var fi = 0; fi < formIds.length; fi++) {
    try {
      var f = $w(formIds[fi]);
      if (f && typeof f.setFieldValues === 'function') { form = f; console.log('[SR] Form:', formIds[fi]); break; }
    } catch (e) {}
  }

  try {
    var member = await currentMember.getMember({ fieldsets: ['FULL'] });
    if (!member) { console.log('[SR] Not logged in'); showNoOrders(form); return; }

    var email = member.loginEmail || '';
    if (!email && member.contactDetails && member.contactDetails.emails) {
      email = member.contactDetails.emails[0] || '';
    }
    if (!email) { console.log('[SR] No email'); showNoOrders(form); return; }

    console.log('[SR] Email:', email);
    var orderIds = await getMyOrderIdList(email);

    if (!orderIds || orderIds.length === 0) {
      console.log('[SR] No orders');
      showNoOrders(form);
      return;
    }

    var opts = orderIds.map(function (o) {
      return { label: o.label, value: o.value };
    });

    var query = wixLocationFrontend.query || {};
    var selectedId = query.orderId || opts[0].value;

    // Populate dropdown
    try {
      $w('#dropdown_sr').options = opts;
      $w('#dropdown_sr').value = selectedId;
      console.log('[SR] Dropdown:', opts.length, 'opts, selected:', selectedId);
    } catch (e) { console.error('[SR] Dropdown error:', e); }

    // Sync to form
    if (form) {
      try { form.setFieldValues({ order_id_1: selectedId }); console.log('[SR] Form set:', selectedId); } catch (e) {}
    }

    // Wire dropdown change → form field
    try {
      $w('#dropdown_sr').onChange(function (event) {
        var val = event.target.value;
        console.log('[SR] Picked:', val);
        if (form) { try { form.setFieldValues({ order_id_1: val }); } catch (e) {} }
      });
    } catch (e) {}

  } catch (err) {
    console.error('[SR] Error:', err);
    showNoOrders(form);
  }
}

function showNoOrders(form) {
  try {
    $w('#dropdown_sr').options = [{ label: 'No orders found', value: '' }];
    $w('#dropdown_sr').value = '';
    $w('#dropdown_sr').placeholder = 'No orders found';
  } catch (e) {}
  if (form) { try { form.setFieldValues({ order_id_1: '' }); } catch (e) {} }
}
