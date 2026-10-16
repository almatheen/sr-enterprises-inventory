/**
 * Creates an additional user. ROLE is ADMIN or STAFF (default STAFF).
 *   USER_NAME="Counter 1" USER_EMAIL="staff@example.com" USER_PASSWORD="StrongPass#123" USER_ROLE=STAFF npm run create-user
 */
import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
async function main() {
  const email = process.env.USER_EMAIL?.trim().toLowerCase();
  const password = process.env.USER_PASSWORD;
  if (!email || !password || password.length < 10) throw new Error('Set USER_EMAIL and USER_PASSWORD (min 10 characters).');
  const role = (process.env.USER_ROLE === 'ADMIN' ? 'ADMIN' : 'STAFF') as Role;
  await prisma.user.create({ data: { name: process.env.USER_NAME?.trim() || email, email, passwordHash: await bcrypt.hash(password, 12), role } });
  console.log(`User created: ${email} (${role})`);
}
main().catch((e) => { console.error(e.message); process.exit(1); }).finally(() => prisma.$disconnect());
