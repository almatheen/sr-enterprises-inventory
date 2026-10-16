/**
 * Creates the first administrator (and the Business configuration row).
 * Usage:
 *   ADMIN_NAME="Owner" ADMIN_EMAIL="owner@example.com" ADMIN_PASSWORD="StrongPass#123" npm run create-admin
 * Contains no business data – products, clients and invoices are never created by this script.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const name = process.env.ADMIN_NAME?.trim() || 'Administrator';
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD (and optionally ADMIN_NAME).');
  if (password.length < 10) throw new Error('ADMIN_PASSWORD must be at least 10 characters.');
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) throw new Error(`A user with e-mail ${email} already exists.`);
  await prisma.user.create({ data: { name, email, passwordHash: await bcrypt.hash(password, 12), role: 'ADMIN' } });
  await prisma.business.upsert({ where: { id: 'business' }, create: { id: 'business' }, update: {} });
  console.log(`Administrator created: ${email}`);
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
