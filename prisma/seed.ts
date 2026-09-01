/**
 * Idempotent reference-data seed.
 *
 * Run with `npm run prisma:seed`. Safe to re-run: everything is an upsert keyed
 * on a natural unique column, so it converges rather than duplicating.
 *
 * This seeds only platform reference data — permissions, profiles, payment
 * methods, notification templates. It does NOT create pharmacies, medicines or
 * customers; those come from real onboarding.
 */
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

/**
 * Every permission code the guards reference. Keep this list in sync with the
 * `@RequiredPermissions(...)` decorators — a code that exists in a decorator
 * but not here means that route 403s for everyone, forever.
 */
const PERMISSIONS: { code: string; description: string }[] = [
  // Catalog administration
  { code: 'catalog.create', description: 'Create medicines, brands, categories, manufacturers' },
  { code: 'catalog.update', description: 'Edit catalog entries' },
  { code: 'catalog.delete', description: 'Soft-delete catalog entries' },

  // Pharmacy lifecycle
  { code: 'pharmacies.approve', description: 'Approve or reject branch applications' },
  { code: 'pharmacies.suspend', description: 'Suspend or reinstate an approved branch' },
  { code: 'pharmacies.read', description: 'Read any pharmacy or branch record' },

  // Orders (platform-wide view, distinct from a branch reading its own queue)
  { code: 'orders.read', description: 'Read any order across the platform' },
  { code: 'orders.cancel', description: 'Cancel any order as platform support' },

  // Payments and refunds
  { code: 'payments.read', description: 'Read any payment or transaction' },
  { code: 'refunds.create', description: 'Raise a refund against an order' },
  { code: 'refunds.read', description: 'Read refund records' },
  { code: 'refunds.approve', description: 'Approve, reject or complete a refund' },

  // Promotions
  { code: 'promotions.manage', description: 'Manage coupons, campaigns and promotions' },

  // Users and access control
  { code: 'users.read', description: 'Read user accounts' },
  { code: 'users.update', description: 'Edit user accounts, activate or deactivate' },
  { code: 'rbac.manage', description: 'Manage profiles, permissions and assignments' },

  // Observability
  { code: 'audit.read', description: 'Read the audit log' },
  { code: 'reviews.moderate', description: 'Hide or remove customer reviews' },
];

/**
 * Profiles bundle permissions. `ADMIN` gets everything; the narrower profiles
 * exist so day-to-day staff are not handed full platform access — the whole
 * point of having RBAC rather than a boolean isAdmin.
 */
const PROFILES: { name: string; description: string; permissions: string[] | '*' }[] = [
  {
    name: 'ADMIN',
    description: 'Full platform administration',
    permissions: '*',
  },
  {
    name: 'SUPPORT',
    description: 'Customer support: read orders and payments, raise refunds, cannot approve them',
    permissions: [
      'orders.read',
      'orders.cancel',
      'payments.read',
      'refunds.create',
      'refunds.read',
      'users.read',
      'pharmacies.read',
    ],
  },
  {
    name: 'FINANCE',
    description: 'Approves and completes refunds; reads payments',
    permissions: ['payments.read', 'refunds.read', 'refunds.approve', 'orders.read', 'audit.read'],
  },
  {
    name: 'COMPLIANCE',
    description: 'Reviews pharmacy applications and moderates content',
    permissions: [
      'pharmacies.approve',
      'pharmacies.suspend',
      'pharmacies.read',
      'reviews.moderate',
      'audit.read',
    ],
  },
  {
    name: 'CATALOG_MANAGER',
    description: 'Maintains the medicine catalog and promotions',
    permissions: ['catalog.create', 'catalog.update', 'catalog.delete', 'promotions.manage'],
  },
];

/** MVP rails. Card providers exist but stay inactive until credentials land. */
const PAYMENT_METHODS = [
  { code: 'CASH', name: 'Cash on delivery', isActive: true, sortOrder: 1 },
  { code: 'VISA_ON_DELIVERY', name: 'Card on delivery', isActive: true, sortOrder: 2 },
  { code: 'INSTAPAY', name: 'InstaPay transfer', isActive: true, sortOrder: 3 },
  { code: 'PAYMOB_CARD', name: 'Credit / debit card', isActive: false, sortOrder: 4 },
  { code: 'PAYMOB_WALLET', name: 'Mobile wallet', isActive: false, sortOrder: 5 },
];

/**
 * Message bodies use `{{placeholder}}` substitution filled by the notification
 * service (Phase 4.1, Firebase). Seeded now so the templates exist before the
 * sender does.
 */
const NOTIFICATION_TEMPLATES = [
  {
    code: 'ORDER_PLACED',
    channel: 'PUSH' as const,
    titleTemplate: 'Order {{orderNumber}} received',
    bodyTemplate: 'We sent your order to {{branchName}}. We will confirm shortly.',
  },
  {
    code: 'ORDER_CONFIRMED',
    channel: 'PUSH' as const,
    titleTemplate: 'Order {{orderNumber}} confirmed',
    bodyTemplate: '{{branchName}} is preparing your order.',
  },
  {
    code: 'ORDER_OUT_FOR_DELIVERY',
    channel: 'PUSH' as const,
    titleTemplate: 'On the way',
    bodyTemplate: '{{courierName}} is bringing order {{orderNumber}} to you.',
  },
  {
    code: 'ORDER_DELIVERED',
    channel: 'PUSH' as const,
    titleTemplate: 'Delivered',
    bodyTemplate: 'Order {{orderNumber}} was delivered. Tap to rate your experience.',
  },
  {
    code: 'ORDER_CANCELLED',
    channel: 'PUSH' as const,
    titleTemplate: 'Order {{orderNumber}} cancelled',
    bodyTemplate: '{{reason}}',
  },
  {
    code: 'PRESCRIPTION_APPROVED',
    channel: 'PUSH' as const,
    titleTemplate: 'Prescription approved',
    bodyTemplate: 'The pharmacist approved your prescription for order {{orderNumber}}.',
  },
  {
    code: 'PRESCRIPTION_REJECTED',
    channel: 'PUSH' as const,
    titleTemplate: 'Prescription needs attention',
    bodyTemplate: 'Order {{orderNumber}} was rejected: {{reason}}',
  },
  {
    code: 'PAYMENT_RECEIVED',
    channel: 'PUSH' as const,
    titleTemplate: 'Payment received',
    bodyTemplate: 'We received {{amount}} EGP for order {{orderNumber}}.',
  },
];

async function main() {
  console.log('Seeding reference data...');

  // --- permissions -------------------------------------------------------
  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: permission.code },
      create: permission,
      update: { description: permission.description },
    });
  }
  console.log(`  permissions          ${PERMISSIONS.length}`);

  const allPermissions = await prisma.permission.findMany();
  const byCode = new Map(allPermissions.map((p) => [p.code, p]));

  // --- profiles ----------------------------------------------------------
  for (const profile of PROFILES) {
    const row = await prisma.profile.upsert({
      where: { name: profile.name },
      create: { name: profile.name, description: profile.description },
      update: { description: profile.description },
    });

    const codes = profile.permissions === '*' ? PERMISSIONS.map((p) => p.code) : profile.permissions;

    // Replace the grant set so removing a code from this file actually revokes
    // it, rather than leaving a stale grant behind.
    await prisma.profilePermission.deleteMany({ where: { profileId: row.id } });
    await prisma.profilePermission.createMany({
      data: codes
        .map((code) => byCode.get(code))
        .filter((p): p is NonNullable<typeof p> => Boolean(p))
        .map((p) => ({ profileId: row.id, permissionId: p.id })),
      skipDuplicates: true,
    });

    console.log(`  profile ${profile.name.padEnd(16)} ${codes.length} permission(s)`);
  }

  // --- payment methods ---------------------------------------------------
  for (const method of PAYMENT_METHODS) {
    await prisma.paymentMethod.upsert({
      where: { code: method.code },
      create: method,
      update: { name: method.name, isActive: method.isActive, sortOrder: method.sortOrder },
    });
  }
  console.log(`  payment methods      ${PAYMENT_METHODS.length}`);

  // --- notification templates -------------------------------------------
  for (const template of NOTIFICATION_TEMPLATES) {
    await prisma.notificationTemplate.upsert({
      where: { code: template.code },
      create: template,
      update: {
        channel: template.channel,
        titleTemplate: template.titleTemplate,
        bodyTemplate: template.bodyTemplate,
      },
    });
  }
  console.log(`  notification templates ${NOTIFICATION_TEMPLATES.length}`);

  // --- bootstrap admin ---------------------------------------------------
  // Only when explicitly asked for, so a production seed never silently mints
  // an account with full platform access.
  const adminPhone = process.env.SEED_ADMIN_PHONE;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;

  if (adminPhone && adminPassword) {
    const adminProfile = await prisma.profile.findUnique({ where: { name: 'ADMIN' } });
    const admin = await prisma.user.upsert({
      where: { phone: adminPhone },
      create: {
        phone: adminPhone,
        fullName: 'Platform Admin',
        passwordHash: await bcrypt.hash(adminPassword, 10),
        userType: 'ADMIN',
        isActive: true,
      },
      update: { userType: 'ADMIN', isActive: true },
    });

    if (adminProfile) {
      await prisma.userProfile.upsert({
        where: { userId_profileId: { userId: admin.id, profileId: adminProfile.id } },
        create: { userId: admin.id, profileId: adminProfile.id },
        update: {},
      });
    }
    console.log(`  bootstrap admin      ${adminPhone}`);
  } else {
    console.log('  bootstrap admin      skipped (set SEED_ADMIN_PHONE + SEED_ADMIN_PASSWORD)');
  }

  console.log('Seed complete.');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
