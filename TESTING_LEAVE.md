# Testing Leave Management

Quick way to test the full leave flow: HR creates a policy and leave types, then an employee applies for leave.

## 1. Database and seed data

```bash
# From project root
npm run db:push
npm run db:seed
npm run db:seed-users
```

If you haven’t run the leave policy migration yet, apply it:

```bash
# Option A: push applies schema (including applicable_roles)
npm run db:push

# Option B: run the migration SQL manually
# Run the contents of migrations/0008_add_leave_policy_applicable_roles.sql in your DB.
```

## 2. Set a known password (so you can log in)

Seed users are created with a placeholder hash. Set a real password for testing:

```bash
npm run db:set-demo-passwords
```

Then you can log in with **password: `password123`** for any seeded user.

## 3. Test users (from seed)

| Email               | Role     | Use for                          |
|---------------------|----------|----------------------------------|
| hr@admani.com       | HR       | Create policies, add leave types |
| ehire@ldplogistics.com | Admin | Same as HR                       |
| neo@admani.com      | Employee | Apply for leave                  |
| trinity@admani.com  | Employee | Apply for leave                 |
| sarah@admani.com    | Manager  | Approve leave (optional)         |

**Note:** `hr@admani.com` and `ehire@ldplogistics.com` are not linked to an employee record, so they **cannot apply for leave** themselves; they are for configuring policies. Use **neo@admani.com** or **trinity@admani.com** to test applying leave.

## 4. Run the app

```bash
npm run dev
```

Open the app (e.g. http://localhost:5000 or the port shown in the terminal).

## 5. Test flow

### Step A – HR: Create a policy and leave types

1. Log in as **hr@admani.com** / **password123**.
2. Go to **Leave Management** (or Leave / Calendar, depending on your nav).
3. Open the **Policies** tab.
4. Click **New Policy**.
5. Fill in:
   - **Policy name:** e.g. `Standard Policy`
   - **Effective from:** today (or any past date).
   - **Applicable roles:** leave **blank** (so all roles, including employee, can use it).
   - Departments / employment types: optional (blank = all).
6. Click **Create Policy**.
7. In the list, select the new policy.
8. Click **Add Type** and create at least one leave type, e.g.:
   - Name: **Annual Leave**
   - Paid: yes, Max balance: 21, etc.
9. Save.

### Step B – Employee: Apply for leave

1. Log out (or use an incognito window).
2. Log in as **neo@admani.com** / **password123**.
3. Go to **Leave Management**.
4. Click **Apply Leave**.
5. You should see **Annual Leave** (or your leave type) in the **Leave Type** dropdown.
6. Choose leave type, **Start date**, **End date**, then **Submit Request**.

### Step C – Manager/HR: Approve (optional)

1. Log in as **sarah@admani.com** (manager) or **hr@admani.com**.
2. Open the **Approvals** tab (if there are pending items).
3. Approve or reject the request.

## 6. Troubleshooting

- **“No leave types available”**
  - Policy exists and has at least one leave type.
  - **Roles that can use this policy** is either blank or includes `employee`.
  - You are logged in as a user with role `employee` (e.g. neo@admani.com).

- **“Your account is not linked to an employee record”**
  - You’re logged in as HR/Admin (no employee link). Use **neo@admani.com** or **trinity@admani.com** to test applying leave.

- **Leave type dropdown empty after creating policy**
  - Add at least one **Leave Type** to the policy (Policies tab → select policy → **Add Type**).
  - Run **Set demo passwords** and use an **employee** account (neo or trinity) to open Apply Leave.

- **Database errors about `applicable_roles`**
  - Run `npm run db:push` (or apply `migrations/0008_add_leave_policy_applicable_roles.sql`).

## 7. Optional: Inspect data

```bash
npm run db:studio
```

Use Drizzle Studio to check `leave_policies`, `leave_types`, `users.employee_id`, and `employee_leave_balances`.
