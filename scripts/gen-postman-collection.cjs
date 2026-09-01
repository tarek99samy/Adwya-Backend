/**
 * Builds a Postman v2.1 collection from the live OpenAPI spec.
 *
 * Written as a generator rather than hand-authored so the collection cannot
 * drift from the API: re-run it after any route change.
 */
const fs = require('fs');
const spec = require('../docs/openapi.json');

// Routes carrying @Public() - no bearer token. Everything else inherits the
// collection-level bearer auth.
const PUBLIC = new Set([
  'POST /v1/auth/signup',
  'POST /v1/auth/login',
  'POST /v1/auth/refresh',
  'POST /v1/auth/logout',
  'POST /v1/auth/verify-user',
  'POST /v1/auth/reset-password',
  'GET /v1/catalog/medicines',
  'GET /v1/catalog/medicines/{id}',
  'GET /v1/catalog/categories',
  'GET /v1/catalog/brands',
  'GET /v1/pharmacies/branches',
  'GET /v1/pharmacies/branches/{id}',
  'GET /v1/pharmacies/branches/{branchId}/reviews',
  'POST /v1/pharmacies/register',
  'POST /v1/payments/webhooks/{provider}',
  'GET /healthz',
  'GET /readyz',
  'GET /metrics',
]);

/** Permission code required on top of a valid token. */
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

/** Per-route rate limits that differ from the global 50 req/min. */
const THROTTLE = {
  'POST /v1/auth/signup': '20/min', 'POST /v1/auth/login': '20/min',
  'POST /v1/auth/refresh': '20/min', 'POST /v1/auth/logout': '20/min',
  'POST /v1/auth/verify-user': '20/min', 'POST /v1/auth/reset-password': '20/min',
  'GET /v1/auth/me': '20/min',
  'POST /v1/orders/checkout': '10/min',
  'POST /v1/orders/{id}/delivery/location': '30/min',
  'POST /v1/payments/intent': '10/min',
  'POST /v1/payments/webhooks/{provider}': '300/min',
  'POST /v1/pharmacies/register': '5/min',
};

/** Who realistically calls this - helps the reader pick a token. */
const ACTOR = {
  Auth: 'anyone', Catalog: 'anyone (public)', Pharmacies: 'anyone (public)',
  Cart: 'customer', Orders: 'customer + branch staff', Delivery: 'courier + customer',
  Payments: 'customer + branch staff', Reviews: 'customer', Notifications: 'any signed-in user',
  Prescriptions: 'pharmacist', Inventory: 'branch OWNER/MANAGER/PHARMACIST',
  Onboarding: 'pharmacy OWNER/MANAGER', AdminPharmacies: 'platform admin',
  Refunds: 'platform admin', Audit: 'platform admin', Health: 'infrastructure',
  Metrics: 'infrastructure',
};

/** Collection variables that stand in for ids you capture as you go. */
const VAR_FOR = {
  branchId: '{{branchId}}', medicineId: '{{medicineId}}', addressId: '{{addressId}}',
  paymentMethodId: '{{paymentMethodId}}', orderId: '{{orderId}}', pharmacyId: '{{pharmacyId}}',
  courierStaffId: '{{courierStaffId}}', batchId: '{{batchId}}', entityId: '{{orderId}}',
  medicineIds: '{{medicineId}}', id: '{{orderId}}',
};

const SAMPLE = {
  phone: '01001234567', ownerPhone: '01009876543', branchPhone: '0221234567',
  whatsappNumber: '01001234567', password: 'Passw0rd!', ownerPassword: 'Passw0rd!',
  newPassword: 'NewPassw0rd!', fullName: 'Mostafa Kamel', ownerName: 'Mostafa Kamel',
  email: 'customer@example.com', ownerEmail: 'owner@example.com',
  name: 'El Ezaby Pharmacy', nameAr: 'صيدلية العزبي', branchName: 'Nasr City',
  licenseNumber: 'LIC-2026-0001', taxNumber: '123-456-789',
  addressText: '14 Abbas El Akkad, Nasr City, Cairo',
  latitude: 30.0605, longitude: 31.2299, deliveryLatitude: 30.0605, deliveryLongitude: 31.2299,
  deliveryRadiusMeters: 8000, deliveryNote: 'Third floor, ring the bell twice',
  quantity: 2, countedQuantity: 37, price: 31.5, costPrice: 18.0, sellingPrice: 31.5,
  amount: 45.0, rating: 5, comment: 'Fast delivery, well packaged.',
  couponCode: 'SAVE10', reason: 'Stock-take shrinkage', note: 'Transferred at 14:00',
  notes: 'Prescription legible and valid.', cancelReason: 'Ordered by mistake',
  reference: 'IPN-8837261', batchNumber: 'B-2026-014', expiryDate: '2027-12-31',
  token: '{{resetToken}}', refreshToken: '{{refreshToken}}', accept: true,
  prescriptionImageUrls: ['https://cdn.example.com/rx/1.jpg'],
  notificationIds: ['{{notificationId}}'],
};

const deref = (schema) => {
  if (!schema) return null;
  if (schema.$ref) return spec.components.schemas[schema.$ref.split('/').pop()];
  return schema;
};

function exampleFor(key, prop) {
  if (prop.enum) return prop.enum[0];
  if (SAMPLE[key] !== undefined) return SAMPLE[key];
  if (VAR_FOR[key]) return VAR_FOR[key];
  if (key.endsWith('Id')) return VAR_FOR[key] || `{{${key}}}`;
  switch (prop.type) {
    case 'number':
    case 'integer':
      return 1;
    case 'boolean':
      return true;
    case 'array':
      return [];
    default:
      return 'string';
  }
}

function bodyFor(op) {
  const schema = deref(op.requestBody?.content?.['application/json']?.schema);
  if (!schema || !schema.properties) return null;
  const required = new Set(schema.required || []);
  const out = {};
  // Required first, then optionals - so the reader sees the minimum payload at
  // the top of the body and can delete the rest.
  for (const [k, v] of Object.entries(schema.properties)) if (required.has(k)) out[k] = exampleFor(k, v);
  for (const [k, v] of Object.entries(schema.properties)) if (!required.has(k)) out[k] = exampleFor(k, v);
  return out;
}

function describe(key, op) {
  const lines = [];
  if (op.summary) lines.push(op.summary.trim());
  if (op.description && op.description.trim() !== (op.summary || '').trim()) {
    lines.push('', op.description.trim());
  }
  lines.push('');
  lines.push(PUBLIC.has(key) ? '**Auth:** public — no token needed.' : '**Auth:** bearer token required.');
  if (PERMISSIONS[key]) lines.push(`**Permission:** \`${PERMISSIONS[key]}\``);
  if (THROTTLE[key]) lines.push(`**Rate limit:** ${THROTTLE[key]} per IP (global default is 50/min).`);

  const schema = deref(op.requestBody?.content?.['application/json']?.schema);
  if (schema?.properties) {
    lines.push('', '**Body fields**', '', '| Field | Type | Required |', '| --- | --- | --- |');
    const required = new Set(schema.required || []);
    for (const [k, v] of Object.entries(schema.properties)) {
      const t = v.enum ? `enum: ${v.enum.join(' \\| ')}` : v.type === 'array' ? `${v.items?.type || 'object'}[]` : v.type || 'object';
      lines.push(`| \`${k}\` | ${t} | ${required.has(k) ? 'yes' : 'no'} |`);
    }
  }
  return lines.join('\n');
}

// Tokens are captured automatically so the rest of the collection just works.
const CAPTURE = `const b = pm.response.json();
if (b.accessToken) pm.collectionVariables.set('accessToken', b.accessToken);
if (b.refreshToken) pm.collectionVariables.set('refreshToken', b.refreshToken);
if (b.user && b.user.id) pm.collectionVariables.set('userId', b.user.id);
pm.test('authenticated', () => pm.expect(pm.response.code).to.be.oneOf([200, 201]));`;

const CAPTURE_ORDER = `const b = pm.response.json();
if (b.id) pm.collectionVariables.set('orderId', b.id);
pm.test('order created', () => pm.expect(pm.response.code).to.eql(201));`;

const folders = new Map();

for (const [path, item] of Object.entries(spec.paths)) {
  for (const [method, op] of Object.entries(item)) {
    const key = `${method.toUpperCase()} ${path}`;
    const tag = (op.tags && op.tags[0]) || 'Other';
    if (!folders.has(tag)) folders.set(tag, []);

    const segments = path.split('/').filter(Boolean);
    const variables = [];
    const rendered = segments.map((seg) => {
      const m = seg.match(/^\{(.+)\}$/);
      if (!m) return seg;
      const name = m[1];
      variables.push({
        key: name,
        value: (VAR_FOR[name] || `{{${name}}}`).replace(/[{}]/g, '') ? VAR_FOR[name] || `{{${name}}}` : '',
        description: `Path parameter: ${name}`,
      });
      return `:${name}`;
    });

    const query = (op.parameters || [])
      .filter((p) => p.in === 'query')
      .map((p) => ({
        key: p.name,
        value: p.schema?.enum ? String(p.schema.enum[0]) : p.schema?.type === 'number' ? '1' : '',
        description: `${p.schema?.enum ? `one of: ${p.schema.enum.join(', ')}` : p.schema?.type || 'string'}${p.required ? ' (required)' : ''}`,
        disabled: !p.required,
      }));

    const body = bodyFor(op);
    const request = {
      method: method.toUpperCase(),
      header: body ? [{ key: 'Content-Type', value: 'application/json' }] : [],
      url: {
        raw: `{{baseUrl}}/${rendered.join('/')}${query.length ? '?' + query.filter((q) => !q.disabled).map((q) => `${q.key}=${q.value}`).join('&') : ''}`,
        host: ['{{baseUrl}}'],
        path: rendered,
        ...(query.length ? { query } : {}),
        ...(variables.length ? { variable: variables } : {}),
      },
      description: describe(key, op),
    };
    if (body) request.body = { mode: 'raw', raw: JSON.stringify(body, null, 2), options: { raw: { language: 'json' } } };
    if (PUBLIC.has(key)) request.auth = { type: 'noauth' };

    const entry = {
      name: `${op.summary ? op.summary.split('\n')[0].slice(0, 58) : `${method.toUpperCase()} ${path.split('/').slice(2).join('/') || path}`}`,
      request,
      response: [],
    };
    // Disambiguate: several operations share a summary-less path.
    entry.name = `${method.toUpperCase()} /${rendered.join('/')}`;

    const isAuthToken = ['POST /v1/auth/login', 'POST /v1/auth/signup', 'POST /v1/auth/refresh'].includes(key);
    if (isAuthToken) entry.event = [{ listen: 'test', script: { type: 'text/javascript', exec: CAPTURE.split('\n') } }];
    if (key === 'POST /v1/orders/checkout') entry.event = [{ listen: 'test', script: { type: 'text/javascript', exec: CAPTURE_ORDER.split('\n') } }];

    folders.get(tag).push(entry);
  }
}

const ORDER = ['Health', 'Auth', 'Catalog', 'Pharmacies', 'Cart', 'Orders', 'Prescriptions',
  'Delivery', 'Payments', 'Reviews', 'Notifications', 'Inventory', 'Onboarding',
  'AdminPharmacies', 'Refunds', 'Audit', 'Metrics'];

const items = [...folders.entries()]
  .sort((a, b) => {
    const ia = ORDER.indexOf(a[0]), ib = ORDER.indexOf(b[0]);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  })
  .map(([tag, reqs]) => ({
    name: tag,
    description: `Caller: ${ACTOR[tag] || 'see each request'}`,
    item: reqs.sort((a, b) => a.name.localeCompare(b.name)),
  }));

const collection = {
  info: {
    _postman_id: 'adwya-backend-v1',
    name: 'Adwya API (v1)',
    description: [
      '# Adwya API',
      '',
      'Pharmacy-delivery marketplace backend. Every endpoint below is generated',
      'from the live OpenAPI spec, so it matches the running server exactly.',
      '',
      '## Getting started',
      '',
      '1. Select the **Adwya - Local** environment (or set `baseUrl` yourself).',
      '2. Run **Auth / POST /v1/auth/signup** or **login**. The access and refresh',
      '   tokens are captured into collection variables automatically - every other',
      '   request picks them up.',
      '3. Browse **Catalog** for medicines, add one to the **Cart**, then',
      '   **Orders / POST /v1/orders/checkout**. Checkout stores `orderId` for you.',
      '',
      '## Conventions',
      '',
      '- All product endpoints are under `/v1`. `/healthz`, `/readyz` and `/metrics`',
      '  are deliberately unversioned.',
      '- Access tokens last 15 minutes; refresh tokens 14 days and rotate on use.',
      '- List endpoints return `{ data, meta: { total, page, limit } }`.',
      '- Errors return `{ statusCode, timestamp, path, error }` - see docs/API_ERRORS.md.',
      '- Unknown body fields are rejected with 400, not ignored.',
    ].join('\n'),
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{accessToken}}', type: 'string' }] },
  item: items,
  variable: [
    { key: 'baseUrl', value: 'http://localhost:3000', description: 'Server root. Product routes live under /v1.' },
    { key: 'accessToken', value: '', description: 'Set automatically by login/signup/refresh.' },
    { key: 'refreshToken', value: '', description: 'Set automatically by login/signup.' },
    { key: 'userId', value: '', description: 'Set automatically by login/signup.' },
    { key: 'orderId', value: '', description: 'Set automatically by checkout.' },
    { key: 'branchId', value: '', description: 'From GET /v1/pharmacies/branches.' },
    { key: 'medicineId', value: '', description: 'From GET /v1/catalog/medicines.' },
    { key: 'addressId', value: '', description: 'The customer address to deliver to.' },
    { key: 'paymentMethodId', value: '', description: 'From the payment methods reference data.' },
    { key: 'pharmacyId', value: '', description: 'Owning pharmacy of a branch.' },
    { key: 'courierStaffId', value: '', description: 'PharmacyStaff id with role COURIER.' },
    { key: 'batchId', value: '', description: 'Warehouse batch being transferred.' },
    { key: 'notificationId', value: '', description: 'From GET /v1/notifications.' },
    { key: 'resetToken', value: '', description: 'From POST /v1/auth/verify-user.' },
  ],
};

fs.writeFileSync('docs/adwya-api.postman_collection.json', JSON.stringify(collection, null, 2) + '\n');

const env = {
  id: 'adwya-local-env',
  name: 'Adwya - Local',
  values: [
    { key: 'baseUrl', value: 'http://localhost:3000', type: 'default', enabled: true },
  ],
  _postman_variable_scope: 'environment',
};
fs.writeFileSync('docs/adwya-local.postman_environment.json', JSON.stringify(env, null, 2) + '\n');

const count = items.reduce((n, f) => n + f.item.length, 0);
console.log(`collection: ${items.length} folders, ${count} requests`);
console.log(`public: ${PUBLIC.size}, permission-gated: ${Object.keys(PERMISSIONS).length}`);
