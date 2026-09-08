import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Execute production modules; replace only the Wix/network boundaries.
export function loadSkuModules({ products = [], pages, secret = 'test-key', random = () => 0, getProduct } = {}) {
  const requests = [];
  const registrations = [];
  const context = vm.createContext({
    Math: Object.assign(Object.create(Math), { random }),
    getSecret: async (name) => {
      if (name !== 'api') throw new Error('Unexpected secret name');
      if (secret instanceof Error) throw secret;
      return secret;
    },
    Permissions: { Admin: 'ADMIN' },
    webMethod: (permission, handler) => {
      registrations.push(permission);
      return handler;
    },
    fetch: async (url, options) => {
      const body = options.body ? JSON.parse(options.body) : undefined;
      requests.push({ url, ...options, body });
      let data;
      if (options.method === 'POST' && url.endsWith('/products/search')) {
        const page = body.search.cursorPaging.cursor ? 1 : 0;
        data = pages ? pages[page] : { products, pagingMetadata: { hasNext: false } };
      } else if (options.method === 'GET') {
        const id = decodeURIComponent(new URL(url).pathname.split('/').at(-1));
        const result = getProduct ? getProduct(id) : products.find(p => p.id === id);
        const full = result ? JSON.parse(JSON.stringify(result)) : result;
        if (full && !new URL(url).searchParams.getAll('fields').includes('MERCHANT_DATA')) {
          for (const variant of full.variantsInfo?.variants || []) delete variant.revenueDetails;
        }
        data = { product: full };
      } else if (options.method === 'PATCH') {
        data = { product: body.product };
      } else throw new Error('Unexpected external request');
      return { ok: true, status: 200, text: async () => JSON.stringify(data) };
    },
  });
  function evaluate(file, names) {
    const source = readFileSync(new URL('../src/backend/' + file, import.meta.url), 'utf8')
      .replace(/^import .*;\s*$/gm, '')
      .replace(/\bexport (async function|function|const)/g, '$1');
    return vm.runInContext(`(() => { ${source}\nreturn { ${names.join(',')} }; })()`, context, { filename: file });
  }
  const catalog = evaluate('catalog-v3.js', ['listProducts', 'getProductWithVariants', 'setVariantSkus', 'normalizeProduct']);
  Object.assign(context, catalog);
  const batch = evaluate('sku-batch.web.js', ['assignSkusToAllProducts', 'assignMissingSKUs', 'reprefixSKUs']);
  return { ...catalog, ...batch, requests, registrations };
}

export const plain = value => JSON.parse(JSON.stringify(value));
export const variant = (id, sku = '') => ({ id, sku, visible: true, choices: [], price: { actualPrice: { amount: '12.50' } } });
export const product = (id, variants, variantCount = variants.length) => ({
  id, name: id, revision: '7', options: [], variantSummary: { variantCount }, variantsInfo: { variants },
});
