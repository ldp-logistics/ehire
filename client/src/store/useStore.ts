import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface Employee {
  id: number;
  // Core Identifiers
  employeeId: string;
  name: string; // Display Name
  firstName: string;
  middleName?: string;
  lastName: string;
  avatar?: string;
  
  // Work Details
  role: string; // Designation or Title
  department: string;
  subDepartment?: string;
  businessUnit?: string;
  primaryTeam?: string;
  costCenter?: string;
  grade?: string;
  jobCategory?: string;
  location: string; // Office Location
  managerEmail?: string;
  hrEmail?: string;
  
  // Status & Type
  status: 'Active' | 'On Leave' | 'Terminated' | 'Resigned';
  employeeType: string; // Full time, Contractor, etc.
  shift?: string;
  
  // Contact Info
  email: string; // Official Email
  personalEmail?: string;
  personalPhone?: string;
  workPhone?: string;
  
  // Personal Details
  dob?: string;
  gender?: string;
  maritalStatus?: string;
  bloodGroup?: string;
  
  // Address (Permanent)
  street?: string;
  city?: string;
  state?: string;
  country?: string;
  zipCode?: string;
  
  // Address (Communication)
  commStreet?: string;
  commCity?: string;
  commState?: string;
  commCountry?: string;
  commZipCode?: string;
  
  // Dates
  joinDate: string;
  probationStartDate?: string;
  probationEndDate?: string;
  confirmationDate?: string;
  noticePeriod?: string;
  
  // Exit Info
  resignationDate?: string;
  lastWorkingDate?: string;
  exitType?: string;
  resignationReason?: string;
  eligibleForRehire?: string;
  
  // Custom
  customField1?: string;
  customField2?: string;
}

export interface LeaveRequest {
  id: number;
  userId: number;
  userName: string;
  type: 'Annual' | 'Sick' | 'Casual' | 'Unpaid' | 'Maternity' | 'Paternity';
  startDate: string;
  endDate: string;
  reason: string;
  status: 'Pending Manager' | 'Pending HR' | 'Approved' | 'Rejected';
  managerComment?: string;
  requestedOn: string;
}

export interface LeaveBalance {
  id: number;
  userId: number;
  year: number;
  annualTotal: number;
  annualUsed: number;
  sickTotal: number;
  sickUsed: number;
  casualTotal: number;
  casualUsed: number;
}

interface AppState {
  employees: Employee[];
  addEmployee: (employee: Omit<Employee, 'id'>) => void;
  updateEmployee: (id: number, employee: Partial<Employee>) => void;
  deleteEmployee: (id: number) => void;

  // Recruitment
  candidates: Candidate[];
  addCandidate: (candidate: Omit<Candidate, 'id'>) => void;
  moveCandidate: (id: number, newStage: string) => void;
  deleteCandidate: (id: number) => void;

  // Leave Management
  leaveRequests: LeaveRequest[];
  leaveBalances: LeaveBalance[];
  addLeaveRequest: (request: Omit<LeaveRequest, 'id' | 'status' | 'requestedOn'>) => void;
  updateLeaveStatus: (id: number, status: LeaveRequest['status'], comment?: string) => void;

  // Performance Management
  reviews: PerformanceReview[];
  addReview: (review: Omit<PerformanceReview, 'id'>) => void;

  // Onboarding
  onboardingTasks: OnboardingTask[];
  toggleOnboardingTask: (hireId: number, taskId: number) => void;
  addOnboardingTasksForHire: (hireId: number, tasks: { task: string; category: string }[]) => void;
  updateOnboardingTaskDetails: (hireId: number, taskId: number, assignmentDetails: string) => void;
  addCustomOnboardingTask: (hireId: number, task: string, category: string) => void;

  // Payroll Management
  payrollRecords: PayrollRecord[];
  runPayroll: (month: string) => void;

  // Loan Management
  loans: Loan[];
  addLoan: (loan: Omit<Loan, 'id'>) => void;
}

export interface Loan {
  id: number;
  userId: number;
  type: 'Personal Loan' | 'Salary Advance' | 'Equipment Loan';
  amount: number;
  paid: number;
  tenure: number; // months
  interest: number; // percentage
  status: 'Active' | 'Pending' | 'Completed' | 'Rejected';
  startDate: string;
  monthlyEmi: number;
  reason: string;
}

export interface PerformanceReview {
  id: number;
  employeeId: number;
  reviewerId: number;
  rating: number;
  status: 'Pending' | 'In Progress' | 'Completed';
  cycle: string;
  dueDate: string;
}

export interface OnboardingTask {
  id: number;
  hireId: number;
  category: string;
  task: string;
  completed: boolean;
  assignmentDetails?: string; // e.g. "john.doe@company.com" for Microsoft, "Dell XPS 15 (AST-001)" for Laptop
}

export interface PayrollRecord {
  id: string;
  employeeId: number;
  month: string; // YYYY-MM
  baseSalary: number;
  additions: number; // Bonus, Overtime
  deductions: number; // Tax, Unpaid Leave
  netSalary: number;
  status: 'Draft' | 'Processed' | 'Paid';
  paymentDate?: string;
  attendancePercentage: number;
  unpaidLeaves: number;
}

export interface Candidate {
  id: number;
  name: string;
  role: string;
  stage: string;
  score: number;
  img: string;
}

const INITIAL_PAYROLL_RECORDS: PayrollRecord[] = [
  { id: "PR-2024-11-001", employeeId: 1, month: "2024-11", baseSalary: 12000, additions: 500, deductions: 200, netSalary: 12300, status: "Draft", attendancePercentage: 100, unpaidLeaves: 0 },
  { id: "PR-2024-11-002", employeeId: 2, month: "2024-11", baseSalary: 14000, additions: 0, deductions: 1400, netSalary: 12600, status: "Draft", attendancePercentage: 90, unpaidLeaves: 2 },
  { id: "PR-2024-11-003", employeeId: 3, month: "2024-11", baseSalary: 16000, additions: 2000, deductions: 500, netSalary: 17500, status: "Draft", attendancePercentage: 100, unpaidLeaves: 0 },
  { id: "PR-2024-11-004", employeeId: 4, month: "2024-11", baseSalary: 9000, additions: 0, deductions: 0, netSalary: 9000, status: "Draft", attendancePercentage: 100, unpaidLeaves: 0 },
  { id: "PR-2024-11-005", employeeId: 5, month: "2024-11", baseSalary: 7500, additions: 0, deductions: 2500, netSalary: 5000, status: "Paid", attendancePercentage: 0, unpaidLeaves: 20 }, // Terminated
];

const INITIAL_LEAVE_REQUESTS: LeaveRequest[] = [
  { 
    id: 1, 
    userId: 2, 
    userName: "Neo Anderson", 
    type: "Annual", 
    startDate: "2024-11-12", 
    endDate: "2024-11-15", 
    reason: "Vacation to Zion", 
    status: "Approved", 
    requestedOn: "2024-11-01" 
  },
  { 
    id: 2, 
    userId: 4, 
    userName: "Trinity Moss", 
    type: "Sick", 
    startDate: "2024-11-14", 
    endDate: "2024-11-14", 
    reason: "Feeling unwell", 
    status: "Pending Manager", 
    requestedOn: "2024-11-14" 
  },
  { 
    id: 3, 
    userId: 3, 
    userName: "Morpheus King", 
    type: "Annual", 
    startDate: "2024-11-18", 
    endDate: "2024-11-20", 
    reason: "Leadership Conference", 
    status: "Approved", 
    requestedOn: "2024-10-25" 
  },
  { 
    id: 4, 
    userId: 5, 
    userName: "John Wick", 
    type: "Casual", 
    startDate: "2024-11-25", 
    endDate: "2024-11-26", 
    reason: "Personal urgent work", 
    status: "Pending HR", 
    requestedOn: "2024-11-20" 
  },
];

const INITIAL_LEAVE_BALANCES: LeaveBalance[] = [
  { id: 1, userId: 1, year: 2024, annualTotal: 14, annualUsed: 5, sickTotal: 10, sickUsed: 2, casualTotal: 10, casualUsed: 0 },
  { id: 2, userId: 2, year: 2024, annualTotal: 14, annualUsed: 10, sickTotal: 10, sickUsed: 1, casualTotal: 10, casualUsed: 3 },
  { id: 3, userId: 3, year: 2024, annualTotal: 18, annualUsed: 12, sickTotal: 12, sickUsed: 0, casualTotal: 8, casualUsed: 2 },
  { id: 4, userId: 4, year: 2024, annualTotal: 15, annualUsed: 4, sickTotal: 5, sickUsed: 5, casualTotal: 0, casualUsed: 0 },
  { id: 5, userId: 5, year: 2024, annualTotal: 14, annualUsed: 0, sickTotal: 10, sickUsed: 0, casualTotal: 10, casualUsed: 0 },
];

const INITIAL_EMPLOYEES: Employee[] = [
  { 
    id: 1, 
    employeeId: "EMP001",
    name: "Sarah Connor", 
    firstName: "Sarah",
    lastName: "Connor",
    role: "Product Director", 
    department: "Product", 
    status: "Active", 
    email: "sarah@admani.com", 
    location: "San Francisco", 
    joinDate: "2020-10-12", 
    avatar: "https://github.com/shadcn.png",
    employeeType: "Full Time",
    grade: "L6",
    managerEmail: "kyle.reese@admani.com",
    city: "San Francisco",
    state: "CA",
    country: "USA"
  },
  { 
    id: 2, 
    employeeId: "EMP002",
    name: "Neo Anderson", 
    firstName: "Neo",
    lastName: "Anderson",
    role: "Lead Engineer", 
    department: "Engineering", 
    status: "Active", 
    email: "neo@admani.com", 
    location: "Remote", 
    joinDate: "2021-03-15", 
    avatar: "https://github.com/shadcn.png",
    employeeType: "Full Time",
    grade: "L5",
    managerEmail: "morpheus@admani.com",
    city: "Chicago",
    state: "IL",
    country: "USA"
  },
  { 
    id: 3, 
    employeeId: "EMP003",
    name: "Morpheus King", 
    firstName: "Morpheus",
    lastName: "King",
    role: "VP of Operations", 
    department: "Operations", 
    status: "On Leave", 
    email: "morpheus@admani.com", 
    location: "London", 
    joinDate: "2019-06-01", 
    avatar: "https://github.com/shadcn.png",
    employeeType: "Full Time",
    grade: "L8",
    city: "London",
    country: "UK"
  },
  { 
    id: 4, 
    employeeId: "EMP004",
    name: "Trinity Moss", 
    firstName: "Trinity",
    lastName: "Moss",
    role: "Senior Designer", 
    department: "Design", 
    status: "Active", 
    email: "trinity@admani.com", 
    location: "Berlin", 
    joinDate: "2022-01-10", 
    avatar: "https://github.com/shadcn.png",
    employeeType: "Full Time",
    grade: "L5",
    managerEmail: "neo@admani.com",
    city: "Berlin",
    country: "Germany"
  },
  { 
    id: 5, 
    employeeId: "EMP005",
    name: "John Wick", 
    firstName: "John",
    lastName: "Wick",
    role: "Security Analyst", 
    department: "Security", 
    status: "Terminated", 
    email: "john@admani.com", 
    location: "New York", 
    joinDate: "2023-05-20", 
    avatar: "https://github.com/shadcn.png",
    employeeType: "Full Time",
    grade: "L4",
    exitType: "Involuntary",
    resignationReason: "Violation of Policy",
    eligibleForRehire: "No",
    lastWorkingDate: "2024-01-15"
  },
];

const INITIAL_CANDIDATES: Candidate[] = [
  { id: 1, name: "John Wick", role: "Security Specialist", stage: "applied", score: 98, img: "https://github.com/shadcn.png" },
  { id: 2, name: "Ellen Ripley", role: "Operations Manager", stage: "interview", score: 95, img: "https://github.com/shadcn.png" },
  { id: 3, name: "Tony Stark", role: "Lead Engineer", stage: "offer", score: 99, img: "https://github.com/shadcn.png" },
  { id: 4, name: "Sarah Connor", role: "Product Owner", stage: "screening", score: 88, img: "https://github.com/shadcn.png" },
  { id: 5, name: "Bruce Wayne", role: "CEO", stage: "applied", score: 92, img: "https://github.com/shadcn.png" },
  { id: 6, name: "Natasha Romanoff", role: "HR BP", stage: "interview", score: 96, img: "https://github.com/shadcn.png" },
];

const INITIAL_REVIEWS: PerformanceReview[] = [
  { id: 1, employeeId: 2, reviewerId: 3, rating: 4.8, status: "Completed", cycle: "Q3 2024", dueDate: "2024-10-15" },
  { id: 2, employeeId: 1, reviewerId: 5, rating: 4.9, status: "Completed", cycle: "Q3 2024", dueDate: "2024-10-12" },
  { id: 3, employeeId: 5, reviewerId: 1, rating: 5.0, status: "Pending", cycle: "Q4 2024", dueDate: "2024-11-01" },
];

// Onboarding: Company-wide items only (Microsoft Account, Laptop). Additional items are added manually by IT Admin.
const INITIAL_ONBOARDING_TASKS: OnboardingTask[] = [
  // Alice Johnson (101 - Design)
  { id: 1, hireId: 101, category: "Company-wide", task: "Company Microsoft Account", completed: true },
  { id: 2, hireId: 101, category: "Company-wide", task: "Laptop", completed: true },
  // Bob Smith (102 - Engineering)
  { id: 3, hireId: 102, category: "Company-wide", task: "Company Microsoft Account", completed: true },
  { id: 4, hireId: 102, category: "Company-wide", task: "Laptop", completed: false },
  // Carol Williams (103 - Operations)
  { id: 5, hireId: 103, category: "Company-wide", task: "Company Microsoft Account", completed: false },
  { id: 6, hireId: 103, category: "Company-wide", task: "Laptop", completed: false },
];

const INITIAL_LOANS: Loan[] = [
  { id: 1, userId: 1, type: "Personal Loan", amount: 5000, paid: 2000, tenure: 12, interest: 5, status: "Active", startDate: "2024-06-15", monthlyEmi: 437.50, reason: "Home Renovation" },
  { id: 2, userId: 1, type: "Salary Advance", amount: 1000, paid: 0, tenure: 1, interest: 0, status: "Pending", startDate: "-", monthlyEmi: 1000, reason: "Urgent Expense" },
];

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      employees: INITIAL_EMPLOYEES,
      candidates: INITIAL_CANDIDATES,
      reviews: INITIAL_REVIEWS,
      onboardingTasks: INITIAL_ONBOARDING_TASKS,
      
      // Employee Actions
      addEmployee: (employee) => set((state) => ({
        employees: [...state.employees, { ...employee, id: Math.max(0, ...state.employees.map(e => e.id)) + 1 }]
      })),
      updateEmployee: (id, updatedEmployee) => set((state) => ({
        employees: state.employees.map((emp) => emp.id === id ? { ...emp, ...updatedEmployee } : emp)
      })),
      deleteEmployee: (id) => set((state) => ({
        employees: state.employees.filter((emp) => emp.id !== id)
      })),

      // Performance Actions
      addReview: (review) => set((state) => ({
        reviews: [...state.reviews, { ...review, id: Math.max(0, ...state.reviews.map(r => r.id)) + 1 }]
      })),

      // Onboarding Actions
      toggleOnboardingTask: (hireId, taskId) => set((state) => ({
        onboardingTasks: state.onboardingTasks.map(t =>
          t.hireId === hireId && t.id === taskId ? { ...t, completed: !t.completed } : t
        )
      })),
      addOnboardingTasksForHire: (hireId, tasks) => set((state) => {
        const ids = state.onboardingTasks.map((t) => t.id);
        const maxId = ids.length > 0 ? Math.max(...ids) : 0;
        const newTasks: OnboardingTask[] = tasks.map((t, i) => ({
          id: maxId + i + 1,
          hireId,
          category: t.category,
          task: t.task,
          completed: false,
        }));
        return { onboardingTasks: [...state.onboardingTasks, ...newTasks] };
      }),
      updateOnboardingTaskDetails: (hireId, taskId, assignmentDetails) => set((state) => ({
        onboardingTasks: state.onboardingTasks.map((t) =>
          t.hireId === hireId && t.id === taskId ? { ...t, assignmentDetails } : t
        ),
      })),
      addCustomOnboardingTask: (hireId, task, category) => set((state) => {
        const ids = state.onboardingTasks.map((t) => t.id);
        const maxId = ids.length > 0 ? Math.max(...ids) : 0;
        const newTask: OnboardingTask = {
          id: maxId + 1,
          hireId,
          category,
          task,
          completed: false,
        };
        return { onboardingTasks: [...state.onboardingTasks, newTask] };
      }),

      // Candidate Actions
      addCandidate: (candidate) => set((state) => ({
        candidates: [...state.candidates, { ...candidate, id: Math.max(0, ...state.candidates.map(c => c.id)) + 1 }]
      })),
      moveCandidate: (id, newStage) => set((state) => ({
        candidates: state.candidates.map((c) => c.id === id ? { ...c, stage: newStage } : c)
      })),
      deleteCandidate: (id) => set((state) => ({
        candidates: state.candidates.filter((c) => c.id !== id)
      })),

      // Leave Actions
      leaveRequests: INITIAL_LEAVE_REQUESTS,
      leaveBalances: INITIAL_LEAVE_BALANCES,
      addLeaveRequest: (request) => set((state) => ({
        leaveRequests: [...state.leaveRequests, { 
          ...request, 
          id: Math.max(0, ...state.leaveRequests.map(r => r.id)) + 1,
          status: 'Pending Manager',
          requestedOn: new Date().toISOString().split('T')[0]
        }]
      })),
      updateLeaveStatus: (id, status, comment) => set((state) => ({
        leaveRequests: state.leaveRequests.map((req) => 
          req.id === id ? { ...req, status, managerComment: comment } : req
        )
      })),

      // Payroll Actions
      payrollRecords: INITIAL_PAYROLL_RECORDS,
      runPayroll: (month: string) => set((state) => ({
        payrollRecords: [...state.payrollRecords]
      })),

      // Loan Actions
      loans: INITIAL_LOANS,
      addLoan: (loan) => set((state) => ({
        loans: [...state.loans, { ...loan, id: Math.max(0, ...state.loans.map(l => l.id)) + 1 }]
      })),
    }),
    {
      name: 'voyager-hris-storage',
      storage: createJSONStorage(() => localStorage),
      version: 3,
      migrate: (persistedState: any, version: number) => {
        if (!persistedState?.onboardingTasks) return persistedState;
        const tasks = persistedState.onboardingTasks;

        // v1 -> v2: old Pre-boarding / Day 1 structure
        if (version < 2) {
          const hasOldStructure = Array.isArray(tasks) && tasks.some((t: any) => t.category === 'Pre-boarding' || t.category === 'Day 1');
          if (hasOldStructure) {
            return { ...persistedState, onboardingTasks: INITIAL_ONBOARDING_TASKS };
          }
        }

        // v2 -> v3: remove hardcoded department-specific tasks; keep only Company-wide + user-added (Additional Assigned Items)
        if (version < 3 && Array.isArray(tasks)) {
          const companyWideTasks = ['Company Microsoft Account', 'Laptop'];
          const cleaned = tasks.filter((t: any) => {
            if (t.category === 'Company-wide' && companyWideTasks.includes(t.task)) return true;
            if (t.category === 'Additional Assigned Items') return true; // user-added
            if (t.task === 'Add more items as needed...') return false; // old placeholder
            if (['Design', 'Engineering', 'Operations', 'Marketing', 'IT', 'Product', 'HR', 'Finance', 'Sales', 'Security', 'Default', 'Department'].includes(t.category)) return false; // old hardcoded
            return true; // unknown, keep to be safe
          });
          return { ...persistedState, onboardingTasks: cleaned };
        }

        return persistedState;
      },
    }
  )
);
