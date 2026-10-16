import { prisma } from './db/prisma';
import type { BusinessDTO } from './types';

export async function getBusiness(): Promise<BusinessDTO> {
  // Structural configuration row; created on first access with neutral defaults (no business data).
  const b = await prisma.business.upsert({ where: { id: 'business' }, create: { id: 'business' }, update: {} });
  return {
    name: b.name,
    tagline: b.tagline,
    address: b.address,
    phone: b.phone,
    email: b.email,
    gstin: b.gstin,
    state: b.state,
    pincode: b.pincode,
    logo: b.logo,
    invoicePrefix: b.invoicePrefix,
    lowStockThreshold: b.lowStockThreshold
  };
}
