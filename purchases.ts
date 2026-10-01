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

export async function configurePurchases() {
  if (!purchasesConfigured || !apiKey) return false;
  Purchases.configure({ apiKey });
  return true;
}

export async function getPlusStatus() {
  if (!purchasesConfigured) return false;
  const info = await Purchases.getCustomerInfo();
  return Boolean(info.entitlements.active.plus);
}

export async function buyPlus() {
  if (!purchasesConfigured) throw new Error('Purchases need a store build and RevenueCat key.');
  const offerings = await Purchases.getOfferings();
  const offering = offerings.current;
  if (!offering?.availablePackages.length) throw new Error('No purchase package is available yet.');
  const { customerInfo } = await Purchases.purchasePackage(offering.availablePackages[0]);
  return Boolean(customerInfo.entitlements.active.plus);
}

export async function restorePlus() {
  if (!purchasesConfigured) throw new Error('Restore needs a store build and RevenueCat key.');
  const info = await Purchases.restorePurchases();
  return Boolean(info.entitlements.active.plus);
}

export async function getPlusOffer() {
  if (!purchasesConfigured) return null;
  try {
    const offerings = await Purchases.getOfferings();
    const pkg = offerings.current?.availablePackages[0];
    if (!pkg) return null;
    return { priceString: pkg.product.priceString, title: pkg.product.title };
  } catch {
    return null;
  }
}
