# ADR-0003: Google Play Billing in the app; outside payments land in the same table

- Status: Accepted
- Date: 2026-11-24

## Context

Google Play requires Play Billing for digital purchases inside Play apps. Many students have no
card; Play supports carrier billing (Dialog, Airtel) for prepaid balance and postpaid bills.

## Decision

Two auto-renewing plans (monthly, yearly) via Google Play Billing (RevenueCat SDK). Purchases are
verified and acknowledged on the server. Parent web payments (PayHere) and agent top-ups come
later and write to the same `subscriptions` table with a `source` column.

## Consequences

Play service fee plus up to 10% withholding tax on carrier billing. The app never links to or
prices outside payment methods.
