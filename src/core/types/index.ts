// ==========================================
// GRATTITUDE SYNERGY — ENTERPRISE DATA MODELS
// ==========================================

export type CorporateRole = 'Admin' | 'CEO' | 'Manager' | 'Employee' | 'Advisor';
export type EmployeeStatus = 'Active' | 'Inactive' | 'On Leave' | 'Exited';
export type AppRoute = '/perform' | '/showup' | '/connect' | '/profile' | '/employee-management';
export type Quarter = 'Q1' | 'Q2' | 'Q3' | 'Q4';

// 1. Employee (employees)
export interface Employee {
  id: string; // Firebase Auth UID
  ecode: string; // e.g. EMP-001
  name: string;
  email: string; // Official email
  designation: string;
  department: string;
  vertical: string;
  level: number; // 0 (Intern) to 5 (Admin/CEO/Advisor)
  role: CorporateRole;
  reportingManagerId: string;
  dateOfJoining: string; // YYYY-MM-DD
  status: EmployeeStatus;
  isManager: boolean;
  hasCrmAccess: boolean;
  isAssociate: boolean;
  isAccountsStaff?: boolean;
  mustChangePassword?: boolean;
  passwordHash?: string;
  updatedAt?: string;
  isCloudRecovered?: boolean;
  customAttributes?: Record<string, any>;
  personal: {
    address: string;
    emergencyContactName: string;
    emergencyContactPhone: string;
    phone: string;
  };
  employment: {
    workLocation: string;
    probationPeriodMonths: number;
    noticePeriodDays: number;
  };
  bank: {
    accountNumber: string;
    bankName: string;
    ifscCode: string;
    branchName: string;
  };
  legalIdentity: {
    panNumber: string;
    aadhaarNumber: string;
    uanNumber?: string;
    passportNumber?: string;
  };
}

// Form Builder Field Schema (stored in app_settings/employee_form_schema)
export type FormSectionType = 'Identity' | 'Job Details' | 'Access Flags' | 'Custom Attributes';
export type FormFieldType = 'text' | 'number' | 'email' | 'date' | 'select' | 'boolean' | 'textarea';

export interface DynamicFormField {
  id: string;
  key: string;
  label: string;
  section: FormSectionType;
  type: FormFieldType;
  required: boolean;
  options?: string[]; // for 'select'
  placeholder?: string;
  isSystem?: boolean; // system fields cannot be deleted, only reordered/edited
  order: number;
}

// Compensation Lock Settings (showup_compensation_lock)
export type CompensationLockMode = 'unlocked' | 'selective' | 'all';

export interface CompensationLockConfig {
  id: string; // 'global_lock'
  mode: CompensationLockMode;
  selectiveModeType: 'whitelist' | 'blacklist';
  selectedEmployeeIds: string[];
  lockMessage: string;
  updatedBy: string;
  updatedAt: string;
}

// Perform Module Lock Settings (perform_config/perform_lock)
export type PerformLockMode = 'unlocked' | 'selective' | 'all';

export interface PerformLockConfig {
  id: string; // 'perform_lock'
  mode: PerformLockMode;
  selectiveModeType: 'whitelist' | 'blacklist';
  selectedEmployeeIds: string[];
  lockMessage: string;
  updatedBy: string;
  updatedAt: string;
}

// Notifications (notifications)
export interface AppNotification {
  id: string;
  recipientId: string; // employeeId or 'ALL'
  title: string;
  message: string;
  route: AppRoute;
  read: boolean;
  createdAt: string;
  actorName?: string;
}

// Audit Logs (audit_logs)
export interface AuditLogEntry {
  id: string;
  action: string;
  actorId: string;
  actorName: string;
  actorRole: CorporateRole;
  targetId: string;
  targetType: string;
  details: string;
  timestamp: string;
}

// Fiscal Settings (app_settings/fiscal_settings)
export interface FiscalSettings {
  id: string; // 'fiscal_settings'
  fiscalYear: string; // 'FY 2024-25' | 'FY 2025-26' | 'FY 2026-27' | 'FY 2027-28'
  quarter: Quarter;
  updatedAt: string;
  updatedBy: string;
}

// 2. Perform Module Types
export type ScoringFormula =
  | 'DIRECT_PROPORTION'
  | 'INVERSE_PROPORTION'
  | 'STEP_MILESTONE'
  | 'SLAB_SCALE'
  | 'BOOLEAN_BINARY';

export type PerformancePillar =
  | 'Delivery & Quality'
  | 'Technical/Domain Excellence'
  | 'Leadership & Ownership'
  | 'Client & Process Impact';

export type AppraisalLifecycleStatus =
  | 'Draft'
  | 'Submitted to Manager'
  | 'Manager Review'
  | 'CEO Reviewed'
  | 'Final Evaluation Released';

export type LetterGrade = 'A+' | 'A' | 'B' | 'C' | 'D';

export interface PerformKpiMaster {
  id: string; // e.g. KPI-L1-01
  level: number; // 1 to 5
  code: string;
  title: string;
  description: string;
  category: PerformancePillar;
  target: number;
  unit: string;
  weightage: number; // 15 KPIs per level summing to 100
  scoringFormula: ScoringFormula;
  isHighImpact?: boolean;
}

export interface PerformScorecardItem {
  kpiId: string;
  title: string;
  description: string;
  category: string;
  target: number;
  unit: string;
  weightage: number;
  scoringFormula: ScoringFormula;
  actual: number;
  selfScore: number;
  managerScore: number;
  ceoScore: number;
  selfJustification?: string;
  managerComments?: string;
}

export interface PerformScorecard {
  id: string; // employeeId_fiscalYear_quarter
  employeeId: string;
  employeeName: string;
  employeeEcode: string;
  employeeLevel: number;
  department: string;
  reportingManagerId: string;
  fiscalYear: string;
  quarter: Quarter;
  status: AppraisalLifecycleStatus;
  items: PerformScorecardItem[];
  totalWeightedScore: number;
  grade: LetterGrade;
  manager1on1Notes?: string;
  ceoCalibrationNotes?: string;
  updatedAt?: string;
}

export interface PerformGradeConfig {
  id: string; // 'grade_cutoffs'
  cutoffs: {
    APlus: number; // default 90
    A: number;     // default 80
    B: number;     // default 70
    C: number;     // default 60
  };
  updatedAt: string;
}

export interface PerformComment {
  id: string;
  scorecardId: string;
  kpiId?: string; // optional: if specific to an inline KPI chat
  authorId: string;
  authorName: string;
  authorRole: CorporateRole;
  message: string;
  createdAt: string;
}

export interface PerformTaskOkr {
  id: string;
  employeeId: string;
  employeeName: string;
  title: string;
  deliverable: string;
  dueDate: string;
  progress: number; // 0 to 100
  status: 'Not Started' | 'In Progress' | 'Completed' | 'Blocked';
  mentorNotes?: string;
  updatedAt: string;
}

export interface InternRoadmapStage {
  stageNumber: 1 | 2 | 3 | 4;
  title: 'Orientation & Setup' | 'Bug Remediation' | 'Milestone Ownership' | 'Capstone Project';
  description: string;
  deliverables: string[];
  completed: boolean;
  completedAt?: string;
  mentorSignOff?: string;
}

export interface PerformInternRoadmap {
  id: string; // department or internId
  department: string;
  employeeId?: string; // if assigned to a specific intern, or 'TEMPLATE_Engineering'
  isTemplate: boolean;
  stages: InternRoadmapStage[];
  updatedAt: string;
}

export interface PerformInternDiscussion {
  id: string;
  internId: string;
  internName: string;
  mentorId: string;
  mentorName: string;
  reviewType: '1-Month Review' | 'Mid-Term Appraisal' | 'Final Capstone Evaluation';
  date: string;
  strengths: string;
  areasOfImprovement: string;
  qualitativeSummary: string;
  readinessRating: 'Exceeding Track' | 'On Track' | 'Needs Support';
  createdAt: string;
}

// 3. Show Up Module Types
export type AttendanceStatus =
  | 'Present'
  | 'Late'
  | 'Half-Day'
  | 'Absent'
  | 'WFH'
  | 'Holiday'
  | 'Weekly Off';

export interface ShowupAttendanceRecord {
  id: string; // employeeId_YYYY-MM-DD
  employeeId: string;
  employeeName?: string;
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  punches: Array<{
    type: 'IN' | 'OUT';
    timestamp: string;
    locationNote?: string;
  }>;
  breakMinutes?: number;
  totalHours: number;
  isLate: boolean;
  isHalfDay: boolean;
}

export interface ShowupPolicyConfig {
  id: string; // 'default_policy'
  shiftStart: string; // '09:30'
  shiftEnd: string;   // '18:30'
  standardHours: number; // 9.0
  graceCutoff: string;   // '10:00'
  lateMarksPerDeduction: number; // 3
  lateDeductionDays: number;     // 0.5
  halfDayMinHours: number;       // 4.5
  fullDayMinHours: number;       // 7.0
  elAdvanceNoticeDays: number;   // 15
  updatedAt: string;
}

export type LeaveType =
  | 'CL'
  | 'SL'
  | 'EL'
  | 'Optional'
  | 'Maternity'
  | 'Paternity'
  | 'Comp Off'
  | 'LWP';

export interface ShowupLeaveBalance {
  id: string; // employeeId
  employeeId: string;
  balances: Record<LeaveType, number>;
  lateMarksCount: number;
  lateLeaveDeducted: number;
  updatedAt: string;
}

export interface ShowupLeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  reportingManagerId: string;
  leaveType: LeaveType;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  days: number;
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  appliedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  managerComment?: string;
}

export interface ShowupRegularization {
  id: string;
  employeeId: string;
  employeeName: string;
  reportingManagerId: string;
  date: string; // YYYY-MM-DD
  requestedPunchIn: string;  // HH:mm
  requestedPunchOut: string; // HH:mm
  reason: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  createdAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

export interface ShowupHoliday {
  id: string;
  date: string; // YYYY-MM-DD
  name: string;
  type: 'National' | 'Regional' | 'Optional';
}

export interface ShowupSalaryStructure {
  id: string; // employeeId
  employeeId: string;
  employeeName: string;
  employeeEcode: string;
  annualCtc: number;
  monthlyGross: number;
  basic: number; // 50% of Gross
  hra: number;   // 50% of Basic
  conveyance: number; // 1600
  medical: number;    // 1250
  specialAllowance: number; // Balancing figure
  employeePf: number; // 12% of Basic (capped at ₹1,800 or statutory)
  employerPf: number; // 12% of Basic
  professionalTax: number; // 200
  tdsMonthly: number;
  updatedAt: string;
}

export interface ShowupPayslip {
  id: string; // employeeId_YYYY-MM
  employeeId: string;
  employeeName: string;
  employeeEcode: string;
  designation: string;
  department: string;
  month: string; // YYYY-MM
  paidDays: number;
  lwpDays: number;
  lateDeductionDays: number;
  grossEarnings: number;
  basic: number;
  hra: number;
  conveyance: number;
  medical: number;
  specialAllowance: number;
  employeePf: number;
  employerPf: number;
  professionalTax: number;
  tds: number;
  lwpDeduction: number;
  totalDeductions: number;
  netPay: number;
  netPayInWords: string;
  generatedAt: string;
  generatedBy: string;
}

export type DocumentCategory =
  | 'Education Certificates'
  | 'Employment/Legal'
  | 'Identity/Tax'
  | 'Other';

export type DocumentVerificationStatus = 'Pending Verification' | 'Verified' | 'Rejected';

export interface ShowupDocument {
  id: string;
  employeeId: string;
  employeeName: string;
  title: string;
  category: DocumentCategory;
  fileName: string;
  fileType: string;
  fileSizeKb: number;
  fileDataUrl?: string; // base64 or reference
  status: DocumentVerificationStatus;
  verifiedBy?: string;
  verifiedAt?: string;
  rejectionReason?: string;
  uploadedAt: string;
}

// 4. Connect (CRM) Module Types
export type LeadSource =
  | 'Website'
  | 'Referral'
  | 'Cold Outreach'
  | 'Event'
  | 'Partner'
  | 'Inbound Call'
  | 'Other';

export type DealStage =
  | 'Lead'
  | 'Contacted'
  | 'Discovery'
  | 'Proposal'
  | 'Negotiation'
  | 'Won'
  | 'Lost';

export type WonReason = 'Price' | 'Feature' | 'Relationship' | 'Speed';
export type LostReason = 'Competitor' | 'Budget' | 'Timing' | 'Ghosted' | 'Other';
export type LeadActivityType = 'Call' | 'Email' | 'Meeting' | 'Note';

export interface LeadStageHistory {
  id: string;
  fromStage: string;
  toStage: string;
  timestamp: string;
  changedByName: string;
  reason?: string;
}

export interface LeadActivity {
  id: string;
  type: LeadActivityType;
  date: string;
  durationOrSummary: string;
  notes: string;
  authorName: string;
  createdAt: string;
}

export interface Lead {
  id: string;
  title: string;
  company: string;
  contactName: string;
  email: string;
  phone: string;
  source: LeadSource;
  assignedRepId: string;
  assignedRepName: string;
  value: number; // In INR (₹)
  expectedCloseDate: string;
  stage: DealStage;
  wonReason?: WonReason;
  lostReason?: LostReason;
  closeNotes?: string;
  stageHistory: LeadStageHistory[];
  activities: LeadActivity[];
  createdAt: string;
  updatedAt: string;
}
