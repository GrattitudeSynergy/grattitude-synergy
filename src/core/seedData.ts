import {
  FirestoreEngine,
  AuthEngine,
  getDeletedDocsMap,
  synchronizeWithCentralDatabase,
} from './firebase/firebaseConfig';
import { KPI_MASTER_SEED } from '../modules/perform/kpiMasterSeed';
import type {
  Employee,
  PerformInternRoadmap,
  ShowupPolicyConfig,
  CompensationLockConfig,
  PerformLockConfig,
  PerformGradeConfig,
  FiscalSettings,
  DynamicFormField,
} from './types';

// ============================================================================
// PRE-SEEDED DATA SPECIFICATION (seedData.ts)
// ============================================================================
// 1. Employees: EMP-001 (Corporate Super Admin) + 13 Grattitude Synergy Workforce
//    Members (#GSL002 to GSLP04).
// 2. Perform Master Catalog: 75 KPIs (15 per level for Levels 1 to 5, 100% weight).
// 3. Intern Roadmaps: 4-stage roadmaps for Engineering, Marketing, Operations,
//    and Business Development.
// 4. Show Up HRMS Policy: Shift 09:30–18:30, 10:00 AM grace cutoff, 3 late marks =
//    0.5 day deduction, 15-day EL notice.
// 5. Connect CRM: No seed leads (starts empty).
// ============================================================================

export const DEFAULT_ADMIN_PASSWORD = 'Admin@123';
export const DEFAULT_EMPLOYEE_PASSWORD = 'Welcome@123';

const EMPTY_PROFILE_DETAILS = {
  personal: {
    address: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    phone: '',
  },
  employment: {
    workLocation: 'Bengaluru HQ',
    probationPeriodMonths: 3,
    noticePeriodDays: 30,
  },
  bank: {
    accountNumber: '',
    bankName: '',
    ifscCode: '',
    branchName: '',
  },
  legalIdentity: {
    panNumber: '',
    aadhaarNumber: '',
    uanNumber: '',
    passportNumber: '',
  },
};

export const SEED_ADMIN_EMPLOYEE: Employee = {
  id: 'EMP-001',
  ecode: 'EMP-001',
  name: 'Corporate Super Admin',
  email: 'grattitudesynergyllp@gmail.com',
  designation: 'Director — Enterprise Systems & People Operations',
  department: 'Executive Administration',
  vertical: 'Corporate Shared Services',
  level: 5,
  role: 'Admin',
  reportingManagerId: '',
  dateOfJoining: '2024-04-01',
  status: 'Active',
  isManager: true,
  hasCrmAccess: true,
  isAssociate: false,
  isAccountsStaff: true,
  mustChangePassword: false,
  passwordHash: DEFAULT_ADMIN_PASSWORD,
  updatedAt: '2026-11-04T00:00:00.000Z',
  personal: {
    address: 'Grattitude Synergy HQ, Prestige Tech Park, Bengaluru, KA 560103',
    emergencyContactName: 'Corporate Security Desk',
    emergencyContactPhone: '+91 80 4090 1100',
    phone: '+91 98450 00001',
  },
  employment: {
    workLocation: 'Bengaluru HQ (Hybrid)',
    probationPeriodMonths: 0,
    noticePeriodDays: 90,
  },
  bank: {
    accountNumber: '50100482910421',
    bankName: 'HDFC Bank Ltd',
    ifscCode: 'HDFC0001204',
    branchName: 'Marathahalli Corporate Branch',
  },
  legalIdentity: {
    panNumber: 'ABCDE1234F',
    aadhaarNumber: '4829-1039-8472',
    uanNumber: '100948271625',
    passportNumber: 'Z4928174',
  },
};

export const SEED_INITIAL_EMPLOYEES: Employee[] = [
  SEED_ADMIN_EMPLOYEE,
  {
    id: '#GSL002',
    ecode: '#GSL002',
    name: 'Kiran Giri',
    email: 'kiran.giri@grattitude.in',
    designation: 'Consultant',
    department: 'Engineering',
    vertical: 'Corporate Shared Services',
    level: 3,
    role: 'Employee',
    reportingManagerId: 'GSLP04',
    dateOfJoining: '2025-04-01',
    status: 'Active',
    isManager: false,
    hasCrmAccess: false,
    isAssociate: false,
    isAccountsStaff: false,
    mustChangePassword: true,
    passwordHash: DEFAULT_EMPLOYEE_PASSWORD,
    updatedAt: '2026-11-04T00:00:00.000Z',
    ...EMPTY_PROFILE_DETAILS,
  },
  {
    id: '#GSL003',
    ecode: '#GSL003',
    name: 'Nikhil Fulari',
    email: 'nikhil.fulari@grattitude.in',
    designation: 'Senior Engineer',
    department: 'Engineering',
    vertical: 'Corporate Shared Services',
    level: 2,
    role: 'Employee',
    reportingManagerId: 'GSLP04',
    dateOfJoining: '2025-04-01',
    status: 'Active',
    isManager: false,
    hasCrmAccess: false,
    isAssociate: true,
    isAccountsStaff: false,
    mustChangePassword: true,
    passwordHash: DEFAULT_EMPLOYEE_PASSWORD,
    updatedAt: '2026-11-04T00:00:00.000Z',
    ...EMPTY_PROFILE_DETAILS,
  },
  {
    id: '#GSL004',
    ecode: '#GSL004',
    name: 'Prithvi Bhatt',
    email: 'prithvi.bhatt@grattitude.in',
    designation: 'Consultant',
    department: 'Engineering',
    vertical: 'Corporate Shared Services',
    level: 3,
    role: 'Manager',
    reportingManagerId: '#GSLP01',
    dateOfJoining: '2025-04-01',
    status: 'Active',
    isManager: true,
    hasCrmAccess: false,
    isAssociate: false,
    isAccountsStaff: false,
    mustChangePassword: true,
    passwordHash: DEFAULT_EMPLOYEE_PASSWORD,
    updatedAt: '2026-11-04T00:00:00.000Z',
    ...EMPTY_PROFILE_DETAILS,
  },
  {
    id: '#GSL006',
    ecode: '#GSL006',
    name: 'Rahul Sonawane',
    email: 'rahul.sonawane@grattitude.in',
    designation: 'Senior Engineer',
    department: 'Engineering',
    vertical: 'Corporate Shared Services',
    level: 2,
    role: 'Employee',
    reportingManagerId: 'GSLP04',
    dateOfJoining: '2025-04-01',
    status: 'Active',
    isManager: false,
    hasCrmAccess: false,
    isAssociate: true,
    isAccountsStaff: false,
    mustChangePassword: true,
    passwordHash: DEFAULT_EMPLOYEE_PASSWORD,
    updatedAt: '2026-11-04T00:00:00.000Z',
    ...EMPTY_PROFILE_DETAILS,
  },
  {
    id: '#GSL014',
    ecode: '#GSL014',
    name: 'Aditi Gavande',
    email: 'aditi.gavande@grattitude.in',
    designation: 'Senior Analyst',
    department: 'Engineering',
    vertical: 'Corporate Shared Services',
    level: 2,
    role: 'Employee',
    reportingManagerId: 'GSLP04',
    dateOfJoining: '2025-04-01',
    status: 'Active',
    isManager: false,
    hasCrmAccess: false,
    isAssociate: true,
    isAccountsStaff: false,
    mustChangePassword: true,
    passwordHash: DEFAULT_EMPLOYEE_PASSWORD,
    updatedAt: '2026-11-04T00:00:00.000Z',
    ...EMPTY_PROFILE_DETAILS,
  },
  {
    id: '#GSL016',
    ecode: '#GSL016',
    name: 'Shishir Bidgar',
    email: 'shishir.bidgar@grattitude.in',
    designation: 'Assistant Manager',
    department: 'Business Development',
    vertical: 'Growth & Revenue',
    level: 2,
    role: 'Employee',
    reportingManagerId: '#GSLP01',
    dateOfJoining: '2025-04-01',
    status: 'Active',
    isManager: false,
    hasCrmAccess: false,
    isAssociate: true,
    isAccountsStaff: false,
    mustChangePassword: true,
    passwordHash: DEFAULT_EMPLOYEE_PASSWORD,
    updatedAt: '2026-11-04T00:00:00.000Z',
    ...EMPTY_PROFILE_DETAILS,
  },
  {
    id: '#GSL017',
    ecode: '#GSL017',
    name: 'Shravani Mhetar',
    email: 'shravani.mhetar@grattitude.in',
    designation: 'Assistant Manager',
    department: 'Business Development',
    vertical: 'Growth & Revenue',
    level: 2,
    role: 'Employee',
    reportingManagerId: '#GSLP01',
    dateOfJoining: '2025-04-01',
    status: 'Active',
    isManager: false,
    hasCrmAccess: false,
    isAssociate: true,
    isAccountsStaff: false,
    mustChangePassword: true,
    passwordHash: DEFAULT_EMPLOYEE_PASSWORD,
    updatedAt: '2026-11-04T00:00:00.000Z',
    ...EMPTY_PROFILE_DETAILS,
  },
  {
    id: '#GSL021',
    ecode: '#GSL021',
    name: 'Bhupesh Mastud',
    email: 'bhupesh.mastud@grattitude.in',
    designation: 'Project Engineer',
    department: 'Engineering',
    vertical: 'Corporate Shared Services',
    level: 1,
    role: 'Employee',
    reportingManagerId: '#GSL004',
    dateOfJoining: '2025-04-01',
    status: 'Active',
    isManager: false,
    hasCrmAccess: false,
    isAssociate: true,
    isAccountsStaff: false,
    mustChangePassword: true,
    passwordHash: DEFAULT_EMPLOYEE_PASSWORD,
    updatedAt: '2026-11-04T00:00:00.000Z',
    ...EMPTY_PROFILE_DETAILS,
  },
  {
    id: '#GSL023',
    ecode: '#GSL023',
    name: 'Tanvi Ganorkar',
    email: 'tanvi.ganorkar@grattitude.in',
    designation: 'Senior Analyst',
    department: 'Engineering',
    vertical: 'Corporate Shared Services',
    level: 2,
    role: 'Employee',
    reportingManagerId: 'GSLP04',
    dateOfJoining: '2025-04-01',
    status: 'Active',
    isManager: false,
    hasCrmAccess: false,
    isAssociate: true,
    isAccountsStaff: false,
    mustChangePassword: true,
    passwordHash: DEFAULT_EMPLOYEE_PASSWORD,
    updatedAt: '2026-11-04T00:00:00.000Z',
    ...EMPTY_PROFILE_DETAILS,
  },
  {
    id: '#GSL024',
    ecode: '#GSL024',
    name: 'Vinayak Swami',
    email: 'vinayak.swami@grattitude.in',
    designation: 'Project Engineer',
    department: 'Engineering',
    vertical: 'Corporate Shared Services',
    level: 1,
    role: 'Employee',
    reportingManagerId: '#GSL004',
    dateOfJoining: '2025-04-01',
    status: 'Active',
    isManager: false,
    hasCrmAccess: false,
    isAssociate: true,
    isAccountsStaff: false,
    mustChangePassword: true,
    passwordHash: DEFAULT_EMPLOYEE_PASSWORD,
    updatedAt: '2026-11-04T00:00:00.000Z',
    ...EMPTY_PROFILE_DETAILS,
  },
  {
    id: '#GSLP01',
    ecode: '#GSLP01',
    name: 'Akshay Pahade',
    email: 'akshay.pahade@grattitude.in',
    designation: 'Managing Patner',
    department: 'Executive Administration',
    vertical: 'Strategic Advisory',
    level: 5,
    role: 'CEO',
    reportingManagerId: '',
    dateOfJoining: '2024-04-01',
    status: 'Active',
    isManager: true,
    hasCrmAccess: true,
    isAssociate: false,
    isAccountsStaff: false,
    mustChangePassword: true,
    passwordHash: DEFAULT_EMPLOYEE_PASSWORD,
    updatedAt: '2026-11-04T00:00:00.000Z',
    ...EMPTY_PROFILE_DETAILS,
  },
  {
    id: 'GSL000',
    ecode: 'GSL000',
    name: 'Tanisha Godha',
    email: 'tanisha.godha@grattitude.in',
    designation: 'Business & Operations Analyst',
    department: 'Engineering',
    vertical: 'Growth & Revenue',
    level: 0,
    role: 'Employee',
    reportingManagerId: '#GSLP01',
    dateOfJoining: '2025-04-01',
    status: 'Active',
    isManager: false,
    hasCrmAccess: false,
    isAssociate: false,
    isAccountsStaff: false,
    mustChangePassword: true,
    passwordHash: DEFAULT_EMPLOYEE_PASSWORD,
    updatedAt: '2026-11-04T00:00:00.000Z',
    ...EMPTY_PROFILE_DETAILS,
  },
  {
    id: 'GSLP04',
    ecode: 'GSLP04',
    name: 'Anindita Roy',
    email: 'anindita.roy@grattitude.in',
    designation: 'Operations Head',
    department: 'Operations',
    vertical: 'Strategic Advisory',
    level: 4,
    role: 'Manager',
    reportingManagerId: '#GSLP01',
    dateOfJoining: '2024-06-01',
    status: 'Active',
    isManager: true,
    hasCrmAccess: false,
    isAssociate: false,
    isAccountsStaff: false,
    mustChangePassword: true,
    passwordHash: DEFAULT_EMPLOYEE_PASSWORD,
    updatedAt: '2026-11-04T00:00:00.000Z',
    ...EMPTY_PROFILE_DETAILS,
  },
];

export const SEED_INTERN_ROADMAPS: PerformInternRoadmap[] = [
  {
    id: 'ROADMAP-Engineering',
    department: 'Engineering',
    isTemplate: true,
    updatedAt: new Date().toISOString(),
    stages: [
      {
        stageNumber: 1,
        title: 'Orientation & Setup',
        description: 'Complete local environment setup, repository access, architecture walkthrough, and Git/CI workflow standards.',
        deliverables: [
          'Configure IDE, Docker/Node toolchains, and access repositories',
          'Complete Security & Code Hygiene workshop',
          'Submit first documentation PR through standard code review',
        ],
        completed: false,
      },
      {
        stageNumber: 2,
        title: 'Bug Remediation',
        description: 'Diagnose and resolve triaged low-to-medium severity defects across core modules with unit tests.',
        deliverables: [
          'Resolve 5 triaged bug tickets from sprint backlog',
          'Write automated regression unit tests (>=85% coverage on diffs)',
          'Shadow production release verification with L3 mentor',
        ],
        completed: false,
      },
      {
        stageNumber: 3,
        title: 'Milestone Ownership',
        description: 'Take end-to-end ownership of a scoped feature component from technical spec to staging deployment.',
        deliverables: [
          'Author concise technical specification & API contract',
          'Build, test, and pass QA verification on first pass',
          'Demo feature at bi-weekly Engineering Sprint Review',
        ],
        completed: false,
      },
      {
        stageNumber: 4,
        title: 'Capstone Project',
        description: 'Deliver a production-ready capstone initiative solving an operational or product scalability challenge.',
        deliverables: [
          'End-to-end architecture, implementation, and telemetry setup',
          'Operational runbook and handover documentation',
          'Final Capstone Defense presentation to Department Manager',
        ],
        completed: false,
      },
    ],
  },
  {
    id: 'ROADMAP-Marketing',
    department: 'Marketing',
    isTemplate: true,
    updatedAt: new Date().toISOString(),
    stages: [
      {
        stageNumber: 1,
        title: 'Orientation & Setup',
        description: 'Master brand voice guidelines, ICP personas, analytics stack, and content calendar workflows.',
        deliverables: [
          'Complete Brand Architecture & Positioning certification',
          'Audit 10 competitor collateral pieces and present summary',
          'Set up campaign tracking & UTM taxonomy templates',
        ],
        completed: false,
      },
      {
        stageNumber: 2,
        title: 'Bug Remediation',
        description: 'Audit existing landing pages, SEO metadata, and nurture sequences to fix conversion bottlenecks.',
        deliverables: [
          'Fix broken links, meta descriptions, and copy gaps across 15 pages',
          'Optimize 3 underperforming email nurture drip templates',
          'Standardize CRM lead source attribution tags',
        ],
        completed: false,
      },
      {
        stageNumber: 3,
        title: 'Milestone Ownership',
        description: 'Own and execute a targeted multi-channel demand generation micro-campaign.',
        deliverables: [
          'Draft campaign brief, creative assets, and distribution schedule',
          'Launch campaign across LinkedIn, email, and web channels',
          'Publish post-campaign conversion & CPL attribution report',
        ],
        completed: false,
      },
      {
        stageNumber: 4,
        title: 'Capstone Project',
        description: 'Design and execute a comprehensive GTM launch playbook or high-converting pillar asset.',
        deliverables: [
          'Produce flagship whitepaper / webinar funnel end-to-end',
          'Generate measurable MQL pipeline contribution',
          'Present ROI analysis to Marketing Leadership',
        ],
        completed: false,
      },
    ],
  },
  {
    id: 'ROADMAP-Operations',
    department: 'Operations',
    isTemplate: true,
    updatedAt: new Date().toISOString(),
    stages: [
      {
        stageNumber: 1,
        title: 'Orientation & Setup',
        description: 'Understand corporate SOPs, vendor workflows, SLA trackers, and compliance governance.',
        deliverables: [
          'Complete HRMS, Procurement, and Audit workflow walkthroughs',
          'Map 3 core internal operational processes in flow diagrams',
          'Shadow daily cross-functional operations standup',
        ],
        completed: false,
      },
      {
        stageNumber: 2,
        title: 'Bug Remediation',
        description: 'Reconcile data discrepancies, clear backlog tickets, and fix documentation gaps.',
        deliverables: [
          'Reconcile 100% of pending vendor/asset inventory records',
          'Resolve 15 internal service desk operational requests within SLA',
          'Update outdated SOP checklists with zero compliance errors',
        ],
        completed: false,
      },
      {
        stageNumber: 3,
        title: 'Milestone Ownership',
        description: 'Independently manage a recurring weekly/monthly operational reporting and SLA cycle.',
        deliverables: [
          'Automate weekly department SLA compliance dashboard',
          'Coordinate cross-team monthly audit readiness review',
          'Reduce process turnaround time by at least 10%',
        ],
        completed: false,
      },
      {
        stageNumber: 4,
        title: 'Capstone Project',
        description: 'Re-engineer an operational workflow to eliminate manual bottlenecks and improve audit accuracy.',
        deliverables: [
          'Process optimization blueprint with before/after time study',
          'Rollout revised workflow & train stakeholder teams',
          'Executive readout on annualized efficiency gains',
        ],
        completed: false,
      },
    ],
  },
  {
    id: 'ROADMAP-Business Development',
    department: 'Business Development',
    isTemplate: true,
    updatedAt: new Date().toISOString(),
    stages: [
      {
        stageNumber: 1,
        title: 'Orientation & Setup',
        description: 'Learn enterprise value proposition, discovery call frameworks, objection handling, and Connect CRM.',
        deliverables: [
          'Pass mock discovery & pitch certification with Sales Manager',
          'Build target account list of 50 qualified enterprise prospects',
          'Master Connect CRM stage hygiene and activity logging rules',
        ],
        completed: false,
      },
      {
        stageNumber: 2,
        title: 'Bug Remediation',
        description: 'Cleanse dormant CRM records, re-engage stalled leads, and refine outreach cadences.',
        deliverables: [
          'Enrich and validate contact data for 100 pipeline records',
          'Execute re-engagement sequence on 25 dormant leads',
          'Document top 5 prospect objections with refined rebuttal scripts',
        ],
        completed: false,
      },
      {
        stageNumber: 3,
        title: 'Milestone Ownership',
        description: 'Own full outbound prospecting and qualification cycle to book discovery meetings.',
        deliverables: [
          'Execute multi-touch outbound cadence (Calls + Emails)',
          'Qualify and book 8 discovery meetings for Senior Reps',
          'Maintain 100% same-day CRM activity logging accuracy',
        ],
        completed: false,
      },
      {
        stageNumber: 4,
        title: 'Capstone Project',
        description: 'Develop a vertical-specific outbound playbook and co-lead a deal through Proposal stage.',
        deliverables: [
          'Author vertical market penetration playbook',
          'Co-present product discovery & proposal deck on live opportunity',
          'Final commercial pipeline presentation to Leadership',
        ],
        completed: false,
      },
    ],
  },
];

export const SEED_SHOWUP_POLICY: ShowupPolicyConfig = {
  id: 'default_policy',
  shiftStart: '09:30',
  shiftEnd: '18:30',
  standardHours: 9.0,
  graceCutoff: '10:00',
  lateMarksPerDeduction: 3,
  lateDeductionDays: 0.5,
  halfDayMinHours: 4.5,
  fullDayMinHours: 7.0,
  elAdvanceNoticeDays: 15,
  updatedAt: new Date().toISOString(),
};

export const SEED_COMPENSATION_LOCK: CompensationLockConfig = {
  id: 'global_lock',
  mode: 'unlocked',
  selectiveModeType: 'blacklist',
  selectedEmployeeIds: [],
  lockMessage:
    'Compensation, CTC structure, and statutory banking details are restricted by Corporate HR Policy during active appraisal calibration.',
  updatedBy: 'EMP-001',
  updatedAt: new Date().toISOString(),
};

export const SEED_PERFORM_LOCK: PerformLockConfig = {
  id: 'perform_lock',
  mode: 'unlocked',
  selectiveModeType: 'blacklist',
  selectedEmployeeIds: [],
  lockMessage:
    'The Perform (KPI Appraisal & OKR) module is currently locked by Corporate HR & Executive Administration during cycle freeze.',
  updatedBy: 'EMP-001',
  updatedAt: new Date().toISOString(),
};

export const SEED_GRADE_CONFIG: PerformGradeConfig = {
  id: 'grade_cutoffs',
  cutoffs: {
    APlus: 90,
    A: 80,
    B: 70,
    C: 60,
  },
  updatedAt: new Date().toISOString(),
};

export const SEED_FISCAL_SETTINGS: FiscalSettings = {
  id: 'fiscal_settings',
  fiscalYear: 'FY 2025-26',
  quarter: 'Q3',
  updatedAt: new Date().toISOString(),
  updatedBy: 'EMP-001',
};

export const SEED_DEFAULT_FORM_FIELDS: DynamicFormField[] = [
  {
    id: 'fld_ecode',
    key: 'ecode',
    label: 'Employee Code (E-Code)',
    section: 'Identity',
    type: 'text',
    required: true,
    placeholder: 'e.g. #GSL025',
    isSystem: true,
    order: 1,
  },
  {
    id: 'fld_name',
    key: 'name',
    label: 'Full Legal Name',
    section: 'Identity',
    type: 'text',
    required: true,
    placeholder: 'e.g. Aarav Mehta',
    isSystem: true,
    order: 2,
  },
  {
    id: 'fld_email',
    key: 'email',
    label: 'Official Email / Username',
    section: 'Identity',
    type: 'email',
    required: true,
    placeholder: 'firstname.lastname@grattitude.in',
    isSystem: true,
    order: 3,
  },
  {
    id: 'fld_designation',
    key: 'designation',
    label: 'Designation / Job Title',
    section: 'Job Details',
    type: 'text',
    required: true,
    placeholder: 'e.g. Senior Engineering Specialist',
    isSystem: true,
    order: 4,
  },
  {
    id: 'fld_department',
    key: 'department',
    label: 'Department',
    section: 'Job Details',
    type: 'select',
    required: true,
    options: [
      'Executive Administration',
      'Engineering',
      'Marketing',
      'Operations',
      'Business Development',
      'Finance & Accounts',
      'Human Resources',
    ],
    isSystem: true,
    order: 5,
  },
  {
    id: 'fld_vertical',
    key: 'vertical',
    label: 'Business Vertical',
    section: 'Job Details',
    type: 'select',
    required: true,
    options: [
      'Enterprise SaaS',
      'Cloud & Platform',
      'Growth & Revenue',
      'Corporate Shared Services',
      'Strategic Advisory',
    ],
    isSystem: true,
    order: 6,
  },
  {
    id: 'fld_doj',
    key: 'dateOfJoining',
    label: 'Date of Joining',
    section: 'Job Details',
    type: 'date',
    required: true,
    isSystem: true,
    order: 7,
  },
  {
    id: 'fld_crm',
    key: 'hasCrmAccess',
    label: 'Grant Connect (CRM) Pipeline Access',
    section: 'Access Flags',
    type: 'boolean',
    required: false,
    isSystem: true,
    order: 8,
  },
  {
    id: 'fld_is_manager',
    key: 'isManager',
    label: 'Designate as People Manager (Direct Reports)',
    section: 'Access Flags',
    type: 'boolean',
    required: false,
    isSystem: true,
    order: 9,
  },
  {
    id: 'fld_blood_group',
    key: 'bloodGroup',
    label: 'Blood Group',
    section: 'Custom Attributes',
    type: 'select',
    required: false,
    options: ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'],
    isSystem: false,
    order: 10,
  },
  {
    id: 'fld_tshirt_size',
    key: 'merchandiseSize',
    label: 'Corporate Kit Size',
    section: 'Custom Attributes',
    type: 'select',
    required: false,
    options: ['XS', 'S', 'M', 'L', 'XL', 'XXL'],
    isSystem: false,
    order: 11,
  },
];

const BOOTSTRAP_FLAG_KEY = 'gs_enterprise_bootstrapped_v1';

export async function initializeSeedData(): Promise<void> {
  const deletedDocs = getDeletedDocsMap();

  // 0. Ensure all 14 core Grattitude Synergy employees (EMP-001 + 13 GSL* employees)
  //    and their Auth credentials exist in local persistent storage on every device/browser.
  for (const seedEmp of SEED_INITIAL_EMPLOYEES) {
    if (deletedDocs[`employees:${seedEmp.id}`]) continue;

    const defaultPwd =
      seedEmp.id === 'EMP-001' ? DEFAULT_ADMIN_PASSWORD : DEFAULT_EMPLOYEE_PASSWORD;

    AuthEngine.ensureBootstrapAdminAuth(seedEmp.id, seedEmp.email, defaultPwd, {
      skipCloudPush: true,
    });

    const existingEmp = await FirestoreEngine.getDocument<Employee>('employees', seedEmp.id);
    if (!existingEmp) {
      await FirestoreEngine.setDocument('employees', seedEmp.id, seedEmp, {
        skipCloudPush: true,
      });
    }

    const existingBalance = await FirestoreEngine.getDocument(
      'showup_leave_balances',
      seedEmp.id
    );
    if (!existingBalance) {
      await FirestoreEngine.setDocument(
        'showup_leave_balances',
        seedEmp.id,
        {
          id: seedEmp.id,
          employeeId: seedEmp.id,
          balances: {
            CL: 12,
            SL: 10,
            EL: 15,
            Optional: 3,
            Maternity: 180,
            Paternity: 15,
            'Comp Off': 2,
            LWP: 365,
          },
          lateMarksCount: 0,
          lateLeaveDeducted: 0,
          updatedAt: '2026-11-04T00:00:00.000Z',
        },
        { skipCloudPush: true }
      );
    }
  }

  // Synchronize with Central Cloud Database & Local Server to pull any new employees or password updates
  await synchronizeWithCentralDatabase();

  const alreadyBootstrapped = localStorage.getItem(BOOTSTRAP_FLAG_KEY);
  if (alreadyBootstrapped === 'true') {
    return;
  }

  // 1. Seed 75 Master KPIs (perform_kpi_masters)
  const existingKpis = await FirestoreEngine.getCollection('perform_kpi_masters');
  if (existingKpis.length === 0) {
    for (const kpi of KPI_MASTER_SEED) {
      await FirestoreEngine.setDocument('perform_kpi_masters', kpi.id, kpi, {
        skipCloudPush: true,
      });
    }
  }

  // 2. Seed Perform Grade Config & Perform Lock Config (perform_config)
  const existingGradeCfg = await FirestoreEngine.getDocument('perform_config', 'grade_cutoffs');
  if (!existingGradeCfg) {
    await FirestoreEngine.setDocument('perform_config', 'grade_cutoffs', SEED_GRADE_CONFIG, {
      skipCloudPush: true,
    });
  }
  const existingPerformLock = await FirestoreEngine.getDocument('perform_config', 'perform_lock');
  if (!existingPerformLock) {
    await FirestoreEngine.setDocument('perform_config', 'perform_lock', SEED_PERFORM_LOCK, {
      skipCloudPush: true,
    });
  }

  // 3. Seed 4 Department Intern Roadmaps (perform_intern_roadmaps)
  const existingRoadmaps = await FirestoreEngine.getCollection('perform_intern_roadmaps');
  if (existingRoadmaps.length === 0) {
    for (const roadmap of SEED_INTERN_ROADMAPS) {
      await FirestoreEngine.setDocument('perform_intern_roadmaps', roadmap.id, roadmap, {
        skipCloudPush: true,
      });
    }
  }

  // 4. Seed Show Up HRMS Policy (showup_policy)
  const existingPolicy = await FirestoreEngine.getDocument('showup_policy', 'default_policy');
  if (!existingPolicy) {
    await FirestoreEngine.setDocument('showup_policy', 'default_policy', SEED_SHOWUP_POLICY, {
      skipCloudPush: true,
    });
  }

  // 5. Seed Compensation Lock Config (showup_compensation_lock)
  const existingLock = await FirestoreEngine.getDocument(
    'showup_compensation_lock',
    'global_lock'
  );
  if (!existingLock) {
    await FirestoreEngine.setDocument(
      'showup_compensation_lock',
      'global_lock',
      SEED_COMPENSATION_LOCK,
      { skipCloudPush: true }
    );
  }

  // 6. Seed App Settings (fiscal_settings & employee_form_schema)
  const existingFiscal = await FirestoreEngine.getDocument('app_settings', 'fiscal_settings');
  if (!existingFiscal) {
    await FirestoreEngine.setDocument('app_settings', 'fiscal_settings', SEED_FISCAL_SETTINGS, {
      skipCloudPush: true,
    });
  }

  const existingFormSchema = await FirestoreEngine.getDocument(
    'app_settings',
    'employee_form_schema'
  );
  if (!existingFormSchema) {
    await FirestoreEngine.setDocument(
      'app_settings',
      'employee_form_schema',
      {
        id: 'employee_form_schema',
        fields: SEED_DEFAULT_FORM_FIELDS,
        updatedAt: new Date().toISOString(),
      },
      { skipCloudPush: true }
    );
  }

  localStorage.setItem(BOOTSTRAP_FLAG_KEY, 'true');
  await synchronizeWithCentralDatabase();
}
