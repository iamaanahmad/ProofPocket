import { Platform } from 'react-native';

// The native RevenueCat module does not exist in Expo Go, where a static
// import would crash the whole app. Load it lazily so the ledger, timer and
// payout check still run there with the paywall in honest preview mode.
// Development and store builds load the real SDK and behave as before.
declare const require: (id: string) => any;
let Purchases: any = null;
try { Purchases = require('react-native-purchases').default ?? null; } catch { Purchases = null; }

const apiKey = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY;
export const purchasesConfigured = Boolean(apiKey) && Platform.OS !== 'web' && Boolean(Purchases);

// The entitlement configured in the RevenueCat dashboard for this project.
export const ENTITLEMENT_ID = 'proofpocket';

function hasPlus(info: any) {
  return Boolean(info?.entitlements?.active?.[ENTITLEMENT_ID]);
}

export async function configurePurchases() {
  if (!purchasesConfigured || !apiKey) return false;
  Purchases.configure({ apiKey });
  return true;
}

export async function getPlusStatus() {
  if (!purchasesConfigured) return false;
  const info = await Purchases.getCustomerInfo();
  return hasPlus(info);
}

export async function buyPlus(packageIdentifier?: string) {
  if (!purchasesConfigured) throw new Error('Purchases need a store build and RevenueCat key.');
  const offerings = await Purchases.getOfferings();
  const packages = offerings.current?.availablePackages ?? [];
  if (!packages.length) throw new Error('No purchase package is available yet.');
  const chosen = packages.find((p: any) => p.identifier === packageIdentifier) ?? packages[0];
  const { customerInfo } = await Purchases.purchasePackage(chosen);
  return hasPlus(customerInfo);
}

export async function restorePlus() {
  if (!purchasesConfigured) throw new Error('Restore needs a store build and RevenueCat key.');
  const info = await Purchases.restorePurchases();
  return hasPlus(info);
}

export interface PlusPackage { identifier: string; label: string; priceString: string; }

const PLAN_ORDER: Record<string, number> = { MONTHLY: 0, ANNUAL: 1, LIFETIME: 2 };
const PLAN_LABEL: Record<string, string> = { MONTHLY: 'Monthly', ANNUAL: 'Yearly', LIFETIME: 'Lifetime' };

export async function getPlusPackages(): Promise<PlusPackage[]> {
  if (!purchasesConfigured) return [];
  try {
    const offerings = await Purchases.getOfferings();
    const packages = offerings.current?.availablePackages ?? [];
    return packages
      .map((p: any) => ({
        identifier: String(p.identifier),
        label: PLAN_LABEL[p.packageType] ?? (p.product?.title || 'Plan'),
        priceString: String(p.product?.priceString ?? ''),
        order: PLAN_ORDER[p.packageType] ?? 3,
      }))
      .sort((a: any, b: any) => a.order - b.order)
      .map(({ identifier, label, priceString }: any) => ({ identifier, label, priceString }));
  } catch {
    return [];
  }
}
