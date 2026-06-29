# Voyager HRIS - Master Roadmap & Versioning Strategy

**Project:** Voyager HRIS  
**Current Phase:** V1 (Simulation Pilot)  
**Platform:** Replit  

---

## 🚀 The Grand Strategy
We are adopting a **"Front-End First"** development strategy. Instead of spending months building a backend that might not fit user needs, we are launching a high-fidelity "Simulation" (V1) first. This allows the HR team to test the *experience* immediately. Once validated, we will swap the "Simulation Engine" (LocalStorage) for a "Real Engine" (Centralized Database) in V2.

---

## 📅 Roadmap & Versions

### ✅ V1: The "Simulation" Pilot (Current Sprint)
**Timeline:** Now – Jan 9, 2026 (Friday)  
**Architecture:** React Frontend + LocalStorage (Browser Database)  
**Goal:** Immediate deployment for HR User Testing & Design Validation.

*   **Capabilities:**
    *   Full UI/UX for all 35+ modules.
    *   **Data Persistence:** Data is saved to the *user's browser*. Adding an employee works, but data is private to that specific user/computer.
    *   **Logic:** Working forms, drag-and-drop pipelines, task management.
    *   **Security:** N/A (Data is local).
*   **Deliverable:** Live URL (`voyager-hris.replit.app`) distributed to HR team.

### 🔄 V1.5: The Feedback Loop
**Timeline:** Jan 12 – Jan 16, 2026  
**Focus:** Refinement based on Pilot usage.

*   **Activities:**
    *   Gather feedback from HR (e.g., "The recruitment form needs a salary field").
    *   UI Polish and Mobile tweaks.
    *   Fixing logic bugs found during the pilot.
*   **Why:** Ensures we don't build the wrong backend schema in V2.

### 🏗️ V2: The "Real" Application (Centralization)
**Timeline:** Feb 1, 2026 (Target)  
**Architecture:** React Frontend + Node.js Backend + PostgreSQL Database  
**Goal:** Multi-user collaboration and permanent data storage.

*   **Major Upgrade - " The Brain Transplant":**
    *   **Centralized Database:** We will replace `zustand` LocalStorage with a real PostgreSQL database.
    *   **Multi-User Sync:** When User A adds an employee, User B sees it instantly.
    *   **Authentication:** Real Login/Sign-up (Google Workspace SSO).
    *   **Role-Based Access:** Admins see everything; Employees see only their profile.
*   **Migration Plan:**
    *   We will export the data from the Pilot (JSON) and seed the new Database so no data is lost.

### 🔌 V3: Integrations & Automation
**Timeline:** Q2 2026  
**Focus:** Connecting to the outside world.

*   **Features:**
    *   **Slack/Email Notifications:** Real alerts when candidates apply.
    *   **Payroll Sync:** Export data to ADP/Gusto.
    *   **AI Backend:** Connecting the Chatbot to real company documents (RAG).

---

## 🛠️ Detailed Execution Plan (V1 Launch)

### 📅 Wednesday, Jan 7 (Today) - "The Simulation Layer"
*Focus: Making the buttons work.*
1.  **[Done] State Management:** Installed `zustand` for data persistence.
2.  **[Done] Employees Module:** Added ability to Create, Edit, Delete employees.
3.  **[Next] Recruitment:** Wire up the Kanban board for candidate drag-and-drop.
4.  **[Next] Tasks:** Enable creating and checking off tasks.

### 📅 Thursday, Jan 8 - "Polish & Protection"
*Focus: Making it feel expensive.*
1.  **Feedback:** Add "Success" popups (Toasts) for every action.
2.  **Empty States:** Design friendly "No Data" screens so the app doesn't look broken when empty.
3.  **Mobile Check:** Ensure the sidebar and tables work on iPhones/iPads.
4.  **Search Indexing:** Make `Cmd+K` actually search the new dynamic data.

### 📅 Friday, Jan 9 - "Launch Day"
1.  **Code Freeze (12:00 PM):** Stop adding features.
2.  **Deployment:** Push the "Production" build to Replit.
3.  **Handover:** Send the URL to HR with a "Getting Started" guide.

---

## 📝 Immediate To-Do List (Step-by-Step)
1.  **Wire Recruitment:** Connect the Kanban board to the data store.
2.  **Wire Tasks:** Connect the Task list to the data store.
3.  **Wire Documents:** Allow "uploading" (simulating) files.
4.  **Add Toast Notifications:** Install `sonner` for beautiful alerts.
