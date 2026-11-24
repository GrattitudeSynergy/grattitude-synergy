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
    dateOfBirth?: string; // YYYY-MM-DD (used for Employee Events Calendar Birthdays)
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
  shiftConfig?: EmployeeShiftAssignment;
  shiftHistory?: EmployeeShiftHistoryEntry[];
}

export interface EmployeeShiftAssignment {
  shiftStart: string; // HH:mm e.g. '11:00'
  shiftEnd: string;   // HH:mm e.g. '20:00'
  effectiveDate: string; // YYYY-MM-DD
  graceMinutes?: number; // default 35 (e.g. 09:30 -> 10:05 AM, 11:00 -> 11:35 AM)
  isCustomShift: boolean;
  updatedBy: string;
  updatedAt: string;
  remarks?: string;
}

export interface EmployeeShiftHistoryEntry {
  id: string;
  employeeId: string;
  previousShiftStart: string;
  previousShiftEnd: string;
  newShiftStart: string;
  newShiftEnd: string;
  effectiveDate: string;
  action: 'ASSIGNED' | 'UPDATED' | 'RESET_TO_DEFAULT';
  changedBy: string;
  changedAt: string;
  remarks?: string;
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
export type TargetValueType = 'Text' | 'Number' | 'Percentage';

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
  | 'Client & Process Impact'
  | (string & {});

export interface PerformPillarsConfig {
  id: string; // 'performance_pillars'
  pillars: string[];
  updatedAt: string;
}

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
  target?: number | string; // Optional Default Target (Text, Number, or Percentage)
  targetType?: TargetValueType; // Data type of Target Value
  showTarget?: boolean; // Controls whether the target is visible (default true)
  unit: string;
  weightage: number; // 15 KPIs per level summing to 100
  scoringFormula?: ScoringFormula;
  isHighImpact?: boolean;
}

export interface PerformScorecardItem {
  kpiId: string;
  title: string;
  description: string;
  category: string;
  target?: number | string; // Optional Default Target (Text, Number, or Percentage)
  targetType?: TargetValueType; // Data type of Target Value
  showTarget?: boolean; // Controls whether the target is visible (default true)
  isCustomized?: boolean; // Admin KPI Assignment override: title/description/target/weightage set per employee+quarter
  unit: string;
  weightage: number;
  scoringFormula?: ScoringFormula;
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
  kpiAssignedBy?: string; // Admin who last edited this quarter's KPI sheet
  kpiAssignedAt?: string;
  isAdminDraft?: boolean; // True when saved by Admin as an unassigned draft
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

export type AttendanceLocationStatus =
  | 'In Office'
  | 'Outside Office'
  | 'Location Unavailable'
  | 'Office'; // Legacy value normalized to 'In Office'

export type NormalizedLocationStatus =
  | 'In Office'
  | 'Outside Office'
  | 'Location Unavailable';

export type AttendanceDeviceType =
  | 'Mobile Phone'
  | 'Tablet'
  | 'Laptop/Desktop'
  | 'Unknown';

export interface AttendanceDeviceInfo {
  deviceType: AttendanceDeviceType;
  os: string;
  browser: string;
  userAgent: string;
}

export interface OfficeLocationConfig {
  id: string; // 'office_location'
  officeName: string;
  latitude: number;
  longitude: number;
  radiusMeters: number; // Configurable geofence radius in meters
  accuracy?: number;
  updatedBy: string;
  updatedAt: string;
}

export interface AttendanceGeoLocation {
  latitude: number;
  longitude: number;
  accuracy: number; // GPS accuracy in meters
  date: string; // YYYY-MM-DD
  timestamp: string; // ISO 8601 timestamp
  punchType: 'IN' | 'OUT';
  deviceType?: AttendanceDeviceType | 'Desktop / Laptop' | 'Mobile / Tablet';
  deviceInfo?: AttendanceDeviceInfo;
  locationStatus?: AttendanceLocationStatus;
  distanceFromOfficeMeters?: number;
}

export interface ShowupAttendanceRecord {
  id: string; // employeeId_YYYY-MM-DD
  employeeId: string;
  employeeName?: string;
  employeeEcode?: string;
  department?: string;
  date: string; // YYYY-MM-DD
  status: AttendanceStatus;
  punches: Array<{
    type: 'IN' | 'OUT';
    timestamp: string;
    locationNote?: string;
    gpsLocation?: AttendanceGeoLocation;
    deviceInfo?: AttendanceDeviceInfo;
    locationStatus?: NormalizedLocationStatus;
    distanceFromOfficeMeters?: number;
  }>;
  // Independent Check-In location & device details
  checkInTimestamp?: string;
  checkInLocation?: AttendanceGeoLocation;
  checkInLocationStatus?: NormalizedLocationStatus;
  checkInDistanceFromOfficeMeters?: number;
  checkInLocationUnavailableReason?: string;
  checkInDevice?: AttendanceDeviceInfo;
  // Independent Check-Out location & device details
  checkOutTimestamp?: string;
  checkOutLocation?: AttendanceGeoLocation;
  checkOutLocationStatus?: NormalizedLocationStatus;
  checkOutDistanceFromOfficeMeters?: number;
  checkOutLocationUnavailableReason?: string;
  checkOutDevice?: AttendanceDeviceInfo;
  // Legacy / summary aliases (reflects Check-In for backwards compatibility)
  locationStatus?: AttendanceLocationStatus;
  distanceFromOfficeMeters?: number;
  locationUnavailableReason?: string;
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
  elAdvanceNoticeDays: number;   // 5
  clQuotaPerYear?: number;       // 0
  slQuotaPerYear?: number;       // 12
  elQuotaPerYear?: number;       // 12
  optionalHolidaysPerYear?: number; // 3
  wfhRemoteDaysPerMonth?: number;   // 4
  compOffApplyWindowDays?: number;  // 2
  compOffValidityDays?: number;     // 30
  maternityQuotaDays?: number;      // 180
  paternityQuotaDays?: number;      // 15
  compOffQuotaDays?: number;        // 2
  lwpQuotaDays?: number;            // 365
  updatedAt: string;
}

export type LeaveCategorySection = 'EL' | 'CSL' | 'AL' | 'WFH';

export type LeaveType =
  | 'EL'
  | 'CSL'
  | 'CL'
  | 'SL'
  | 'Optional'
  | 'Maternity'
  | 'Paternity'
  | 'Bereavement'
  | 'Comp Off'
  | 'Special Leave'
  | 'LWP';

export interface AdditionalLeaveTypeConfig {
  id: string; // e.g. 'AL_MATERNITY', 'AL_PATERNITY', 'AL_BEREAVEMENT', 'AL_COMP_OFF', 'AL_SPECIAL', 'AL_LWP'
  code: LeaveType | string;
  name: string;
  description: string;
  annualAllocationDays: number;
  eligibilityRule: string;
  requiresApproval: boolean;
  allowCarryForward: boolean;
  isActive: boolean;
  updatedAt: string;
  updatedBy?: string;
}

export interface LeaveTransactionEntry {
  id: string;
  employeeId: string;
  employeeName?: string;
  section: 'EL' | 'CSL' | 'AL' | 'WFH';
  leaveType: string;
  transactionType:
    | 'OPENING_BALANCE'
    | 'MONTHLY_CREDIT'
    | 'LEAVE_USED'
    | 'LATE_MARK_DEDUCTION'
    | 'YEAR_END_CARRY_FORWARD'
    | 'YEAR_END_LAPSE'
    | 'ADMIN_ADJUSTMENT';
  amount: number; // positive for credit/opening, negative for deduction/lapse
  balanceAfter: number;
  effectiveDate: string; // YYYY-MM-DD
  monthKey?: string; // YYYY-MM for monthly accrual deduplication
  yearKey?: string;  // YYYY for year-end carry-forward deduplication
  remark: string;
  createdBy: string;
  createdAt: string;
}

export interface OpeningLeaveBalanceRecord {
  id: string; // opening_employeeId
  employeeId: string;
  employeeName: string;
  employeeEcode: string;
  openingEL: number;
  openingCSL: number;
  openingAL: Record<string, number>; // e.g. { Maternity: 180, Paternity: 15, Bereavement: 5, 'Comp Off': 2 }
  effectiveDate: string;
  remark: string;
  addedBy: string;
  addedById: string;
  addedAt: string;
  updatedAt?: string;
}

export interface ShowupLeaveBalance {
  id: string; // employeeId
  employeeId: string;
  balances: Record<string, number>;
  // Detailed EL tracking (1.5/month, 50% carry-forward capped at 9 days)
  elOpeningBalance?: number;
  elMonthlyCredits?: number;
  elCarriedForward?: number;
  elLapsedAtYearEnd?: number;
  elUsed?: number;
  elAvailable?: number;
  // Detailed CSL tracking (1.0/month, 0 carry-forward, 3 late marks = 0.5 CSL deduction)
  cslOpeningBalance?: number;
  cslMonthlyCredits?: number;
  cslUsed?: number;
  cslLateDeductions?: number;
  cslLapsedAtYearEnd?: number;
  cslAvailable?: number;
  // Monthly accrual & year-end tracking flags
  lastAccruedMonth?: string; // YYYY-MM
  lastYearEndProcessed?: number; // YYYY
  lateMarksCount: number;
  monthlyLateMarks?: Record<string, number>; // YYYY-MM -> count
  lateLeaveDeducted: number;
  transactions?: LeaveTransactionEntry[];
  updatedAt: string;
}

export interface ShowupLeaveRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  reportingManagerId: string;
  section?: LeaveCategorySection; // 'EL' | 'CSL' | 'AL' | 'WFH'
  leaveType: LeaveType | string;
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

export interface ShowupWfhRequest {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeEcode?: string;
  department: string;
  reportingManagerId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  days: number;
  monthKey: string;  // YYYY-MM (for enforcing max 4 WFH days/month)
  reason?: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  appliedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewerComment?: string;
}

// 5. Employee Exit & Notice Period Workflow Types (GreytHR Reference)
export type ExitWorkflowStage =
  | 'Resignation Submitted'
  | 'Manager Review'
  | 'Work Plan Uploaded'
  | 'HR Review'
  | 'Notice Period Active'
  | 'KT & Handover'
  | 'Departmental Clearance'
  | 'Asset Return'
  | 'Final Settlement'
  | 'Exit Confirmed';

export interface ExitWorkPlanTask {
  id: string;
  projectOrResponsibility: string;
  pendingTaskDescription: string;
  handoverDetails: string;
  ktRequirement: string;
  deadline: string; // YYYY-MM-DD
  handoverToEmployeeId: string;
  handoverToEmployeeName: string;
  status: 'Pending' | 'In Progress' | 'Completed';
}

export interface EmployeeExitRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeEcode: string;
  designation: string;
  department: string;
  reportingManagerId: string;
  reportingManagerName: string;
  resignationDate: string; // YYYY-MM-DD
  noticePeriodDays: number;
  proposedLastWorkingDay: string; // YYYY-MM-DD
  approvedLastWorkingDay?: string; // YYYY-MM-DD
  reasonCategory:
    | 'Career Growth / Better Opportunity'
    | 'Higher Education'
    | 'Relocation / Personal'
    | 'Health / Family Reasons'
    | 'Role / Compensation Alignment'
    | 'Other';
  detailedReason: string;
  currentStage: ExitWorkflowStage;
  status: 'Active Exit Process' | 'Withdrawn' | 'Rejected' | 'Completed & Exited';
  // Manager Work Plan Upload (Mandatory within 2 days of resignation submission)
  workPlanDueDate: string; // ISO or YYYY-MM-DD (+2 days from resignation submission)
  workPlanUploadedAt?: string;
  workPlanUploadedBy?: string;
  workPlanSummary?: string;
  workPlanTasks: ExitWorkPlanTask[];
  // 10-Stage Checklist statuses
  stageChecklist: {
    resignationSubmitted: { completed: boolean; completedAt?: string; actor?: string; notes?: string };
    managerReview: { completed: boolean; completedAt?: string; actor?: string; notes?: string };
    workPlanUpload: { completed: boolean; completedAt?: string; actor?: string; notes?: string };
    hrReview: { completed: boolean; completedAt?: string; actor?: string; notes?: string };
    noticePeriodTracking: { completed: boolean; completedAt?: string; actor?: string; notes?: string };
    ktAndHandover: { completed: boolean; completedAt?: string; actor?: string; notes?: string };
    departmentalClearance: { completed: boolean; completedAt?: string; actor?: string; notes?: string };
    assetReturn: { completed: boolean; completedAt?: string; actor?: string; notes?: string };
    finalSettlement: { completed: boolean; completedAt?: string; actor?: string; notes?: string };
    finalExitConfirmation: { completed: boolean; completedAt?: string; actor?: string; notes?: string };
  };
  createdAt: string;
  updatedAt: string;
}

// 6. Employee Events Calendar Config (app_settings/events_calendar_config)
export interface EventsCalendarConfig {
  id: string; // 'events_calendar_config'
  showBirthdaysToEmployees: boolean;
  showAnniversariesToEmployees: boolean;
  showJoiningDatesToEmployees: boolean;
  updatedBy: string;
  updatedAt: string;
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
