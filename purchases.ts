import { Platform } from 'react-native';
import Purchases from 'react-native-purchases';

const apiKey = process.env.EXPO_PUBLIC_REVENUECAT_API_KEY;
export const purchasesConfigured = Boolean(apiKey) && Platform.OS !== 'web';

export async function configurePurchases() {
  if (!apiKey || Platform.OS === 'web') return false;
  Purchases.configure({ apiKey });
  return true;
}

export async function getPlusStatus() {
  if (!apiKey || Platform.OS === 'web') return false;
  const info = await Purchases.getCustomerInfo();
  return Boolean(info.entitlements.active.plus);
}

export async function buyPlus() {
  if (!apiKey || Platform.OS === 'web') throw new Error('Purchases need a store build and RevenueCat key.');
  const offerings = await Purchases.getOfferings();
  const offering = offerings.current;
  if (!offering?.availablePackages.length) throw new Error('No purchase package is available yet.');
  const { customerInfo } = await Purchases.purchasePackage(offering.availablePackages[0]);
  return Boolean(customerInfo.entitlements.active.plus);
}

export async function restorePlus() {
  if (!apiKey || Platform.OS === 'web') throw new Error('Restore needs a store build and RevenueCat key.');
  const info = await Purchases.restorePurchases();
  return Boolean(info.entitlements.active.plus);
}
