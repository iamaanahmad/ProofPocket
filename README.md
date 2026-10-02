# ProofPocket

**The offline shift and pay log that proves you got paid what you actually earned.**

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Built with Expo](https://img.shields.io/badge/built%20with-Expo-000020?logo=expo)](https://expo.dev)
[![React Native](https://img.shields.io/badge/React%20Native-TypeScript-3178c6?logo=typescript)](https://reactnative.dev)
[![RevenueCat](https://img.shields.io/badge/monetization-RevenueCat-f50057?logo=revenuecat)](https://revenuecat.com)
[![RevenueCat Shipaton 2026](https://img.shields.io/badge/RevenueCat%20Shipaton-2026%20%C2%B7%20Next%20Gen-blueviolet)](https://shipaton.com)
[![Platform](https://img.shields.io/badge/platform-Android%20%7C%20iOS%20%7C%20Web-lightgrey)](https://github.com/iamaanahmad/ProofPocket)

<p>
  <img src="assets/icon.png" width="180" alt="ProofPocket app icon" />
</p>

ProofPocket is built for gig workers, delivery riders, and part-time students whose pay is frequently short and who hold no record of their own. Log every shift by the hour, task or day, record what actually landed, and ProofPocket shows the gap in red: *You logged 11.5 hours. They paid you for 8. ₹630 missing.* One tap turns that into a dated PDF evidence packet. Everything runs on the device. No account, no server, no connection required.

Built with Expo / React Native + TypeScript for the **RevenueCat Shipaton 2026 · Next Gen (student) track**. Open source under MIT.

---

## The problem

India alone counted 7.7 million gig workers in 2020-21, a figure NITI Aayog projects to reach 23.5 million by 2029-30 ([NITI Aayog, 2022](https://economictimes.indiatimes.com/jobs/gig-workers-in-india-to-top-23-million-by-2029-30-niti-aayog-report/articleshow/92489976.cms)). Almost none of them holds an independent record of the work behind a payout.

- People paid by the hour, delivery or task get underpaid quietly: an hour missing here, forty deliveries short there.
- Their only record lives inside the platform app that underpaid them. Chat threads and screenshots do not add up to proof.
- Existing trackers are cloud accounts with generic timesheets. None checks the payout, most need connectivity, none is built for cheap phones on patchy networks.

---

## What ProofPocket does

- **Live shift timer** with breaks and a delivery/task counter. The clock keeps running if you leave the app; ending the shift files it and opens its payout check automatically.
- **Log past shifts** paid per hour, per task, or per day, with partial payments, references and notes.
- **Payout check (the Missing Pay engine):** per client and month, promised versus received, with short pay translated back into unpaid work — *"They paid you for 210 of your 240 deliveries."*
- **Locked records:** fully paid or settled shifts lock so a finished record cannot drift quietly before you show it to someone.
- **Evidence packets:** dated PDF per client and monthly PDF reports across clients, generated and shared fully on-device.
- **CSV export, free forever**, with spreadsheet formula-injection escaping.
- **One-tap demo data:** a realistic seeded month (three clients, a few short payments) so anyone can run a full payout check in seconds, then remove it with one tap.

---

## Free vs Plus

| Free forever | ProofPocket Plus |
|---|---|
| Unlimited shift logging | One-tap PDF evidence packet per client |
| Live timer with breaks and task counter | Monthly PDF pay report across clients |
| Payout checks for any client and month | Full payment timelines inside every report |
| CSV export of the whole ledger | Monthly, Yearly and Lifetime plans |

Logging and checks never need a subscription or a network. Plus is sold through the RevenueCat SDK (`proofpocket` entitlement) with Monthly, Yearly and Lifetime plans.

---

## Try it in two minutes

```bash
git clone https://github.com/iamaanahmad/ProofPocket.git
cd ProofPocket
npm install
npx expo start
```

Open in Expo Go or press `w` for the web preview. On the empty **Overview**, tap **Load demo data**, then open **Check**: Cafe Aroma's September shows ₹1,080 missing, QuickDash shows ₹2,700 missing (60 of 570 deliveries unpaid). Start a shift on **Timer**, take a break, end it, and watch it file itself.

To exercise the paywall with live store products, add a RevenueCat public SDK key:

```bash
echo "EXPO_PUBLIC_REVENUECAT_API_KEY=your-public-key" > .env
npx expo run:android   # or an EAS development build
```

A RevenueCat Test Store key is enough to buy Monthly / Yearly / Lifetime end to end in the sandbox.

---

## Architecture

- **`ledger.ts`** — pure, tested core: per-unit pay math, settled locking, payout-check engine, PDF/CSV generation, timer math, and migration of first-version records. Zero UI dependencies.
- **`App.tsx`** — interface only. All business logic delegates to `ledger.ts`.
- **`purchases.ts`** — isolates every RevenueCat call behind lazy native loading so the app runs in Expo Go as well as development builds.
- Records persist in AsyncStorage with corruption-safe reads. Nothing leaves the device unless the user explicitly shares an export. No analytics, no tracking, no backend.

**Tests:** 14 ledger unit tests covering per-unit pricing, settled locking, payout-check math, timer/break math, record migration, CSV formula-injection safety, and HTML escaping in packets.

```bash
npx tsx tests/ledger.test.ts   # run all 14 tests
npx tsc --noEmit               # type check
npx expo export --platform web # full bundle export
```

---

## Privacy

Pay records are sensitive. They never leave the device by design: no cloud sync, no accounts, no third-party SDKs beyond the store billing SDK, which only sees purchase events.

---

## License

[MIT](LICENSE) © 2026 Amaan Ahmad.
