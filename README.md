# Grattitude Synergy — Employee Enterprise Portal (v1.0.0)

Production-grade corporate workforce management portal built with **React 19**, **TypeScript**, **Vite**, **Tailwind CSS v4**, and **Google Cloud Firestore** (`persistentLocalCache` + `persistentMultipleTabManager`).

## Modules
- **Core Directory & RBAC**: 6 Hierarchy Levels (Level 0 Intern to Level 5 Admin/CEO/Advisor), Dynamic Onboarding Form Builder, Circular Reporting Prevention, Direct-Report Deletion Guard, Compensation & Perform Lock Controls, and Immutable Audit Trail (`audit_logs`).
- **Perform (KPI Appraisal & OKR Engine)**: 75 Pre-Seeded Master KPIs (15 per Level 1–5, 100% weightage), 5 Deterministic Scoring Algorithms, 5-Stage Appraisal Lifecycle State Machine, Printable Scorecards, Org Hierarchy Visualizer, and Level 0 Intern Enablement Track.
- **Show Up (HRMS, Attendance, Leave & Payroll)**: Virtual Punch Terminal, Monthly Attendance Calendar, HRMS Policy Engine (09:30–18:30 shift, 10:00 AM grace cutoff, 3 late marks = 0.5 day leave deduction, 15-day EL notice), Manager Leave Collision Detector, Statutory Indian CTC Payroll Generator, and 4-Category Document Vault.
- **Connect (CRM & Sales Pipeline)**: 7-Stage Deal Pipeline (`Lead` → `Contacted` → `Discovery` → `Proposal` → `Negotiation` → `Won` → `Lost`), Kanban & Table Views, Mandatory Won/Lost Attribution Modal, Activity & Stage Audit Timeline, Interactive Metrics Dashboard, and Bulk CSV Import/Export.

## Getting Started

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.
- **Pre-Seeded Super Admin (`EMP-001`)**: `grattitudesynergyllp@gmail.com` / `Admin@123`
- **Corporate Domain Normalization**: Short usernames automatically resolve to `@grattitude.in`.
