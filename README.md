# ProofPocket

**A private pay ledger for people paid by the shift.** Log work by the hour, task or day, record what actually landed, and see the gap in red: *You logged 11.5 hours. They paid you for 8. ₹630 missing.* Then prepare a client-specific evidence packet that explains the shortfall.

ProofPocket is a React Native app built with Expo for the RevenueCat Shipaton 2026. The core ledger works fully offline and stores records on the device. No account or server is needed. The optional Plus path uses the RevenueCat SDK to unlock PDF evidence packets and monthly PDF reports in an installed app.

## Why this exists

People doing short jobs often track promised pay in chat threads and received pay in another app. A missing or partial payment is difficult to explain later. ProofPocket joins the agreed terms, payment history, and outstanding amount in one private record. Its client packet is a clear summary to review before sharing. It is a personal log, not legal proof of a contract.

## What works

- A live shift timer with breaks and a task/delivery counter. The clock keeps counting if you leave the app, and ending a shift files it straight into the log.
- Record past shifts paid per hour, per task, or per day, with money already received and notes.
- A payout check for any client and month: promised versus received, with short pay converted back into unpaid work ("They paid you for 10 of your 11.5 hours").
- Add dated partial payments and references. Settled and fully paid shifts lock, so a finished record cannot quietly drift.
- An overview led by this month: expected, received, and missing pay up front, with an all-time still-owed total.
- Export an itemized PDF evidence packet per client and a monthly PDF report across clients (Plus). Native builds create a PDF. The web preview opens printable HTML.
- Share a CSV copy of the ledger, free forever. Exported text escapes spreadsheet formulas and HTML markup.
- One-tap demo data seeds a realistic month (three clients, a few short payments) so anyone can run a payout check in seconds, then remove it just as fast.
- Records save on the device and recover after restart. Corrupt stored data is not overwritten.
- Remove a shift with confirmation.

## Try the project

```bash
cd proofpocket
npm ci
npm run web
```

Open the local address shown by Expo. To test the core path: on **Overview**, choose **+ Past shift** and record eight hours at ₹500 per hour with ₹1,500 already received. Back on the record, add a ₹900 payment. The record shows ₹1,600 still owed. Open **Check** to see the shortfall expressed as unpaid hours, then **Packet** for the evidence view. Restart the app to confirm the record remains. In a hurry? Load the one-tap demo month from the empty Overview (or the Plus tab) and run a payout check straight away.

For iOS or Android, use an Expo development build. The web preview does not run store purchases. No purchase or payment is simulated.

The app also opens in Expo Go for a quick look or for filming the demo: the store stays in preview mode there (the Plus screen says so), while a development build runs the full RevenueCat paywall. Every other feature behaves identically in both.

## RevenueCat setup

The app uses `react-native-purchases`. To enable Plus in a native development or store build:

1. Create a RevenueCat project and connect the intended App Store or Google Play app.
2. Create a `proofpocket` entitlement and attach the Monthly, Yearly and Lifetime products to the current offering. The paywall lists every package in the offering, so all three can be sold from day one.
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

The ledger tests cover per-hour and per-task pricing, settled-shift locking, migration of first-version records, payout-check maths, timer math, CSV safety, and packet escaping. TypeScript checks clean, and the web bundle builds with `npx expo export --platform web`.

## Demo and entry status

- [Walkthrough video](demo.mp4) (preview recording; see below)
- [Shipaton-size screenshot](shipaton-screenshot.png) (1179 × 2556)
- [Overview screenshot](overview.png)
- [Shipaton 2026 rules](https://revenuecat-shipaton-2026.devpost.com/rules)

Submission checklist status:

- Public repository with full source and run instructions: done.
- Open-source license detected by GitHub: MIT, in the root `LICENSE` file.
- Demo video: the in-repo recording is a preview. For the entry, record the app on a device with an Expo development build, keep it under two minutes, and post it publicly or unlisted on YouTube or Vimeo. The in-app demo data makes filming a full payout-check story take minutes.
- RevenueCat: add a public SDK key (a Test Store key is enough for a sandbox demo) so the Plus paywall runs live on camera. Purchase and restore flows are implemented against the `proofpocket` entitlement but are only exercised once a key exists.
- The entrant submits personally on Devpost under the Next Gen (student) track with their academic email. Next Gen is judged on the demo video and this repository, not on store presence or revenue.

This source package alone does not prove track eligibility. No Devpost receipt or store release is claimed.

## Project map

- `App.tsx` contains the interface and offline flows: Overview, shift Timer, past-shift entry, Payout check, evidence Packet, and the Plus paywall.
- `ledger.ts` contains validation, pay math for hour/task/day work, settled-shift locking, the payout-check calculation, packet creation, and the demo data seed.
- `purchases.ts` contains the RevenueCat setup, purchase, restore, status, and price calls.
- `tests/ledger.test.ts` checks the ledger rules.

The design uses a restrained navy and teal palette, one primary action per screen, readable financial totals, and red reserved for one thing: missing pay. Records stay local to the device unless the owner chooses to share them.

## License

[MIT](LICENSE) © 2026 Amaan Ahmad. Open source for the RevenueCat Shipaton 2026 Next Gen track.
