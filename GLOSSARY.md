# Glossary

The project's domain language. Each term names a concept the codebase models; use these
names in code, docs, and reviews.

## Table of contents

- [1. Dashboard navigation](#1-dashboard-navigation)

## 1. Dashboard navigation

The decision module that answers, for the calendar page: *given the URL and the held
snapshot, which tab and period are displayed, is the held data sufficient, and does this
navigation require a fetch?* It is pure and client-safe (`src/lib/dashboard/navigation.ts`),
owning the fetch/display decision so `DashboardScreen` and `DashboardView` are thin
adapters. A **tab switch** is planned through the same module (`planDashboardSwitch`), so
the rule that decides "does a tap refetch?" lives once.

Related: **dashboard snapshot** (the serializable data a snapshot carries, cached in
IndexedDB — `src/lib/dashboard/snapshot.ts`).
