# ProofPocket

**The offline shift and pay log that proves you got paid what you actually earned.**

Entered for the RevenueCat Shipaton 2026, Next Gen (student) track.

## Elevator pitch

Gig workers and part-time students get underpaid quietly: an hour missing here, forty deliveries short there, and no record of their own to argue with. ProofPocket logs every shift 100% offline, computes what you should have been paid from your own agreed rate, compares it with what actually landed, and shows the gap in red: *You logged 11.5 hours. They paid you for 8. ₹630 missing.* One tap turns that into a timestamped PDF evidence packet you can hand to a manager or platform support.

## The problem

The scale is not small: India counted 7.7 million gig workers in 2020-21, a figure NITI Aayog projects to reach 23.5 million by 2029-30 (*India's Booming Gig and Platform Economy*, 2022). Almost none of them holds an independent record of the work behind a payout.

- Millions of delivery riders, warehouse pickers, cafe and retail staff, and students working part-time are paid per hour, per delivery, or per task.
- Payouts are frequently wrong, and workers hold no independent record. Their hours live inside the platform's app, the same system that underpaid them.
- Existing shift trackers are cloud accounts with generic timesheets. None of them check the payout, most need connectivity, and none are built for cheap phones on patchy networks.

## What ProofPocket does

1. **Log work the way you are actually paid.** Per hour, per task, or per day. A live timer with breaks and a delivery/task counter for shifts in progress, or quick entry for past shifts. No account, no sign-up.
2. **Payout check (the Missing Pay engine).** Record what actually arrived. ProofPocket compares it against your logged work per client and per month, and translates the shortfall back into unpaid labor: "They paid you for 210 of your 240 deliveries."
3. **Missing Pay dashboard.** The home screen leads with this month: expected, received, and missing, with red used for exactly one thing.
4. **Evidence packets.** One-tap, timestamped PDF of shifts, rates, payments and the unpaid total, ready to forward. Settled and fully paid shifts lock, so a finished record cannot quietly drift later.
5. **Monthly summary.** Worked, expected, paid, and missing across every client, with a monthly PDF report.
6. **One-tap demo data.** A realistic sample month (three clients, a few short payments) so anyone, judges included, can run a payout check in seconds and remove it just as fast.

## Why offline-first is the point

- The workers who need this most have the worst connectivity and the cheapest phones. ProofPocket works in airplane mode, in a basement warehouse, in a low-signal delivery zone.
- Pay records are sensitive. They never leave the device: no backend, no cloud sync, no analytics, no tracking. Privacy by architecture, not by policy.
- Everything runs on-device, so it is fast, and free to operate forever.

## Monetization (RevenueCat)

- **Free, forever:** unlimited shift logging, the live timer, payout checks, and CSV export.
- **ProofPocket Plus (RevenueCat subscription, `proofpocket` entitlement, Monthly / Yearly / Lifetime plans):** one-tap PDF evidence packets per client, monthly PDF pay reports across clients, and full payment timelines inside every report.
- The paywall is presented in-app. With a RevenueCat public key configured (a Test Store key is enough for sandbox demos), purchase and restore run live; without one, the screen shows an honest preview state and the rest of the app is unaffected.

## How it is built

- Expo / React Native with TypeScript, single codebase for iOS, Android, and web preview.
- All pay math lives in a pure, unit-tested core (`ledger.ts`, 14 tests: per-unit pricing, settled locking, payout-check math, timer/break math, migration of first-version records, CSV formula-injection safety, HTML escaping in packets).
- Records persist in on-device storage with corruption-safe reads; nothing is ever overwritten blindly.
- RevenueCat `react-native-purchases` SDK for subscriptions and entitlement checks; PDF generation and sharing handled fully on-device.
- Open source under MIT. See `README.md` for architecture and run instructions.

## Built by a student, for people who work like students

I am a student, and like a lot of students I have funded my life one shift at a time. ProofPocket is the tool I wished existed on every payout day: my hours, my math, my proof. It is built for riders, pickers, and part-timers who cannot afford to be underpaid silently. Same build, second lens: financial fairness for gig workers.

## What is next

- More currencies and locales; platform payout presets (per-delivery and per-task templates).
- Optional encrypted backup that stays under the worker's control.
- iOS and Android store releases with live store products behind the existing RevenueCat paywall.

## Built with

Expo · React Native · TypeScript · RevenueCat · on-device storage · on-device PDF generation

## Links

- Public repo: https://github.com/iamaanahmad/ProofPocket
- Demo video (under 2 minutes, on device): added to the Devpost submission by the entrant
- RevenueCat: project ID and bundle ID (`com.iamaanahmad.proofpocket`) are entered in the Devpost submission form
