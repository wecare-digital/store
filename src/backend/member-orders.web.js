import { Permissions, webMethod } from 'wix-web-module';
import { getMemberOrdersPaged, extractShortId, buildDisplayLabel } from 'backend/orderId-helpers';

/** Only custom order-ID selection; Wix Forms owns request submission. */
export const getMyOrderIdList = webMethod(Permissions.SiteMember, async () => {
  const options = [];
  let page = 0;
  let result;
  do {
    result = await getMemberOrdersPaged({ page, pageSize: 50 });
    options.push(...result.items.map(item => ({
      value: item.orderId, label: buildDisplayLabel(item.orderId), shortId: extractShortId(item.orderId),
    })));
    page++;
  } while (result.hasMore);
  return options;
});
