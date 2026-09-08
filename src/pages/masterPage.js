import wixLocationFrontend from 'wix-location-frontend';
import { currentMember } from 'wix-members-frontend';
import { getMyOrderIdList } from 'backend/member-orders.web';

// The only site-wide custom behavior is order-ID selection on the existing form.
$w.onReady(async function () {
  const path = (wixLocationFrontend.path || []).join('/').toLowerCase();
  if (path !== 'submitrequest' && path !== 'submit-request') return;
  let dropdown;
  try { dropdown = $w('#dropdown_sr'); } catch { return; }
  if (!dropdown) return;
  let form;
  for (const id of ['#wixForms1', '#form1', '#wixForms2', '#submitRequestForm']) {
    try {
      const candidate = $w(id);
      if (typeof candidate?.setFieldValues === 'function') { form = candidate; break; }
    } catch { /* Form IDs vary by page revision. */ }
  }
  const sync = value => { if (form) form.setFieldValues({ order_id_1: value }); };
  dropdown.options = [];
  dropdown.value = '';
  sync('');
  try {
    if (!(await currentMember.getMember())?._id) return;
    const options = (await getMyOrderIdList()).map(item => ({ label: item.label, value: item.value }));
    dropdown.options = options;
    if (!options.length) { dropdown.placeholder = 'No orders found'; return; }
    const requested = wixLocationFrontend.query?.orderId;
    dropdown.value = options.some(option => option.value === requested) ? requested : options[0].value;
    sync(dropdown.value);
    dropdown.onChange(event => {
      const value = event.target.value;
      sync(options.some(option => option.value === value) ? value : '');
    });
  } catch {
    dropdown.options = [];
    dropdown.value = '';
    dropdown.placeholder = 'Orders unavailable';
    sync('');
  }
});
