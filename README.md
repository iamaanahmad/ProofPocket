# ProofPocket

**A private pay ledger for people paid by the shift.** Record agreed hours, rates, notes, and partial payments. See what remains unpaid, then prepare a client-specific packet that explains the gap.

ProofPocket is a React Native app built with Expo for the RevenueCat Shipaton 2026. The core ledger works offline and stores records on the device. No account or server is needed. The optional Plus path uses the RevenueCat SDK to unlock monthly PDF exports in an installed app.

## Why this exists

People doing short jobs often track promised pay in chat threads and received pay in another app. A missing or partial payment is difficult to explain later. ProofPocket joins the agreed terms, payment history, and outstanding amount in one private record. Its client packet is a clear summary to review before sharing. It is a personal log, not legal proof of a contract.

## What works

- Record a shift with date, client, hours, hourly rate, money already received, and notes.
- Add dated partial payments and references. Reject payments that exceed the unpaid amount.
- See promised, received, and unpaid totals and a payment timeline.
- Select a client and export an itemized pay packet with totals and notes. Native builds create a PDF. The web preview opens printable HTML.
- Share a CSV copy of the ledger. Exported text escapes spreadsheet formulas and HTML markup.
- See monthly totals across clients. Plus gates monthly PDF export while the main ledger and client packets stay free.
- Save records on the device and recover them after restart. Corrupt stored data is not overwritten.
- Remove a shift with confirmation.

## Try the project

```bash
cd proofpocket
npm ci
npm run web
```

Open the local address shown by Expo. To test the core path: record an eight-hour shift at ₹500 per hour, with ₹1,500 already received. Add a ₹900 payment. The ledger should show ₹1,600 still owed. Open **Packet**, select the client, and prepare its pay packet. Restart the app to confirm the record remains.

For iOS or Android, use an Expo development build. The web preview does not run store purchases. No purchase or payment is simulated.

## RevenueCat setup

The app uses `react-native-purchases`. To enable Plus in a native development or store build:

1. Create a RevenueCat project and connect the intended App Store or Google Play app.
2. Create a `plus` entitlement and attach a subscription product to the current offering.
3. Set the platform-specific public SDK key as `EXPO_PUBLIC_REVENUECAT_API_KEY` in the build environment. Do not use a secret API key.
4. Build and install the app with the native SDK. Test purchase and restore with store sandbox accounts before release.

The Plus screen shows **Store not connected** until a public SDK key exists. Purchase and restore call RevenueCat directly. This repository does not include store credentials or a published subscription, so those flows are not verified end to end.

## Checks

```bash
npx tsx --test tests/ledger.test.ts
npx tsc --noEmit
npx expo-doctor
npx expo export --platform web
```

The ledger tests cover partial payments, overpayment, corrupted data, totals, CSV safety, and packet escaping. The app was also walked through in a browser with a saved shift, a later payment, and an exported packet.

## Demo and entry status

- [Walkthrough video](demo.mp4)
- [Shipaton-size screenshot](shipaton-screenshot.png) (1179 × 2556)
- [Overview screenshot](overview.png)
- [Shipaton 2026 rules](https://revenuecat-shipaton-2026.devpost.com/rules)

The entrant must select the correct track and submit the project. The Next Gen track requires current student status, the specified academic email, an open-source license, a public repository, and a demo video. The main track requires a newly published store app. This source package alone does not prove either track's eligibility. No Devpost receipt or store release is claimed.

Devpost's Shipaton guide asks for the demo on public or unlisted YouTube or Vimeo. The repository video is ready for the entrant to upload; its GitHub link alone is not the required video host.

## Project map

- `App.tsx` contains the interface and offline flows.
- `ledger.ts` contains validation, pay math, export data, and packet creation.
- `purchases.ts` contains the RevenueCat setup, purchase, status, and restore calls.
- `tests/ledger.test.ts` checks the ledger rules.

The design uses a restrained navy and teal palette, one primary action per screen, and readable financial totals. Records stay local to the device unless the owner chooses to share them.

## License

License selection is pending the owner's approval. The generated Expo template license was removed because it did not grant rights to this project's original code.
