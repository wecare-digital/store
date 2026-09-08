import test from 'node:test';
import assert from 'node:assert/strict';
import { loadSkuModules, plain, product, variant } from './sku-test-utils.mjs';

test('default assignment is a dry run and preserves existing SKUs', async () => {
  const api = loadSkuModules({ products: [product('p', [variant('a', 'KEEP'), variant('b')])] });
  const result = await api.assignMissingSKUs();
  assert.equal(result.dryRun, true);
  assert.equal(result.variantsUpdated, 1);
  assert.deepEqual(plain(result.updated[0].variants), [
    { id: 'a', oldSku: 'KEEP', newSku: 'KEEP' },
    { id: 'b', oldSku: null, newSku: 'WD-AAAAAAAA-02' },
  ]);
  assert.equal(api.requests.filter(r => r.method === 'PATCH').length, 0);
  assert.deepEqual(api.registrations, ['ADMIN', 'ADMIN', 'ADMIN']);
});

for (const existing of ['wd-aaaaaaaa', 'WD-AAAAAAAA-01']) {
  test(`assignment refuses an occupied final SKU (${existing})`, async () => {
    const target = existing.endsWith('-01') ? [variant('a'), variant('b')] : [variant('a')];
    const api = loadSkuModules({ products: [product('target', target), product('occupied', [variant('x', existing)])] });
    const result = await api.assignSkusToAllProducts({ dryRun: false });
    assert.equal(result.updated.length, 0);
    assert.equal(result.errors.length, 1);
    assert.match(result.errors[0].error, /unique SKU/i);
    assert.equal(api.requests.filter(r => r.method === 'PATCH').length, 0);
  });
}

test('assignment numbers variants from the fresh product, not its search summary', async () => {
  const api = loadSkuModules({ products: [product('p', [variant('a'), variant('b')], 1)] });
  const result = await api.assignMissingSKUs();
  assert.deepEqual(plain(result.updated[0].variants.map(v => v.newSku)), ['WD-AAAAAAAA-01', 'WD-AAAAAAAA-02']);
});

test('assignment retries occupied candidates and reserves final pending SKUs', async () => {
  let draws = 0;
  const blocks = [0, 0.04, 0.04, 0.08];
  const api = loadSkuModules({
    products: [product('p', [variant('a')]), product('q', [variant('b')]), product('occupied', [variant('x', 'WD-AAAAAAAA')])],
    random: () => blocks[Math.floor(draws++ / 8)] ?? 0.08,
  });
  const result = await api.assignMissingSKUs();
  assert.deepEqual(plain(result.updated.map(p => p.variants[0].newSku)), ['WD-BBBBBBBB', 'WD-CCCCCCCC']);
  assert.equal(result.errors.length, 0);
  assert.equal(api.requests.filter(r => r.method === 'PATCH').length, 0);
});

test('reprefix matches complete prefix tokens, not longer words', async () => {
  const api = loadSkuModules({ products: [product('p', [variant('a', 'OLDER-X'), variant('b', 'OLD-Y')])] });
  const result = await api.reprefixSKUs({ oldPrefix: 'OLD', newPrefix: 'WD' });
  assert.deepEqual(plain(result.updated[0].variants.map(v => v.newSku)), ['OLDER-X', 'WD-Y']);
  assert.equal(api.requests.filter(r => r.method === 'PATCH').length, 0);
});

test('reprefix rejects collisions with catalog SKUs before writing the product', async () => {
  const api = loadSkuModules({ products: [product('p', [variant('a', 'OLD-X')]), product('q', [variant('b', 'wd-x')])] });
  const result = await api.reprefixSKUs({ oldPrefix: 'OLD', newPrefix: 'WD', dryRun: false });
  assert.equal(result.updated.length, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].error, /collision/i);
  assert.equal(api.requests.filter(r => r.method === 'PATCH').length, 0);
});

test('reprefix reserves pending dry-run SKUs across products', async () => {
  const api = loadSkuModules({ products: [product('p', [variant('a', 'OLD-X')]), product('q', [variant('b', 'OLD-X')])] });
  const result = await api.reprefixSKUs({ oldPrefix: 'OLD', newPrefix: 'WD' });
  assert.equal(result.updated.length, 1);
  assert.equal(result.errors.length, 1);
  assert.equal(api.requests.filter(r => r.method === 'PATCH').length, 0);
});

test('SKU patch keeps variant identities, complete options, prices and writable metadata', async () => {
  const p = product('p', [
    { ...variant('a', 'OLD'), barcode: '12345', revenueDetails: { cost: { amount: '4.00' } }, physicalProperties: { weight: 0.5 }, digitalProperties: { digitalFile: { id: 'file-1' } } },
    variant('b', 'KEEP'),
  ]);
  p.options = [{ id: 'o1', name: 'Size', optionRenderType: 'TEXT_CHOICES', choicesSettings: { choices: [{ choiceId: 's', name: 'Small' }, { choiceId: 'l', name: 'Large' }] } }];
  p.variantsInfo.variants[0].choices = [{ optionChoiceIds: { optionId: 'o1', choiceId: 's' } }];
  p.variantsInfo.variants[1].choices = [{ optionChoiceIds: { optionId: 'o1', choiceId: 'l' } }];
  const api = loadSkuModules({ products: [p] });
  await api.setVariantSkus('p', (_, index) => index === 0 ? 'NEW' : null, false);
  const patch = api.requests.find(r => r.method === 'PATCH');
  assert.deepEqual(patch.body.product, { id: 'p', revision: '7', options: p.options, variantsInfo: { variants: [{ ...p.variantsInfo.variants[0], sku: 'NEW' }, p.variantsInfo.variants[1]] } });
  assert.equal(patch.headers['wix-site-id'], 'c17b0e20-d96d-4fa1-b05c-bc97c04b4ac5');
  assert.equal(patch.headers.Authorization, 'test-key');
});

for (const secret of ['', '   ', new Error('secret missing')]) {
  test(`missing secret fails closed before network (${String(secret)})`, async () => {
    const api = loadSkuModules({ secret });
    await assert.rejects(api.listProducts(), /secret|API key/i);
    assert.equal(api.requests.length, 0);
  });
}

test('catalog scan follows cursor pagination', async () => {
  const api = loadSkuModules({ pages: [
    { products: [{ id: 'first' }], pagingMetadata: { hasNext: true, cursors: { next: 'next-page' } } },
    { products: [{ id: 'last' }], pagingMetadata: { hasNext: false } },
  ] });
  assert.deepEqual(plain(await api.listProducts({ limit: 2 })), [{ id: 'first' }, { id: 'last' }]);
  assert.deepEqual(api.requests[1].body.search.cursorPaging, { limit: 2, cursor: 'next-page' });
});

test('incomplete pagination fails closed rather than omitting collision candidates', async () => {
  const api = loadSkuModules({ pages: [{ products: [], pagingMetadata: { hasNext: true } }] });
  await assert.rejects(api.listProducts(), /cursor|pagination/i);
});

for (const dryRun of [null, 0, '', undefined, true, 'false', false]) {
  for (const operation of ['assignSkusToAllProducts', 'assignMissingSKUs', 'reprefixSKUs', 'setVariantSkus']) {
    test(`${operation} writes only for literal false (${JSON.stringify(dryRun)})`, async () => {
      const initialSku = operation === 'reprefixSKUs' ? 'OLD-X' : '';
      const api = loadSkuModules({ products: [product('p', [variant('a', initialSku)])] });
      const result = operation === 'setVariantSkus'
        ? await api.setVariantSkus('p', () => 'NEW-X', dryRun)
        : await api[operation]({ dryRun, oldPrefix: 'OLD', newPrefix: 'NEW' });
      const expectedDryRun = dryRun !== false;
      assert.equal(result.dryRun, expectedDryRun);
      assert.equal(api.requests.filter(r => r.method === 'PATCH').length, expectedDryRun ? 0 : 1);
      if (result.summary) assert.equal(result.summary.includes('DRY RUN'), expectedDryRun);
    });
  }
}
