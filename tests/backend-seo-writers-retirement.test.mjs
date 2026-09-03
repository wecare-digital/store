import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/backend/http-functions.js', import.meta.url), 'utf8');

assert.doesNotMatch(src, /seo-map|product-seo|applyProductSeo|buildProductSeo/, 'backend must not import custom SEO engines');
assert.doesNotMatch(src, /get_seohead|get_blogseobulk|get_blogseoclear|get_blogseoapply|get_productseo|get_schemablog|get_schemaproduct/, 'custom SEO writer/schema endpoints must be retired');
assert.doesNotMatch(src, /get_robots\s*\(|get_sitemap\s*\(|get_smindex\s*\(|get_smtxt\s*\(|pages-sitemap\.xml|store-products-sitemap\.xml|blog-posts-sitemap\.xml/, 'custom robots/sitemap surfaces must be retired in favor of Wix native sitemap');
assert.doesNotMatch(src, /ALL_PAGES|_functions\/schemablog|_functions\/schemaproduct/, 'discovery metadata must not advertise retired SEO surfaces');
assert.doesNotMatch(src, /Legal Champ|No Fault|\/legal-champ|\/no-fault/, 'retired brand names must not be advertised by backend discovery metadata');
assert.match(src, /Dastavez/);
assert.match(src, /ClearClosure/);
assert.match(src, /Elsewhere/);
assert.match(src, /\/sitemap\.xml/);
assert.match(src, /get_products\s*\(/, 'store API must be preserved');
assert.match(src, /get_orders\s*\(/, 'orders API must be preserved');
console.log('backend SEO writer retirement static checks passed');
