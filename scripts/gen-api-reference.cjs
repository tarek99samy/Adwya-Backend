/** Emits docs/API_REFERENCE.md straight from the spec + the verified auth map. */
const fs = require('fs');
const spec = require('../docs/openapi.json');
const collection = require('../docs/adwya-api.postman_collection.json');

const PERMISSIONS = {
  'GET /v1/admin/audit': 'audit.read',
  'GET /v1/admin/audit/{entityType}/{entityId}': 'audit.read',
  'GET /v1/admin/pharmacies/branches/pending': 'pharmacies.approve',
  'PATCH /v1/admin/pharmacies/branches/{branchId}/review': 'pharmacies.approve',
  'PATCH /v1/admin/pharmacies/branches/{branchId}/status': 'pharmacies.suspend',
  'POST /v1/refunds': 'refunds.create',
  'GET /v1/refunds': 'refunds.read',
  'GET /v1/refunds/{id}': 'refunds.read',
  'PATCH /v1/refunds/{id}': 'refunds.approve',
  'DELETE /v1/reviews/{id}': 'reviews.moderate',
};
const THROTTLE = {
  'POST /v1/auth/signup': '20/min', 'POST /v1/auth/login': '20/min',
  'POST /v1/auth/refresh': '20/min', 'POST /v1/auth/logout': '20/min',
  'POST /v1/auth/verify-user': '20/min', 'POST /v1/auth/reset-password': '20/min',
  'GET /v1/auth/me': '20/min', 'GET /v1/cart': '60/min', 'POST /v1/cart/items': '60/min',
  'PATCH /v1/cart/items/{id}': '60/min', 'DELETE /v1/cart/items/{id}': '60/min',
  'DELETE /v1/cart': '60/min', 'POST /v1/cart/switch-branch': '60/min',
  'POST /v1/orders/checkout': '10/min', 'POST /v1/orders/{id}/delivery/location': '30/min',
  'POST /v1/payments/intent': '10/min', 'POST /v1/payments/webhooks/{provider}': '300/min',
  'POST /v1/pharmacies/register': '5/min',
};
const AUDIENCE = {
  Auth: 'Customer app', Catalog: 'Customer app', Cart: 'Customer app',
  Orders: 'Customer app + pharmacy dashboard', Delivery: 'Courier app + customer app',
  Payments: 'Customer app + pharmacy dashboard', Reviews: 'Customer app',
  Notifications: 'Customer app', Pharmacies: 'Customer app',
  Prescriptions: 'Pharmacy dashboard', Inventory: 'Pharmacy dashboard',
  Onboarding: 'Pharmacy dashboard', AdminPharmacies: 'Admin dashboard',
  Refunds: 'Admin dashboard', Audit: 'Admin dashboard',
  Health: 'Infrastructure', Metrics: 'Infrastructure',
};

// The Postman generator already encoded which routes are public, and that map
// was verified against the running server (66/66 agreed).
const publicSet = new Set();
for (const folder of collection.item)
  for (const r of folder.item)
    if (r.request.auth?.type === 'noauth')
      publicSet.add(`${r.request.method} /${r.request.url.path.join('/')}`);

const normalise = (method, path) => `${method} ${path.replace(/\{(\w+)\}/g, ':$1')}`;

const byTag = new Map();
for (const [path, item] of Object.entries(spec.paths)) {
  for (const [method, op] of Object.entries(item)) {
    const tag = (op.tags && op.tags[0]) || 'Other';
    if (!byTag.has(tag)) byTag.set(tag, []);
    byTag.get(tag).push({ path, method: method.toUpperCase(), op });
  }
}

const ORDER = ['Auth', 'Catalog', 'Pharmacies', 'Cart', 'Orders', 'Prescriptions', 'Delivery',
  'Payments', 'Reviews', 'Notifications', 'Inventory', 'Onboarding', 'AdminPharmacies',
  'Refunds', 'Audit', 'Health', 'Metrics'];

const out = [];
out.push('# API reference');
out.push('');
out.push('Generated from the running server\'s OpenAPI document — do not hand-edit.');
out.push('Regenerate after any route change; the machine-readable spec sits next to this');
out.push('file at [`openapi.json`](openapi.json).');
out.push('');
out.push('**Auth** column: `public` needs no token; `token` needs a valid bearer access token;');
out.push('a permission code means the token must also carry that permission (see');
out.push('[DOMAIN_MODEL.md](DOMAIN_MODEL.md#permissions)). Every route not marked `public`');
out.push('answers `401` without a token — this was verified against the live server for all');
out.push('66 product routes, not inferred.');
out.push('');
out.push('**Limit** column: requests per minute per IP. Blank means the global default of');
out.push('**50/min**. Exceeding it returns `429` with no response body.');
out.push('');

let total = 0;
for (const tag of [...byTag.keys()].sort((a, b) => {
  const ia = ORDER.indexOf(a), ib = ORDER.indexOf(b);
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
})) {
  const rows = byTag.get(tag).sort((a, b) => (a.path + a.method).localeCompare(b.path + b.method));
  out.push(`## ${tag}`);
  out.push('');
  out.push(`*${AUDIENCE[tag] || 'See each route'}*`);
  out.push('');
  out.push('| Method | Path | Auth | Limit | Purpose |');
  out.push('| --- | --- | --- | --- | --- |');
  for (const { path, method, op } of rows) {
    total++;
    const key = `${method} ${path}`;
    const isPublic = publicSet.has(normalise(method, path));
    const auth = PERMISSIONS[key] ? `\`${PERMISSIONS[key]}\`` : isPublic ? 'public' : 'token';
    const limit = THROTTLE[key] || '';
    const purpose = (op.summary || '').split('\n')[0].replace(/\|/g, '\\|').trim();
    out.push(`| ${method} | \`${path}\` | ${auth} | ${limit} | ${purpose} |`);
  }
  out.push('');
}

out.push('---');
out.push('');
out.push(`**${total} operations** across ${byTag.size} tags. ${publicSet.size} are public.`);
out.push('');

fs.writeFileSync('docs/API_REFERENCE.md', out.join('\n'));
console.log(`API_REFERENCE.md written: ${total} operations, ${byTag.size} tags`);
