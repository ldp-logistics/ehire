# Leave management & policies — design aligned with FreshTeam-style UX

**Status:** Design only (no implementation). Goal: structure **LDP leave** so admins configure it in a familiar way (policy shell + per-type rule tabs), while **LDP remains source of truth** after FreshTeam migration.

### Many policies, not one

The app supports **multiple time-off policies at once** (e.g. **Pakistan**, **US**, **UAE**, **HQ default**, or by entity / region). The FreshTeam screenshots showing **“Pakistan Policy”** are **one example** of a single policy instance—same screens repeat for every policy you create.

- Each policy has its **own** name, workweek, holiday calendar, period, applicability (departments / employment types / roles), and **its own set of leave types** (Earned, Bereavement, etc.) with independent rules.
- **One employee** resolves to **one effective policy** at a time (by matching rules, default flag, or future explicit assignment)—they don’t see every policy, only the one that applies to them.
- HR maintains a **policy list**: add, clone, activate/deactivate, effective dates—so scaling to many regions or populations is first-class, not an afterthought.

---

## 1. Two-level model (same as screenshots)

| Level | Purpose | What admins configure |
|-------|---------|------------------------|
| **Time-off policy** | One “container” per geography / population | Name, default flag, **unit** (days vs hours), **workweek**, **holiday calendar**, **policy period** (e.g. Jan–Dec), **effective from**, who it applies to (departments, employment types, roles — you already have this). |
| **Leave types** (many per policy) | Each bucket: Earned, Bereavement, LWOP, etc. | Four **tabs** per type: **Accrual**, **Balance**, **Request**, **Additional** — see below. |

Employees see **one effective policy** (best match or explicit assignment later); types listed are only those under that policy.

---

## 2. Policy-level screen (example: “Pakistan Policy” — same pattern for any policy)

Suggested fields / UX:

- **Title** — policy name.
- **Mark as default** — optional; used when multiple policies match (tie-break or fallback).
- **Calculate time off in** — **Days** | **Hours** (affects display, rounding, and possibly accrual math for hourly staff).
- **Workweek** — define which weekdays count as working (Mon–Fri default; support custom). Drives business-day counting instead of a single global assumption.
- **Holiday calendar** — link policy to a **named calendar** (e.g. “Pakistan Holidays”). Multiple calendars possible; policy picks one. Replaces “one global holiday list for everyone” if you need regional policies.
- **Policy period** — start month (e.g. January) and explanation that the cycle repeats yearly (or support fiscal year offset).
- **Applicable from** — effective date (you have `effective_from` / `effective_to`).

**Navigation:** After saving policy, admin adds/edits **leave types** in an accordion or list (each row expands to the four tabs).

---

## 3. Per leave type — Tab: **Accrual rules**

| Control (FreshTeam-style) | Design intent for LDP |
|---------------------------|------------------------|
| **Accrual type** | e.g. Fixed balance, None (manual/annual grant only), or future variants. Maps to your `accrual_type` + special cases (e.g. Earned 15-day blocks). |
| **# of days** | Annual entitlement or fixed grant (e.g. 12, 2). |
| **Frequency** | Monthly | Annually | (optional: per pay period). Drives when balance increases. |
| **Proration** | If on: pro-rate grant when employee joins mid-period. If off: full bucket or rule-based (e.g. bereavement always 2 on reset). |

---

## 4. Per leave type — Tab: **Balance rules**

| Control | Design intent |
|---------|----------------|
| **Permissible limit of current balance** | Cap on **accrued** balance (your `max_balance` + enforcement). |
| **Allow requests beyond current balance** | Negative balance / advance leave (not in LDP today; optional future). |
| **Allow carryover** | On/off + **carryover type** (e.g. limit count) + **max days** (e.g. 6) + optional **expire carryover after N days** into new period. Maps to `carry_forward_allowed`, `max_carry_forward`, plus new “expiry” if needed. |

---

## 5. Per leave type — Tab: **Request rules**

| Control | Design intent |
|---------|----------------|
| **Restrict back-dated requests** | Max days in the past employees may apply (e.g. 3). New validation on submit. |
| **Restrict requests without enough lead time** | Min days **before** leave start (notice for booking). New validation. |
| **Auto approval** | On/off; sub-rules (e.g. max days, day types) — you have `auto_approve_rules` JSON; UI can expose as toggles + number fields. |
| **Allow attachments** | Master toggle. |
| **Mandatory attachment if request &gt; N days** | Conditional doc rule (FreshTeam pattern); extends binary `requires_document`. |
| **Mandatory attachment when applying on behalf** | Separate flag for HR/admin-on-behalf flows. |

---

## 6. Per leave type — Tab: **Additional rules**

| Control | Design intent |
|---------|----------------|
| **Waiting period after join** | N days from join date before this type can be used (probation). New per-type field + validation. |

You can keep **blocked during notice** and **HR approval required** in this tab or Request rules for consistency.

---

## 7. Information architecture (screens)

1. **Leave Admin → Policies** — **list all policies** (many rows); create/edit any **policy shell** (workweek, calendar, period, applicability). Pakistan (or any region) is just one row in that list.
2. **Policy detail** — nested **Leave types**; each type opens **four tabs** (Accrual | Balance | Request | Additional).
3. **Leave Admin → Holiday calendars** (if multi-calendar) — CRUD calendars; assign to policy. *(Could phase 1: single calendar + policy links “default” until regional calendars are needed.)*
4. **Leave Admin → Workweeks** (optional) — reusable templates (Mon–Fri, Sun–Thu, etc.) assigned on policy.

Employee-facing **Apply leave** flow stays the same in spirit; only validation rules expand per new fields.

---

## 8. Migration / FreshTeam note

FreshTeam sync remains **temporary** for data import. Once policies are defined in LDP to mirror business rules (not necessarily 1:1 API parity with FreshTeam), **balances and requests live in LDP**; FreshTeam screens are a **UX reference**, not the ongoing integration model.

---

## 9. Phasing (suggested, still design-only)

| Phase | Scope |
|-------|--------|
| **A** | UI restructure only: policy form + leave type **four tabs**, mapping **existing** DB fields into the right tab (no new columns yet). |
| **B** | Policy-level **workweek** + **holiday calendar** selection; business-day logic uses policy context. |
| **C** | New validations: back-date limit, min lead time, attachment if &gt; N days, on-behalf attachment, waiting period after join. |
| **D** | Advanced balance: negative balance, carryover expiry. |

---

*This document is the target experience; implementation order and schema changes can be decided separately.*
