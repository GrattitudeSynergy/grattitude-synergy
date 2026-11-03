import React, { useState, useEffect } from 'react';
import {
  Target,
  Users,
  Award,
  Sliders,
  GitBranch,
  Printer,
  Send,
  CheckCircle2,
  RotateCcw,
  MessageSquare,
  Sparkles,
  GraduationCap,
  Lock,
} from 'lucide-react';
import {
  Card,
  Button,
  Badge,
  Tabs,
  Table,
  Modal,
  EmptyState,
  useToast,
} from '../../core/components/DesignSystem';
import { FirestoreEngine } from '../../core/firebase/firebaseConfig';
import { PermissionsService } from '../../core/services/permissionsService';
import { AuditService } from '../../core/services/auditService';
import { NotificationService } from '../../core/services/notificationService';
import { SEED_GRADE_CONFIG, SEED_PERFORM_LOCK } from '../../core/seedData';
import {
  calculateKpiScore,
  calculateTotalWeightedScore,
  resolveLetterGrade,
  getEffectiveItemScore,
} from './scoringEngine';
import { LifecycleEngine, LIFECYCLE_STAGES } from './lifecycleEngine';
import { ScorecardPrintView } from './ScorecardPrintView';
import { PerformOrgHierarchy } from './PerformOrgHierarchy';
import { InternEnablementTrack } from './InternEnablementTrack';
import { AdminConfigTab } from './AdminConfigTab';
import type {
  Employee,
  Quarter,
  PerformKpiMaster,
  PerformScorecard,
  PerformScorecardItem,
  PerformGradeConfig,
  PerformLockConfig,
  PerformComment,
  AppraisalLifecycleStatus,
} from '../../core/types';

export const PerformModule: React.FC<{
  currentEmployee: Employee;
  fiscalYear: string;
  quarter: Quarter;
}> = ({ currentEmployee, fiscalYear, quarter }) => {
  const { showToast } = useToast();

  const isIntern = PermissionsService.isIntern(currentEmployee);
  const isAdmin = PermissionsService.isAdmin(currentEmployee);
  const isCEO = PermissionsService.isCEO(currentEmployee);
  const isManager = PermissionsService.isManager(currentEmployee);

  const [activeTab, setActiveTab] = useState<string>(
    isIntern ? 'intern-track' : 'my-scorecard'
  );

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [kpiMasters, setKpiMasters] = useState<PerformKpiMaster[]>([]);
  const [scorecards, setScorecards] = useState<PerformScorecard[]>([]);
  const [gradeConfig, setGradeConfig] =
    useState<PerformGradeConfig>(SEED_GRADE_CONFIG);
  const [performLock, setPerformLock] =
    useState<PerformLockConfig>(SEED_PERFORM_LOCK);
  const [comments, setComments] = useState<PerformComment[]>([]);

  // Modals & Interactive States
  const [printScorecard, setPrintScorecard] = useState<PerformScorecard | null>(
    null
  );
  const [managerStageFilter, setManagerStageFilter] = useState<string>('ALL');
  const [reviewingScorecard, setReviewingScorecard] =
    useState<PerformScorecard | null>(null);
  const [manager1on1Notes, setManager1on1Notes] = useState('');
  const [ceoCalibrationNotes, setCeoCalibrationNotes] = useState('');

  // Target Setting Modal
  const [targetModalSc, setTargetModalSc] = useState<PerformScorecard | null>(
    null
  );

  // Admin Override Modal
  const [overrideSc, setOverrideSc] = useState<PerformScorecard | null>(null);
  const [overrideTargetStage, setOverrideTargetStage] =
    useState<AppraisalLifecycleStatus>('Draft');
  const [overrideReason, setOverrideReason] = useState('');

  // Inline KPI Chat Modal
  const [activeChatKpi, setActiveChatKpi] = useState<{
    scorecardId: string;
    kpiId?: string;
    title: string;
  } | null>(null);
  const [newCommentText, setNewCommentText] = useState('');

  useEffect(() => {
    const u1 = FirestoreEngine.subscribeCollection<Employee>(
      'employees',
      setEmployees
    );
    const u2 = FirestoreEngine.subscribeCollection<PerformKpiMaster>(
      'perform_kpi_masters',
      setKpiMasters
    );
    const u3 = FirestoreEngine.subscribeCollection<PerformScorecard>(
      'perform_scorecards',
      setScorecards
    );
    const u4 = FirestoreEngine.subscribeCollection<any>(
      'perform_config',
      (items) => {
        const foundGrade = items.find((i) => i.id === 'grade_cutoffs');
        if (foundGrade) setGradeConfig(foundGrade);
        const foundLock = items.find((i) => i.id === 'perform_lock');
        if (foundLock) setPerformLock(foundLock);
      }
    );
    const u5 = FirestoreEngine.subscribeCollection<PerformComment>(
      'perform_comments',
      setComments
    );
    return () => {
      u1();
      u2();
      u3();
      u4();
      u5();
    };
  }, []);

  // Filter scorecards for current fiscal cycle
  const cycleScorecards = scorecards.filter(
    (sc) => sc.fiscalYear === fiscalYear && sc.quarter === quarter
  );

  const myScorecardId = `${currentEmployee.id}_${fiscalYear}_${quarter}`;
  const myScorecard = cycleScorecards.find((sc) => sc.id === myScorecardId);

  /**
   * Initialize 15-KPI Scorecard for any non-intern employee (Levels 1 to 5)
   */
  const initializeScorecardForEmployee = async (emp: Employee) => {
    if (emp.level === 0) {
      showToast(
        'info',
        'Intern Track Active',
        'Level 0 Interns use the Intern Enablement Track instead of the 15-KPI numerical scorecard.'
      );
      return;
    }
    const levelKpis = kpiMasters
      .filter((k) => k.level === emp.level)
      .sort((a, b) => a.id.localeCompare(b.id));

    if (levelKpis.length === 0) {
      showToast(
        'error',
        'KPI Catalog Not Ready',
        `No master KPIs found for Level ${emp.level}.`
      );
      return;
    }

    const items: PerformScorecardItem[] = levelKpis.map((k) => {
      const initialActual =
        k.scoringFormula === 'BOOLEAN_BINARY' ? 1 : k.target;
      const initialScore = calculateKpiScore(
        k.scoringFormula,
        initialActual,
        k.target
      );
      return {
        kpiId: k.id,
        title: k.title,
        description: k.description,
        category: k.category,
        target: k.target,
        unit: k.unit,
        weightage: k.weightage,
        scoringFormula: k.scoringFormula,
        actual: initialActual,
        selfScore: initialScore,
        managerScore: 0,
        ceoScore: 0,
        selfJustification: `Achieved benchmark target of ${initialActual} ${k.unit} during ${fiscalYear} ${quarter}.`,
        managerComments: '',
      };
    });

    const totalWeighted = calculateTotalWeightedScore(items, 'Draft');
    const grade = resolveLetterGrade(totalWeighted, gradeConfig);

    const newSc: PerformScorecard = {
      id: `${emp.id}_${fiscalYear}_${quarter}`,
      employeeId: emp.id,
      employeeName: emp.name,
      employeeEcode: emp.ecode,
      employeeLevel: emp.level,
      department: emp.department,
      reportingManagerId: emp.reportingManagerId || 'EMP-001',
      fiscalYear,
      quarter,
      status: 'Draft',
      items,
      totalWeightedScore: totalWeighted,
      grade,
      updatedAt: new Date().toISOString(),
    };

    await FirestoreEngine.setDocument('perform_scorecards', newSc.id, newSc);
    await AuditService.log({
      action: 'SCORECARD_INITIALIZED',
      actor: currentEmployee,
      targetId: newSc.id,
      targetType: 'PerformScorecard',
      details: `Initialized 15-KPI scorecard for ${emp.name} (${emp.ecode}, Level ${emp.level}) for ${fiscalYear} ${quarter}.`,
    });
    showToast(
      'success',
      '15-KPI Scorecard Initialized',
      `Scorecard created for ${emp.name} (${fiscalYear} ${quarter}).`
    );
  };

  const handleUpdateScorecardItem = async (
    sc: PerformScorecard,
    kpiId: string,
    changes: Partial<PerformScorecardItem>
  ) => {
    const updatedItems = sc.items.map((item) => {
      if (item.kpiId !== kpiId) return item;
      const next = { ...item, ...changes };
      if (changes.actual !== undefined || changes.target !== undefined) {
        next.selfScore = calculateKpiScore(
          next.scoringFormula,
          next.actual,
          next.target
        );
      }
      return next;
    });

    const totalWeightedScore = calculateTotalWeightedScore(
      updatedItems,
      sc.status
    );
    const grade = resolveLetterGrade(totalWeightedScore, gradeConfig);

    const updatedSc: PerformScorecard = {
      ...sc,
      items: updatedItems,
      totalWeightedScore,
      grade,
      updatedAt: new Date().toISOString(),
    };

    await FirestoreEngine.setDocument(
      'perform_scorecards',
      updatedSc.id,
      updatedSc
    );
    if (reviewingScorecard?.id === updatedSc.id) {
      setReviewingScorecard(updatedSc);
    }
    if (targetModalSc?.id === updatedSc.id) {
      setTargetModalSc(updatedSc);
    }
  };

  /**
   * Stage 1 -> Stage 2: Employee submits from 'Draft' to 'Submitted to Manager'
   */
  const handleEmployeeSubmitToManager = async (sc: PerformScorecard) => {
    const check = LifecycleEngine.validateEmployeeSelfSubmission(sc);
    if (!check.valid) {
      showToast('error', 'Self-Appraisal Incomplete', check.error);
      return;
    }

    const totalWeightedScore = calculateTotalWeightedScore(
      sc.items,
      'Submitted to Manager'
    );
    const grade = resolveLetterGrade(totalWeightedScore, gradeConfig);

    const updated: PerformScorecard = {
      ...sc,
      status: 'Submitted to Manager',
      totalWeightedScore,
      grade,
      updatedAt: new Date().toISOString(),
    };

    await FirestoreEngine.setDocument('perform_scorecards', sc.id, updated);
    await AuditService.log({
      action: 'SCORECARD_SUBMITTED_TO_MANAGER',
      actor: currentEmployee,
      targetId: sc.id,
      targetType: 'PerformScorecard',
      details: `${sc.employeeName} submitted 15-KPI self-appraisal (${totalWeightedScore.toFixed(2)}%, Grade ${grade}) to manager.`,
    });

    if (sc.reportingManagerId) {
      await NotificationService.create({
        recipientId: sc.reportingManagerId,
        title: '15-KPI Self-Appraisal Submitted',
        message: `${sc.employeeName} (${sc.employeeEcode}) submitted their ${fiscalYear} ${quarter} scorecard for Manager Review.`,
        route: '/perform',
        actorName: currentEmployee.name,
      });
    }

    showToast(
      'success',
      'Submitted to Manager',
      'Your 15-KPI self-appraisal is now queued in the Manager Team Hub.'
    );
  };

  /**
   * Stage 2 -> Stage 3: Manager calibrates & submits to 'Manager Review'
   */
  const handleCompleteManagerReview = async (sc: PerformScorecard) => {
    const itemsWithMgrDefaults = sc.items.map((i) => ({
      ...i,
      managerScore: i.managerScore > 0 ? i.managerScore : i.selfScore,
    }));
    const totalWeightedScore = calculateTotalWeightedScore(
      itemsWithMgrDefaults,
      'Manager Review'
    );
    const grade = resolveLetterGrade(totalWeightedScore, gradeConfig);

    const updated: PerformScorecard = {
      ...sc,
      status: 'Manager Review',
      items: itemsWithMgrDefaults,
      totalWeightedScore,
      grade,
      manager1on1Notes: manager1on1Notes.trim() || sc.manager1on1Notes,
      updatedAt: new Date().toISOString(),
    };

    await FirestoreEngine.setDocument('perform_scorecards', sc.id, updated);
    await AuditService.log({
      action: 'SCORECARD_MANAGER_REVIEWED',
      actor: currentEmployee,
      targetId: sc.id,
      targetType: 'PerformScorecard',
      details: `Manager ${currentEmployee.name} calibrated ${sc.employeeName}'s scorecard to ${totalWeightedScore.toFixed(2)}% (${grade}).`,
    });

    showToast(
      'success',
      'Manager Review Completed',
      `Scorecard for ${sc.employeeName} moved to "Manager Review".`
    );
    setReviewingScorecard(null);
  };

  /**
   * Stage 3 -> Stage 4: CEO executes executive review and calibration ('CEO Reviewed')
   */
  const handleCompleteCeoCalibration = async (sc: PerformScorecard) => {
    const itemsWithCeoDefaults = sc.items.map((i) => ({
      ...i,
      ceoScore:
        i.ceoScore > 0
          ? i.ceoScore
          : i.managerScore > 0
          ? i.managerScore
          : i.selfScore,
    }));
    const totalWeightedScore = calculateTotalWeightedScore(
      itemsWithCeoDefaults,
      'CEO Reviewed'
    );
    const grade = resolveLetterGrade(totalWeightedScore, gradeConfig);

    const updated: PerformScorecard = {
      ...sc,
      status: 'CEO Reviewed',
      items: itemsWithCeoDefaults,
      totalWeightedScore,
      grade,
      ceoCalibrationNotes:
        ceoCalibrationNotes.trim() || sc.ceoCalibrationNotes,
      updatedAt: new Date().toISOString(),
    };

    await FirestoreEngine.setDocument('perform_scorecards', sc.id, updated);
    await AuditService.log({
      action: 'SCORECARD_CEO_CALIBRATED',
      actor: currentEmployee,
      targetId: sc.id,
      targetType: 'PerformScorecard',
      details: `Executive calibration completed for ${sc.employeeName}: ${totalWeightedScore.toFixed(2)}% (Grade ${grade}).`,
    });

    showToast(
      'success',
      'Executive Calibration Saved',
      `${sc.employeeName}'s scorecard is now "CEO Reviewed".`
    );
    setReviewingScorecard(null);
  };

  /**
   * Stage 4 -> Stage 5: CEO or Admin executes final release ('Final Evaluation Released')
   */
  const handleFinalRelease = async (sc: PerformScorecard) => {
    const totalWeightedScore = calculateTotalWeightedScore(
      sc.items,
      'Final Evaluation Released'
    );
    const grade = resolveLetterGrade(totalWeightedScore, gradeConfig);

    const updated: PerformScorecard = {
      ...sc,
      status: 'Final Evaluation Released',
      totalWeightedScore,
      grade,
      updatedAt: new Date().toISOString(),
    };

    await FirestoreEngine.setDocument('perform_scorecards', sc.id, updated);
    await AuditService.log({
      action: 'SCORECARD_FINAL_RELEASED',
      actor: currentEmployee,
      targetId: sc.id,
      targetType: 'PerformScorecard',
      details: `Released final evaluation for ${sc.employeeName} (${sc.employeeEcode}): ${totalWeightedScore.toFixed(2)}% — Grade ${grade}.`,
    });

    await NotificationService.create({
      recipientId: sc.employeeId,
      title: 'Final KPI Appraisal Released',
      message: `Your ${fiscalYear} ${quarter} Final Evaluation has been released with Grade ${grade} (${totalWeightedScore.toFixed(1)}%).`,
      route: '/perform',
      actorName: currentEmployee.name,
    });

    showToast(
      'success',
      'Final Evaluation Released',
      `Official Grade ${grade} released to ${sc.employeeName}.`
    );
  };

  /**
   * Admin Lifecycle Override with Mandatory Audit Logging
   */
  const handleAdminLifecycleOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideSc || !overrideReason.trim()) return;

    const totalWeightedScore = calculateTotalWeightedScore(
      overrideSc.items,
      overrideTargetStage
    );
    const grade = resolveLetterGrade(totalWeightedScore, gradeConfig);

    const updated: PerformScorecard = {
      ...overrideSc,
      status: overrideTargetStage,
      totalWeightedScore,
      grade,
      updatedAt: new Date().toISOString(),
    };

    await FirestoreEngine.setDocument(
      'perform_scorecards',
      overrideSc.id,
      updated
    );
    await AuditService.log({
      action: 'ADMIN_LIFECYCLE_STATE_OVERRIDE',
      actor: currentEmployee,
      targetId: overrideSc.id,
      targetType: 'PerformScorecard',
      details: `Admin overrode scorecard state for ${overrideSc.employeeName} from "${overrideSc.status}" to "${overrideTargetStage}". Reason: ${overrideReason.trim()}`,
    });

    showToast(
      'warning',
      'Lifecycle Override Executed',
      `Reverted/moved ${overrideSc.employeeName} to "${overrideTargetStage}".`
    );
    setOverrideSc(null);
    setOverrideReason('');
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeChatKpi || !newCommentText.trim()) return;
    const c: PerformComment = {
      id: `cmt_${Date.now()}`,
      scorecardId: activeChatKpi.scorecardId,
      kpiId: activeChatKpi.kpiId,
      authorId: currentEmployee.id,
      authorName: currentEmployee.name,
      authorRole: currentEmployee.role,
      message: newCommentText.trim(),
      createdAt: new Date().toISOString(),
    };
    await FirestoreEngine.setDocument('perform_comments', c.id, c);
    setNewCommentText('');
  };

  // Build Role-Tailored Tabs
  const tabs = [
    ...(!isIntern
      ? [
          {
            id: 'my-scorecard',
            label: 'Employee Self-Appraisal (15 KPIs)',
            icon: <Target className="w-3.5 h-3.5" />,
          },
        ]
      : []),
    ...(isManager
      ? [
          {
            id: 'manager-hub',
            label: 'Manager Team Hub',
            icon: <Users className="w-3.5 h-3.5" />,
            badge: cycleScorecards.length,
          },
        ]
      : []),
    ...(isCEO || isAdmin || currentEmployee.role === 'Advisor'
      ? [
          {
            id: 'ceo-executive',
            label: 'CEO Executive Calibration',
            icon: <Award className="w-3.5 h-3.5" />,
          },
        ]
      : []),
    ...(isIntern || isManager || isAdmin
      ? [
          {
            id: 'intern-track',
            label: 'Intern Enablement Track (L0)',
            icon: <GraduationCap className="w-3.5 h-3.5" />,
          },
        ]
      : []),
    {
      id: 'org-hierarchy',
      label: 'Org Hierarchy Visualizer',
      icon: <GitBranch className="w-3.5 h-3.5" />,
    },
    ...(isAdmin
      ? [
          {
            id: 'admin-config',
            label: 'Admin KPI Catalog & Cutoffs',
            icon: <Sliders className="w-3.5 h-3.5" />,
          },
        ]
      : []),
  ];

  // Team scorecards for Manager Team Hub
  const teamScorecards = cycleScorecards.filter((sc) => {
    const isDirectReport =
      isAdmin ||
      isCEO ||
      sc.reportingManagerId === currentEmployee.id ||
      sc.employeeId === currentEmployee.id;
    const matchesStage =
      managerStageFilter === 'ALL' || sc.status === managerStageFilter;
    return isDirectReport && matchesStage;
  });

  const isPerformLockedForMe = PermissionsService.isPerformLockedForViewer(
    currentEmployee,
    currentEmployee.id,
    performLock
  );

  if (isPerformLockedForMe && !isAdmin) {
    return (
      <Card
        title={
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-amber-600" />
            <span>Perform Module Restricted by Administrator</span>
          </div>
        }
        subtitle="Access to KPI Appraisals, OKR Scorecards, and Roadmaps is currently locked for your account."
      >
        <div className="p-6 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
          <Lock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-bold text-amber-900">
              Perform Module Lock Active ({performLock.mode.toUpperCase()} Mode)
            </h4>
            <p className="text-xs text-amber-800 mt-1 leading-relaxed">
              {performLock.lockMessage}
            </p>
            <p className="text-[11px] text-amber-700 mt-2">
              Please contact the Corporate Super Admin (<span className="font-mono font-semibold">EMP-001</span>) if you require an exception.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* Sub-Navigation Tabs */}
      <Tabs
        tabs={tabs}
        activeTab={activeTab}
        onChange={(id) => setActiveTab(id)}
      />

      {/* TAB 1: EMPLOYEE 15-KPI SCORECARD */}
      {activeTab === 'my-scorecard' && !isIntern && (
        <div className="space-y-5">
          {!myScorecard ? (
            <EmptyState
              title={`No Active Scorecard for ${fiscalYear} (${quarter})`}
              description={`Initialize your Level ${currentEmployee.level} 15-KPI appraisal matrix (100% total weightage) from the pre-seeded Master KPI Catalog.`}
              icon={<Sparkles className="w-6 h-6 text-sky-600" />}
              action={
                <Button
                  variant="primary"
                  icon={<Target className="w-4 h-4" />}
                  onClick={() => initializeScorecardForEmployee(currentEmployee)}
                >
                  Initialize My 15-KPI Scorecard ({fiscalYear} {quarter})
                </Button>
              }
            />
          ) : (
            <>
              {/* Scorecard Summary Header */}
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-neutral-900">
                        {myScorecard.employeeName} ({myScorecard.employeeEcode})
                      </h3>
                      <Badge variant="info">
                        Level {myScorecard.employeeLevel} (15 KPIs)
                      </Badge>
                      <Badge
                        variant={
                          myScorecard.status === 'Final Evaluation Released'
                            ? 'success'
                            : myScorecard.status === 'Draft'
                            ? 'neutral'
                            : 'warning'
                        }
                      >
                        {myScorecard.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-neutral-500 mt-1">
                      Cycle: <strong>{fiscalYear}</strong> •{' '}
                      <strong>{quarter}</strong> • Deterministic 5-Algorithm Scoring Engine
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className="px-4 py-2 bg-neutral-100 border border-neutral-200 rounded-lg text-right">
                      <div className="text-[10px] font-bold uppercase text-neutral-500">
                        Total Weighted Score
                      </div>
                      <div className="text-lg font-extrabold text-neutral-900">
                        {myScorecard.totalWeightedScore.toFixed(2)}%
                      </div>
                    </div>

                    <div className="px-4 py-2 bg-neutral-900 text-white rounded-lg text-center">
                      <div className="text-[10px] font-bold uppercase text-sky-400">
                        Grade
                      </div>
                      <div className="text-lg font-extrabold">
                        {myScorecard.grade}
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      icon={<MessageSquare className="w-4 h-4" />}
                      onClick={() =>
                        setActiveChatKpi({
                          scorecardId: myScorecard.id,
                          title: `General Scorecard Thread (${myScorecard.employeeEcode})`,
                        })
                      }
                    >
                      Comments
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      icon={<Printer className="w-4 h-4" />}
                      onClick={() => setPrintScorecard(myScorecard)}
                    >
                      Print View
                    </Button>

                    {myScorecard.status === 'Draft' && (
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={<Send className="w-4 h-4" />}
                        onClick={() =>
                          handleEmployeeSubmitToManager(myScorecard)
                        }
                      >
                        Submit to Manager
                      </Button>
                    )}
                  </div>
                </div>

                {/* 5-Stage Lifecycle Stepper Bar */}
                <div className="mt-4 pt-4 border-t border-neutral-200 grid grid-cols-5 gap-2">
                  {LIFECYCLE_STAGES.map((stage, idx) => {
                    const currentIdx = LIFECYCLE_STAGES.indexOf(
                      myScorecard.status
                    );
                    const isCompleted = idx <= currentIdx;
                    return (
                      <div
                        key={stage}
                        className={`p-2 rounded-lg border text-center text-xs font-bold ${
                          idx === currentIdx
                            ? 'bg-neutral-900 text-white border-neutral-900'
                            : isCompleted
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            : 'bg-neutral-50 text-neutral-400 border-neutral-200'
                        }`}
                      >
                        {idx + 1}. {stage}
                      </div>
                    );
                  })}
                </div>
              </Card>

              {/* 15 KPI Interactive Rows */}
              <Card
                title="15-KPI Self-Appraisal Matrix & Justification Ledger"
                subtitle="Enter your actual achievement values to run the real-time scoring calculator. Mandatory justification notes are required for every KPI before submission."
              >
                <Table
                  headers={[
                    '#',
                    'KPI & Pillar',
                    'Algorithm',
                    'Target',
                    'Actual Input',
                    'Weight',
                    'Self Score',
                    'Mandatory Self-Review Justification',
                    'KPI Chat',
                  ]}
                >
                  {myScorecard.items.map((item, idx) => {
                    const isHighImpact = item.weightage >= 8;
                    const isEditable = myScorecard.status === 'Draft';

                    return (
                      <tr
                        key={item.kpiId}
                        className={
                          isHighImpact ? 'bg-amber-50/30 hover:bg-amber-50/60' : 'hover:bg-neutral-50'
                        }
                      >
                        <td className="px-3 py-3 text-xs font-mono text-neutral-500">
                          {idx + 1}
                        </td>
                        <td className="px-3 py-3 max-w-xs">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-bold text-neutral-900">
                              {item.title}
                            </span>
                            {isHighImpact && (
                              <Badge variant="warning">High Impact</Badge>
                            )}
                          </div>
                          <div className="text-[11px] text-neutral-500 mt-0.5">
                            {item.category} — {item.description}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <Badge variant="neutral" className="font-mono text-[10px]">
                            {item.scoringFormula}
                          </Badge>
                        </td>
                        <td className="px-3 py-3 text-xs font-mono whitespace-nowrap">
                          {item.target} {item.unit}
                        </td>
                        <td className="px-3 py-3 w-32">
                          {item.scoringFormula === 'BOOLEAN_BINARY' ? (
                            <select
                              disabled={!isEditable}
                              value={item.actual}
                              onChange={(e) =>
                                handleUpdateScorecardItem(
                                  myScorecard,
                                  item.kpiId,
                                  { actual: Number(e.target.value) }
                                )
                              }
                              className="w-full px-2 py-1.5 text-xs font-mono border border-neutral-300 rounded-lg bg-white disabled:bg-neutral-100"
                            >
                              <option value={1}>1 (Pass = 100%)</option>
                              <option value={0}>0 (Fail = 0%)</option>
                            </select>
                          ) : (
                            <input
                              type="number"
                              step="any"
                              disabled={!isEditable}
                              value={item.actual}
                              onChange={(e) =>
                                handleUpdateScorecardItem(
                                  myScorecard,
                                  item.kpiId,
                                  { actual: Number(e.target.value) }
                                )
                              }
                              className="w-24 px-2.5 py-1.5 text-xs font-mono font-bold border border-neutral-300 rounded-lg disabled:bg-neutral-100"
                            />
                          )}
                        </td>
                        <td className="px-3 py-3 text-xs font-mono font-bold">
                          {item.weightage}%
                        </td>
                        <td className="px-3 py-3">
                          <Badge
                            variant={
                              item.selfScore >= 85
                                ? 'success'
                                : item.selfScore >= 70
                                ? 'info'
                                : 'warning'
                            }
                            className="font-mono"
                          >
                            {item.selfScore.toFixed(1)} pts
                          </Badge>
                        </td>
                        <td className="px-3 py-3 min-w-[240px]">
                          <input
                            type="text"
                            disabled={!isEditable}
                            value={item.selfJustification || ''}
                            onChange={(e) =>
                              handleUpdateScorecardItem(
                                myScorecard,
                                item.kpiId,
                                { selfJustification: e.target.value }
                              )
                            }
                            placeholder="Mandatory justification note..."
                            className="w-full px-2.5 py-1.5 text-xs border border-neutral-300 rounded-lg disabled:bg-neutral-100"
                          />
                        </td>
                        <td className="px-3 py-3">
                          <Button
                            size="xs"
                            variant="outline"
                            icon={<MessageSquare className="w-3 h-3" />}
                            onClick={() =>
                              setActiveChatKpi({
                                scorecardId: myScorecard.id,
                                kpiId: item.kpiId,
                                title: `${item.kpiId}: ${item.title}`,
                              })
                            }
                          >
                            Chat
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </Table>
              </Card>
            </>
          )}
        </div>
      )}

      {/* TAB 2: MANAGER TEAM HUB */}
      {activeTab === 'manager-hub' && isManager && (
        <Card
          title="Manager Team Hub — Scorecards, Target Setting & 1:1 Reviews"
          subtitle={`Manage direct report scorecards for ${fiscalYear} (${quarter}), calibrate scores, and record 1:1 discussion notes.`}
          action={
            <div className="flex items-center gap-2">
              <select
                value={managerStageFilter}
                onChange={(e) => setManagerStageFilter(e.target.value)}
                className="px-3 py-1.5 text-xs font-bold border border-neutral-300 rounded-lg bg-white"
              >
                <option value="ALL">All Lifecycle Stages</option>
                {LIFECYCLE_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          }
        >
          {/* Quick Provision Scorecard Bar for employees without a scorecard in this cycle */}
          <div className="mb-4 p-3 bg-neutral-50 border border-neutral-200 rounded-lg flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-neutral-700 font-medium">
              Need to initialize a scorecard for a team member in{' '}
              <strong>
                {fiscalYear} ({quarter})
              </strong>
              ?
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {employees
                .filter(
                  (e) =>
                    e.level > 0 &&
                    !cycleScorecards.some((sc) => sc.employeeId === e.id)
                )
                .map((emp) => (
                  <Button
                    key={emp.id}
                    size="xs"
                    variant="outline"
                    onClick={() => initializeScorecardForEmployee(emp)}
                  >
                    + Initialize {emp.name} ({emp.ecode})
                  </Button>
                ))}
            </div>
          </div>

          {teamScorecards.length === 0 ? (
            <EmptyState
              title="No Team Scorecards Found for Selected Filter"
              description="Initialize a scorecard above or adjust the stage filter."
            />
          ) : (
            <Table
              headers={[
                'Employee',
                'Level & Dept',
                'Lifecycle Stage',
                'Weighted Score',
                'Grade',
                'Actions',
              ]}
            >
              {teamScorecards.map((sc) => (
                <tr key={sc.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3">
                    <div className="text-xs font-bold text-neutral-900">
                      {sc.employeeName}
                    </div>
                    <div className="text-[11px] font-mono text-neutral-500">
                      {sc.employeeEcode}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <Badge variant="info">Level {sc.employeeLevel}</Badge>{' '}
                    <span className="text-neutral-600 ml-1">
                      {sc.department}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={
                        sc.status === 'Final Evaluation Released'
                          ? 'success'
                          : sc.status === 'Draft'
                          ? 'neutral'
                          : 'warning'
                      }
                    >
                      {sc.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs font-mono font-bold">
                    {sc.totalWeightedScore.toFixed(2)}%
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="success">{sc.grade}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={() => setTargetModalSc(sc)}
                      >
                        Set Targets
                      </Button>
                      <Button
                        size="xs"
                        variant="primary"
                        onClick={() => {
                          setReviewingScorecard(sc);
                          setManager1on1Notes(sc.manager1on1Notes || '');
                          setCeoCalibrationNotes(sc.ceoCalibrationNotes || '');
                        }}
                      >
                        Review & Calibrate
                      </Button>
                      <Button
                        size="xs"
                        variant="outline"
                        icon={<Printer className="w-3 h-3" />}
                        onClick={() => setPrintScorecard(sc)}
                      >
                        Print
                      </Button>
                      {isAdmin && (
                        <Button
                          size="xs"
                          variant="danger"
                          icon={<RotateCcw className="w-3 h-3" />}
                          onClick={() => {
                            setOverrideSc(sc);
                            setOverrideTargetStage('Draft');
                          }}
                        >
                          Override State
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      )}

      {/* TAB 3: CEO EXECUTIVE TAB */}
      {activeTab === 'ceo-executive' && (
        <Card
          title="CEO Executive Calibration & Final Evaluation Release Matrix"
          subtitle={`Organization-wide scorecards for ${fiscalYear} (${quarter}). Execute executive calibration and release final grades.`}
        >
          {cycleScorecards.length === 0 ? (
            <EmptyState
              title="No Organizational Scorecards in Current Cycle"
              description="Once scorecards are initialized and reviewed, they appear here for executive calibration and final release."
            />
          ) : (
            <Table
              headers={[
                'Employee & E-Code',
                'Department & Level',
                'Lifecycle Stage',
                'Calibrated Score',
                'Letter Grade',
                'Executive Controls',
              ]}
            >
              {cycleScorecards.map((sc) => (
                <tr key={sc.id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3">
                    <div className="text-xs font-bold text-neutral-900">
                      {sc.employeeName}
                    </div>
                    <div className="text-[11px] font-mono text-neutral-500">
                      {sc.employeeEcode}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {sc.department} •{' '}
                    <Badge variant="neutral">L{sc.employeeLevel}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={
                        sc.status === 'Final Evaluation Released'
                          ? 'success'
                          : 'info'
                      }
                    >
                      {sc.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-xs font-mono font-bold">
                    {sc.totalWeightedScore.toFixed(2)}%
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="success" className="text-xs">
                      Grade {sc.grade}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(isCEO || isAdmin) && (
                        <>
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => {
                              setReviewingScorecard(sc);
                              setManager1on1Notes(sc.manager1on1Notes || '');
                              setCeoCalibrationNotes(
                                sc.ceoCalibrationNotes || ''
                              );
                            }}
                          >
                            Calibrate Scores
                          </Button>
                          {sc.status !== 'Final Evaluation Released' && (
                            <Button
                              size="xs"
                              variant="success"
                              icon={<CheckCircle2 className="w-3 h-3" />}
                              onClick={() => handleFinalRelease(sc)}
                            >
                              Final Release
                            </Button>
                          )}
                        </>
                      )}
                      <Button
                        size="xs"
                        variant="outline"
                        icon={<Printer className="w-3 h-3" />}
                        onClick={() => setPrintScorecard(sc)}
                      >
                        Print
                      </Button>
                      {isAdmin && (
                        <Button
                          size="xs"
                          variant="danger"
                          onClick={() => {
                            setOverrideSc(sc);
                            setOverrideTargetStage('Draft');
                          }}
                        >
                          Override
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      )}

      {/* TAB 4: INTERN ENABLEMENT TRACK */}
      {activeTab === 'intern-track' && (
        <InternEnablementTrack
          currentEmployee={currentEmployee}
          allEmployees={employees}
        />
      )}

      {/* TAB 5: ORG HIERARCHY VISUALIZER */}
      {activeTab === 'org-hierarchy' && (
        <PerformOrgHierarchy
          employees={employees}
          scorecards={cycleScorecards}
        />
      )}

      {/* TAB 6: ADMIN CONFIG TAB */}
      {activeTab === 'admin-config' && isAdmin && (
        <AdminConfigTab
          currentAdmin={currentEmployee}
          allEmployees={employees}
          kpiMasters={kpiMasters}
          gradeConfig={gradeConfig}
        />
      )}

      {/* MODAL: Printable Scorecard View */}
      <ScorecardPrintView
        isOpen={Boolean(printScorecard)}
        onClose={() => setPrintScorecard(null)}
        scorecard={printScorecard}
      />

      {/* MODAL: Target Setting */}
      <Modal
        isOpen={Boolean(targetModalSc)}
        onClose={() => setTargetModalSc(null)}
        size="xl"
        title={
          targetModalSc
            ? `KPI Target Setting — ${targetModalSc.employeeName} (${targetModalSc.employeeEcode})`
            : 'Target Setting'
        }
        subtitle="Customize quarterly KPI numerical targets for this employee."
      >
        {targetModalSc && (
          <div className="space-y-4">
            <Table headers={['KPI Title', 'Formula', 'Weight', 'Target Value', 'Unit']}>
              {targetModalSc.items.map((item) => (
                <tr key={item.kpiId}>
                  <td className="px-3 py-2 text-xs font-bold">{item.title}</td>
                  <td className="px-3 py-2 text-[11px] font-mono">
                    {item.scoringFormula}
                  </td>
                  <td className="px-3 py-2 text-xs font-mono">
                    {item.weightage}%
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      step="any"
                      value={item.target}
                      onChange={(e) =>
                        handleUpdateScorecardItem(targetModalSc, item.kpiId, {
                          target: Number(e.target.value),
                        })
                      }
                      className="w-24 px-2 py-1 text-xs font-mono border border-neutral-300 rounded-lg"
                    />
                  </td>
                  <td className="px-3 py-2 text-xs text-neutral-500">
                    {item.unit}
                  </td>
                </tr>
              ))}
            </Table>
            <div className="flex justify-end">
              <Button variant="primary" onClick={() => setTargetModalSc(null)}>
                Done Setting Targets
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL: Manager & CEO Review / Calibration */}
      <Modal
        isOpen={Boolean(reviewingScorecard)}
        onClose={() => setReviewingScorecard(null)}
        size="2xl"
        title={
          reviewingScorecard
            ? `Appraisal Review & Calibration — ${reviewingScorecard.employeeName} (${reviewingScorecard.status})`
            : 'Review Scorecard'
        }
        subtitle="Calibrate individual KPI scores, review employee justifications, and record 1:1 / executive notes."
      >
        {reviewingScorecard && (
          <div className="space-y-4">
            <Table
              headers={[
                'KPI Title & Employee Justification',
                'Target / Actual',
                'Weight',
                'Self Score',
                'Manager Score (0–100)',
                ...(isCEO || isAdmin ? ['CEO Score (0–100)'] : []),
              ]}
            >
              {reviewingScorecard.items.map((item) => (
                <tr key={item.kpiId}>
                  <td className="px-3 py-2.5 max-w-xs">
                    <div className="text-xs font-bold text-neutral-900">
                      {item.title}
                    </div>
                    <div className="text-[11px] text-neutral-600 italic mt-0.5">
                      "{item.selfJustification || 'No justification provided'}"
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-xs font-mono">
                    {item.actual} / {item.target} {item.unit}
                  </td>
                  <td className="px-3 py-2.5 text-xs font-mono">
                    {item.weightage}%
                  </td>
                  <td className="px-3 py-2.5 text-xs font-mono font-bold">
                    {item.selfScore.toFixed(0)}
                  </td>
                  <td className="px-3 py-2.5">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={
                        item.managerScore > 0
                          ? item.managerScore
                          : item.selfScore
                      }
                      onChange={(e) =>
                        handleUpdateScorecardItem(
                          reviewingScorecard,
                          item.kpiId,
                          { managerScore: Number(e.target.value) }
                        )
                      }
                      className="w-20 px-2 py-1 text-xs font-mono border border-neutral-300 rounded-lg"
                    />
                  </td>
                  {(isCEO || isAdmin) && (
                    <td className="px-3 py-2.5">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={
                          item.ceoScore > 0
                            ? item.ceoScore
                            : item.managerScore > 0
                            ? item.managerScore
                            : item.selfScore
                        }
                        onChange={(e) =>
                          handleUpdateScorecardItem(
                            reviewingScorecard,
                            item.kpiId,
                            { ceoScore: Number(e.target.value) }
                          )
                        }
                        className="w-20 px-2 py-1 text-xs font-mono border border-neutral-300 rounded-lg"
                      />
                    </td>
                  )}
                </tr>
              ))}
            </Table>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-neutral-700 mb-1">
                  Manager 1:1 Discussion & Coaching Notes
                </label>
                <textarea
                  rows={2}
                  value={manager1on1Notes}
                  onChange={(e) => setManager1on1Notes(e.target.value)}
                  placeholder="Enter 1:1 discussion summary..."
                  className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
                />
              </div>
              {(isCEO || isAdmin) && (
                <div>
                  <label className="block text-xs font-bold text-neutral-700 mb-1">
                    CEO Executive Calibration Notes
                  </label>
                  <textarea
                    rows={2}
                    value={ceoCalibrationNotes}
                    onChange={(e) => setCeoCalibrationNotes(e.target.value)}
                    placeholder="Enter executive calibration rationale..."
                    className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
                  />
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-neutral-200">
              <Button
                variant="outline"
                onClick={() => setReviewingScorecard(null)}
              >
                Close
              </Button>
              <Button
                variant="secondary"
                onClick={() => handleCompleteManagerReview(reviewingScorecard)}
              >
                Submit Manager Review (Stage 3)
              </Button>
              {(isCEO || isAdmin) && (
                <>
                  <Button
                    variant="primary"
                    onClick={() =>
                      handleCompleteCeoCalibration(reviewingScorecard)
                    }
                  >
                    Complete CEO Calibration (Stage 4)
                  </Button>
                  <Button
                    variant="success"
                    onClick={() => {
                      handleFinalRelease(reviewingScorecard);
                      setReviewingScorecard(null);
                    }}
                  >
                    Release Final Evaluation (Stage 5)
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL: Admin Lifecycle Override */}
      <Modal
        isOpen={Boolean(overrideSc)}
        onClose={() => setOverrideSc(null)}
        size="md"
        title="Admin Appraisal Lifecycle Override"
        subtitle="Unlock or revert scorecard lifecycle stage with mandatory audit trail logging."
      >
        {overrideSc && (
          <form onSubmit={handleAdminLifecycleOverride} className="space-y-4">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900">
              Current Stage for <strong>{overrideSc.employeeName}</strong>:{' '}
              <Badge variant="warning">{overrideSc.status}</Badge>
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                Target Lifecycle Stage *
              </label>
              <select
                value={overrideTargetStage}
                onChange={(e) =>
                  setOverrideTargetStage(
                    e.target.value as AppraisalLifecycleStatus
                  )
                }
                className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg bg-white"
              >
                {LIFECYCLE_STAGES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                Mandatory Audit Justification *
              </label>
              <textarea
                rows={2}
                required
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="Explain why this scorecard stage is being unlocked or reverted..."
                className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOverrideSc(null)}
              >
                Cancel
              </Button>
              <Button type="submit" variant="danger">
                Execute Lifecycle Override
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* MODAL: Inline KPI Chat & Scorecard Comments Thread */}
      <Modal
        isOpen={Boolean(activeChatKpi)}
        onClose={() => setActiveChatKpi(null)}
        size="md"
        title={activeChatKpi?.title || 'Scorecard Discussion Thread'}
        subtitle="Real-time inline KPI chat & appraisal feedback thread (perform_comments)."
      >
        {activeChatKpi && (
          <div className="space-y-4">
            <div className="max-h-72 overflow-y-auto space-y-2.5 p-3 bg-neutral-50 border border-neutral-200 rounded-lg">
              {comments
                .filter(
                  (c) =>
                    c.scorecardId === activeChatKpi.scorecardId &&
                    (activeChatKpi.kpiId
                      ? c.kpiId === activeChatKpi.kpiId
                      : !c.kpiId)
                )
                .map((c) => (
                  <div
                    key={c.id}
                    className="p-2.5 bg-white border border-neutral-200 rounded-lg text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-neutral-900">
                        {c.authorName} ({c.authorRole})
                      </span>
                      <span className="text-[10px] text-neutral-400">
                        {new Date(c.createdAt).toLocaleTimeString()}
                      </span>
                    </div>
                    <p className="text-neutral-700 mt-1">{c.message}</p>
                  </div>
                ))}
              {comments.filter(
                (c) =>
                  c.scorecardId === activeChatKpi.scorecardId &&
                  (activeChatKpi.kpiId
                    ? c.kpiId === activeChatKpi.kpiId
                    : !c.kpiId)
              ).length === 0 && (
                <div className="text-center text-xs text-neutral-400 py-6">
                  No messages in this thread yet. Start the conversation below.
                </div>
              )}
            </div>

            <form onSubmit={handleAddComment} className="flex gap-2">
              <input
                type="text"
                required
                value={newCommentText}
                onChange={(e) => setNewCommentText(e.target.value)}
                placeholder="Write a comment or KPI note..."
                className="flex-1 px-3 py-2 text-xs border border-neutral-300 rounded-lg"
              />
              <Button type="submit" variant="primary" size="sm">
                Post
              </Button>
            </form>
          </div>
        )}
      </Modal>
    </div>
  );
};
