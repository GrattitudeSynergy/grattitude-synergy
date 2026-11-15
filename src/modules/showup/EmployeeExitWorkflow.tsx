import React, { useState, useEffect, useMemo } from 'react';
import {
  LogOut,
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Trash2,
  Upload,
  ShieldCheck,
  Bell,
  UserCheck,
  Briefcase,
} from 'lucide-react';
import {
  Card,
  Button,
  Badge,
  Table,
  Modal,
  EmptyState,
  useToast,
} from '../../core/components/DesignSystem';
import { FirestoreEngine } from '../../core/firebase/firebaseConfig';
import { PermissionsService } from '../../core/services/permissionsService';
import { AuditService } from '../../core/services/auditService';
import { NotificationService } from '../../core/services/notificationService';
import type {
  Employee,
  EmployeeExitRecord,
  ExitWorkflowStage,
  ExitWorkPlanTask,
} from '../../core/types';

interface EmployeeExitWorkflowProps {
  currentEmployee: Employee;
  employees: Employee[];
}

const EXIT_STAGES_ORDERED: Array<{
  key: keyof EmployeeExitRecord['stageChecklist'];
  stageLabel: ExitWorkflowStage;
  title: string;
  ownerRole: 'Employee' | 'Manager' | 'HR / Admin';
}> = [
  {
    key: 'resignationSubmitted',
    stageLabel: 'Resignation Submitted',
    title: '1. Resignation Submission',
    ownerRole: 'Employee',
  },
  {
    key: 'managerReview',
    stageLabel: 'Manager Review',
    title: '2. Reporting Manager Review',
    ownerRole: 'Manager',
  },
  {
    key: 'workPlanUpload',
    stageLabel: 'Work Plan Uploaded',
    title: '3. Manager Work Plan Upload (Within 2 Days)',
    ownerRole: 'Manager',
  },
  {
    key: 'hrReview',
    stageLabel: 'HR Review',
    title: '4. HR Review & Last Working Day Confirmation',
    ownerRole: 'HR / Admin',
  },
  {
    key: 'noticePeriodTracking',
    stageLabel: 'Notice Period Active',
    title: '5. Notice Period Tracking',
    ownerRole: 'HR / Admin',
  },
  {
    key: 'ktAndHandover',
    stageLabel: 'KT & Handover',
    title: '6. Knowledge Transfer (KT) & Handover',
    ownerRole: 'Manager',
  },
  {
    key: 'departmentalClearance',
    stageLabel: 'Departmental Clearance',
    title: '7. Departmental Clearance (IT, Ops, Finance)',
    ownerRole: 'HR / Admin',
  },
  {
    key: 'assetReturn',
    stageLabel: 'Asset Return',
    title: '8. Corporate Asset & ID Return',
    ownerRole: 'HR / Admin',
  },
  {
    key: 'finalSettlement',
    stageLabel: 'Final Settlement',
    title: '9. Full & Final (F&F) Settlement Coordination',
    ownerRole: 'HR / Admin',
  },
  {
    key: 'finalExitConfirmation',
    stageLabel: 'Exit Confirmed',
    title: '10. Final Exit Confirmation & Relieving Letter',
    ownerRole: 'HR / Admin',
  },
];

export const EmployeeExitWorkflow: React.FC<EmployeeExitWorkflowProps> = ({
  currentEmployee,
  employees,
}) => {
  const { showToast } = useToast();
  const [exitRecords, setExitRecords] = useState<EmployeeExitRecord[]>([]);

  // Resignation Submission Form State
  const [resignModalOpen, setResignModalOpen] = useState(false);
  const [resignDate, setResignDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );
  const defaultNoticeDays = currentEmployee.employment?.noticePeriodDays ?? 30;
  const [proposedLwd, setProposedLwd] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + defaultNoticeDays);
    return d.toISOString().slice(0, 10);
  });
  const [reasonCategory, setReasonCategory] = useState<
    EmployeeExitRecord['reasonCategory']
  >('Career Growth / Better Opportunity');
  const [detailedReason, setDetailedReason] = useState('');

  // Manager Work Plan Upload Modal (Mandatory within 2 days)
  const [workPlanExitRecord, setWorkPlanExitRecord] =
    useState<EmployeeExitRecord | null>(null);
  const [workPlanSummary, setWorkPlanSummary] = useState('');
  const [workPlanTasks, setWorkPlanTasks] = useState<ExitWorkPlanTask[]>([]);

  // New Task Inputs inside Work Plan Builder
  const [taskProject, setTaskProject] = useState('');
  const [taskPendingDesc, setTaskPendingDesc] = useState('');
  const [taskHandoverDetails, setTaskHandoverDetails] = useState('');
  const [taskKtReq, setTaskKtReq] = useState('');
  const [taskDeadline, setTaskDeadline] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [taskAssigneeId, setTaskAssigneeId] = useState('');

  // Stage Checklist Inspector Modal
  const [inspectExitRecord, setInspectExitRecord] =
    useState<EmployeeExitRecord | null>(null);
  const [stageNoteInput, setStageNoteInput] = useState('');

  useEffect(() => {
    const unsub = FirestoreEngine.subscribeCollection<EmployeeExitRecord>(
      'showup_exit_requests',
      (items) => {
        const sorted = [...items].sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        setExitRecords(sorted);
      }
    );
    return () => unsub();
  }, []);

  const isAdmin = PermissionsService.isAdmin(currentEmployee);
  const isCEO = PermissionsService.isCEO(currentEmployee);
  const currentNormId = PermissionsService.normalizeEmpId(currentEmployee.id);
  const currentNormEcode = PermissionsService.normalizeEmpId(
    currentEmployee.ecode
  );

  // Employee's own exit records
  const myExitRecords = useMemo(() => {
    return exitRecords.filter((r) => {
      const rNorm = PermissionsService.normalizeEmpId(r.employeeId);
      return rNorm === currentNormId || rNorm === currentNormEcode;
    });
  }, [exitRecords, currentNormId, currentNormEcode]);

  // Manager / HR / Admin queue
  const managedExitRecords = useMemo(() => {
    if (isAdmin || isCEO) return exitRecords;
    return exitRecords.filter((r) => {
      const mgrNorm = PermissionsService.normalizeEmpId(r.reportingManagerId);
      return mgrNorm === currentNormId || mgrNorm === currentNormEcode;
    });
  }, [exitRecords, isAdmin, isCEO, currentNormId, currentNormEcode]);

  // Check if a Manager Work Plan upload is due or overdue (within 2 days of resignation submission)
  const getWorkPlanSlaStatus = (rec: EmployeeExitRecord) => {
    if (rec.stageChecklist.workPlanUpload.completed) {
      return {
        status: 'Uploaded',
        variant: 'success' as const,
        label: `Uploaded by ${rec.workPlanUploadedBy || 'Manager'}`,
      };
    }
    const dueMs = new Date(rec.workPlanDueDate).getTime();
    const nowMs = Date.now();
    const hoursRemaining = Math.round((dueMs - nowMs) / (1000 * 60 * 60));

    if (hoursRemaining < 0) {
      return {
        status: 'Overdue',
        variant: 'danger' as const,
        label: `OVERDUE (2-Day SLA Breached — Due ${rec.workPlanDueDate.slice(0, 10)})`,
      };
    }
    return {
      status: 'Pending',
      variant: 'warning' as const,
      label: `Due within ${Math.max(1, hoursRemaining)}h (Deadline: ${rec.workPlanDueDate.slice(0, 10)})`,
    };
  };

  // Step 1: Employee Submits Resignation
  const handleSubmitResignation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailedReason.trim()) return;

    const mgr = employees.find(
      (m) =>
        PermissionsService.normalizeEmpId(m.id) ===
          PermissionsService.normalizeEmpId(
            currentEmployee.reportingManagerId
          ) ||
        PermissionsService.normalizeEmpId(m.ecode) ===
          PermissionsService.normalizeEmpId(currentEmployee.reportingManagerId)
    );

    const submittedAt = new Date();
    const workPlanDue = new Date(
      submittedAt.getTime() + 2 * 24 * 60 * 60 * 1000
    );

    const newExit: EmployeeExitRecord = {
      id: `exit_${currentEmployee.id}_${Date.now()}`,
      employeeId: currentEmployee.id,
      employeeName: currentEmployee.name,
      employeeEcode: currentEmployee.ecode,
      designation: currentEmployee.designation,
      department: currentEmployee.department,
      reportingManagerId:
        mgr?.id || currentEmployee.reportingManagerId || 'EMP-001',
      reportingManagerName: mgr?.name || 'Corporate Super Admin',
      resignationDate: resignDate,
      noticePeriodDays: defaultNoticeDays,
      proposedLastWorkingDay: proposedLwd,
      approvedLastWorkingDay: proposedLwd,
      reasonCategory,
      detailedReason: detailedReason.trim(),
      currentStage: 'Manager Review',
      status: 'Active Exit Process',
      workPlanDueDate: workPlanDue.toISOString(),
      workPlanTasks: [],
      stageChecklist: {
        resignationSubmitted: {
          completed: true,
          completedAt: submittedAt.toISOString(),
          actor: currentEmployee.name,
          notes: `Submitted resignation (Proposed LWD: ${proposedLwd})`,
        },
        managerReview: { completed: false },
        workPlanUpload: { completed: false },
        hrReview: { completed: false },
        noticePeriodTracking: { completed: false },
        ktAndHandover: { completed: false },
        departmentalClearance: { completed: false },
        assetReturn: { completed: false },
        finalSettlement: { completed: false },
        finalExitConfirmation: { completed: false },
      },
      createdAt: submittedAt.toISOString(),
      updatedAt: submittedAt.toISOString(),
    };

    await FirestoreEngine.setDocument(
      'showup_exit_requests',
      newExit.id,
      newExit
    );

    // Send automatic notifications to Reporting Manager & HR/Admin with 2-day Work Plan upload reminder
    await NotificationService.create({
      recipientId: newExit.reportingManagerId,
      title: 'ACTION REQUIRED: Employee Resignation & 2-Day Work Plan Upload',
      message: `${currentEmployee.name} (${currentEmployee.ecode}) submitted their resignation (Proposed LWD: ${proposedLwd}). As Reporting Manager, you must upload their Work Plan & Handover Schedule within 2 days (by ${workPlanDue.toISOString().slice(0, 10)}).`,
      route: '/showup',
      actorName: currentEmployee.name,
    });

    if (newExit.reportingManagerId !== 'EMP-001') {
      await NotificationService.create({
        recipientId: 'EMP-001',
        title: 'New Employee Resignation Initiated (HR Exit Monitor)',
        message: `${currentEmployee.name} (${currentEmployee.ecode}) submitted resignation (Proposed LWD: ${proposedLwd}). Manager ${newExit.reportingManagerName} has been notified to upload the Work Plan within 2 days.`,
        route: '/showup',
        actorName: currentEmployee.name,
      });
    }

    await AuditService.log({
      action: 'EMPLOYEE_RESIGNATION_SUBMITTED',
      actor: currentEmployee,
      targetId: newExit.id,
      targetType: 'EmployeeExitRecord',
      details: `${currentEmployee.name} (${currentEmployee.ecode}) submitted resignation on ${resignDate} with proposed LWD ${proposedLwd} (${reasonCategory}). 2-day Manager Work Plan deadline: ${workPlanDue.toISOString().slice(0, 10)}.`,
    });

    showToast(
      'info',
      'Resignation Submitted',
      `Your resignation has been logged. Your Reporting Manager (${newExit.reportingManagerName}) has been notified to upload the Work Plan within 2 days.`
    );
    setDetailedReason('');
    setResignModalOpen(false);
  };

  // Manager Work Plan Builder: Add Task
  const handleAddTaskToWorkPlan = () => {
    if (!taskProject.trim() || !taskPendingDesc.trim() || !taskAssigneeId) {
      showToast(
        'warning',
        'Incomplete Task Details',
        'Please enter the project/responsibility, pending task description, and person responsible for taking over.'
      );
      return;
    }

    const assignee = employees.find((e) => e.id === taskAssigneeId);
    const newTask: ExitWorkPlanTask = {
      id: `wpt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      projectOrResponsibility: taskProject.trim(),
      pendingTaskDescription: taskPendingDesc.trim(),
      handoverDetails:
        taskHandoverDetails.trim() || 'Standard documentation & walkthrough',
      ktRequirement:
        taskKtReq.trim() || 'Live KT session + repository walkthrough',
      deadline: taskDeadline,
      handoverToEmployeeId: taskAssigneeId,
      handoverToEmployeeName: assignee
        ? `${assignee.name} (${assignee.ecode})`
        : taskAssigneeId,
      status: 'Pending',
    };

    setWorkPlanTasks((prev) => [...prev, newTask]);
    setTaskProject('');
    setTaskPendingDesc('');
    setTaskHandoverDetails('');
    setTaskKtReq('');
  };

  // Save Manager Work Plan (Completes Stage 2 & Stage 3 and notifies handover owners + HR)
  const handleSaveManagerWorkPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workPlanExitRecord) return;
    if (workPlanTasks.length === 0) {
      showToast(
        'error',
        'Work Plan Tasks Required',
        'Please add at least one responsibility / handover task with an assigned person before uploading the Work Plan.'
      );
      return;
    }

    const nowIso = new Date().toISOString();
    const updatedChecklist = {
      ...workPlanExitRecord.stageChecklist,
      managerReview: {
        completed: true,
        completedAt:
          workPlanExitRecord.stageChecklist.managerReview.completedAt || nowIso,
        actor: currentEmployee.name,
        notes: 'Manager reviewed resignation and prepared handover work plan.',
      },
      workPlanUpload: {
        completed: true,
        completedAt: nowIso,
        actor: currentEmployee.name,
        notes: `Uploaded Work Plan with ${workPlanTasks.length} handover task(s).`,
      },
    };

    const updatedRecord: EmployeeExitRecord = {
      ...workPlanExitRecord,
      workPlanUploadedAt: nowIso,
      workPlanUploadedBy: currentEmployee.name,
      workPlanSummary:
        workPlanSummary.trim() ||
        `Structured transition & KT work plan covering ${workPlanTasks.length} critical deliverables.`,
      workPlanTasks,
      currentStage: 'HR Review',
      stageChecklist: updatedChecklist,
      updatedAt: nowIso,
    };

    await FirestoreEngine.setDocument(
      'showup_exit_requests',
      updatedRecord.id,
      updatedRecord
    );

    // Notify Employee, HR/Admin, and every handover assignee
    await NotificationService.create({
      recipientId: updatedRecord.employeeId,
      title: 'Manager Uploaded Your Exit Work Plan & KT Schedule',
      message: `${currentEmployee.name} uploaded your transition Work Plan (${workPlanTasks.length} tasks). Please complete Knowledge Transfer before your Last Working Day (${updatedRecord.proposedLastWorkingDay}).`,
      route: '/showup',
      actorName: currentEmployee.name,
    });

    await NotificationService.create({
      recipientId: 'EMP-001',
      title: 'Exit Work Plan Uploaded — Ready for HR Review',
      message: `${currentEmployee.name} uploaded the mandatory Work Plan for ${updatedRecord.employeeName} (${updatedRecord.employeeEcode}).`,
      route: '/showup',
      actorName: currentEmployee.name,
    });

    for (const task of workPlanTasks) {
      await NotificationService.create({
        recipientId: task.handoverToEmployeeId,
        title: 'Handover & Knowledge Transfer Task Assigned',
        message: `You have been assigned to take over "${task.projectOrResponsibility}" (${task.pendingTaskDescription}) from ${updatedRecord.employeeName} by ${task.deadline}.`,
        route: '/showup',
        actorName: currentEmployee.name,
      });
    }

    await AuditService.log({
      action: 'EXIT_WORK_PLAN_UPLOADED',
      actor: currentEmployee,
      targetId: updatedRecord.id,
      targetType: 'EmployeeExitRecord',
      details: `Uploaded mandatory Manager Work Plan for ${updatedRecord.employeeName} (${updatedRecord.employeeEcode}) with ${workPlanTasks.length} task(s).`,
    });

    showToast(
      'success',
      'Manager Work Plan Uploaded',
      `Transition work plan with ${workPlanTasks.length} task(s) saved and notifications sent.`
    );
    setWorkPlanExitRecord(null);
  };

  // Toggle individual Work Plan Task status (Pending -> In Progress -> Completed)
  const handleToggleWorkPlanTaskStatus = async (
    rec: EmployeeExitRecord,
    taskId: string,
    nextStatus: ExitWorkPlanTask['status']
  ) => {
    const nextTasks = rec.workPlanTasks.map((t) =>
      t.id === taskId ? { ...t, status: nextStatus } : t
    );
    const updated: EmployeeExitRecord = {
      ...rec,
      workPlanTasks: nextTasks,
      updatedAt: new Date().toISOString(),
    };
    await FirestoreEngine.setDocument(
      'showup_exit_requests',
      rec.id,
      updated
    );
    if (inspectExitRecord?.id === rec.id) {
      setInspectExitRecord(updated);
    }
    showToast(
      'info',
      'Handover Task Updated',
      `Task status updated to ${nextStatus}.`
    );
  };

  // Advance or Toggle any of the 10 Exit Workflow Stages
  const handleCompleteExitStage = async (
    rec: EmployeeExitRecord,
    stageKey: keyof EmployeeExitRecord['stageChecklist'],
    stageLabel: ExitWorkflowStage
  ) => {
    const nowIso = new Date().toISOString();
    const updatedChecklist = {
      ...rec.stageChecklist,
      [stageKey]: {
        completed: true,
        completedAt: nowIso,
        actor: currentEmployee.name,
        notes: stageNoteInput.trim() || `Completed ${stageLabel}`,
      },
    };

    // Determine next active stage
    const nextIncomplete = EXIT_STAGES_ORDERED.find(
      (s) => !updatedChecklist[s.key].completed
    );
    const nextStageLabel: ExitWorkflowStage = nextIncomplete
      ? nextIncomplete.stageLabel
      : 'Exit Confirmed';
    const isFinalComplete = !nextIncomplete;

    const updatedRecord: EmployeeExitRecord = {
      ...rec,
      currentStage: nextStageLabel,
      status: isFinalComplete ? 'Completed & Exited' : 'Active Exit Process',
      stageChecklist: updatedChecklist,
      updatedAt: nowIso,
    };

    await FirestoreEngine.setDocument(
      'showup_exit_requests',
      rec.id,
      updatedRecord
    );

    // If Final Exit Confirmation is completed, mark employee status as 'Exited' in Employee Master
    if (isFinalComplete) {
      const empDoc = employees.find((e) => e.id === rec.employeeId);
      if (empDoc) {
        await FirestoreEngine.setDocument('employees', empDoc.id, {
          ...empDoc,
          status: 'Exited',
          updatedAt: nowIso,
        });
      }
    }

    await NotificationService.create({
      recipientId: rec.employeeId,
      title: `Exit Workflow Update: ${stageLabel}`,
      message: `Stage "${stageLabel}" has been marked complete by ${currentEmployee.name}.`,
      route: '/showup',
      actorName: currentEmployee.name,
    });

    await AuditService.log({
      action: `EXIT_STAGE_${stageKey.toUpperCase()}_COMPLETED`,
      actor: currentEmployee,
      targetId: rec.id,
      targetType: 'EmployeeExitRecord',
      details: `Completed exit stage "${stageLabel}" for ${rec.employeeName} (${rec.employeeEcode}).`,
    });

    setStageNoteInput('');
    setInspectExitRecord(updatedRecord);
    showToast(
      'success',
      'Exit Workflow Stage Completed',
      `${stageLabel} marked as completed for ${rec.employeeName}.`
    );
  };

  // Send Reminder Notification to Manager / Handover Owner
  const handleSendExitReminder = async (rec: EmployeeExitRecord) => {
    await NotificationService.create({
      recipientId: rec.reportingManagerId,
      title: 'REMINDER: Pending Exit Work Plan / Handover Review',
      message: `Reminder from ${currentEmployee.name}: Please ensure the Work Plan and Knowledge Transfer tasks for ${rec.employeeName} (${rec.employeeEcode}) are updated (LWD: ${rec.proposedLastWorkingDay}).`,
      route: '/showup',
      actorName: currentEmployee.name,
    });
    showToast(
      'info',
      'Automatic Reminder Sent',
      `Notification sent to ${rec.reportingManagerName} and handover stakeholders.`
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Resignation Action Card */}
      <Card
        title={
          <div className="flex items-center gap-2">
            <LogOut className="w-4 h-4 text-rose-600" />
            <span>
              Employee Exit & Notice Period Management Workflow (GreytHR Standard)
            </span>
          </div>
        }
        subtitle="10-Stage structured separation lifecycle: Resignation Submission → Manager Review → Mandatory 2-Day Manager Work Plan Upload → HR Review → Notice Period Tracking → KT & Handover → Departmental Clearance → Asset Return → Final Settlement → Exit Confirmation."
        action={
          <Button
            variant="danger"
            size="sm"
            icon={<Plus className="w-4 h-4" />}
            onClick={() => setResignModalOpen(true)}
          >
            Submit Resignation
          </Button>
        }
      >
        {/* 10-Stage Workflow Visual Pipeline */}
        <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-2">
          {EXIT_STAGES_ORDERED.map((st, idx) => (
            <div
              key={st.key}
              className="p-2.5 bg-neutral-50 border border-neutral-200 rounded-lg text-center flex flex-col justify-between"
            >
              <div className="text-[10px] font-mono font-bold text-sky-700">
                Stage {idx + 1}
              </div>
              <div className="text-[11px] font-bold text-neutral-800 leading-tight my-1">
                {st.stageLabel}
              </div>
              <div className="text-[9px] uppercase font-semibold text-neutral-400">
                {st.ownerRole}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* My Personal Exit / Resignation Status (If Current Employee Submitted) */}
      {myExitRecords.length > 0 && (
        <Card
          title="My Resignation & Notice Period Tracker"
          subtitle="Track your notice period countdown, manager work plan, and departmental clearance stages."
        >
          {myExitRecords.map((rec) => {
            const completedStagesCount = Object.values(
              rec.stageChecklist
            ).filter((s) => s.completed).length;
            const sla = getWorkPlanSlaStatus(rec);

            return (
              <div
                key={rec.id}
                className="p-4 border border-neutral-200 rounded-xl space-y-4 bg-neutral-50/50"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-extrabold text-neutral-900">
                        {rec.employeeName} ({rec.employeeEcode})
                      </span>
                      <Badge variant="warning">{rec.currentStage}</Badge>
                      <Badge variant={sla.variant}>
                        Work Plan: {sla.label}
                      </Badge>
                    </div>
                    <div className="text-xs text-neutral-600 mt-1">
                      Resignation Date: <strong>{rec.resignationDate}</strong> •
                      Proposed Last Working Day:{' '}
                      <strong className="text-rose-700">
                        {rec.proposedLastWorkingDay}
                      </strong>{' '}
                      ({rec.noticePeriodDays} days notice) • Reason:{' '}
                      {rec.reasonCategory}
                    </div>
                  </div>
                  <Button
                    size="xs"
                    variant="primary"
                    onClick={() => setInspectExitRecord(rec)}
                  >
                    View 10-Stage Checklist & KT Tasks ({completedStagesCount}/10)
                  </Button>
                </div>

                {rec.workPlanTasks.length > 0 && (
                  <div>
                    <div className="text-xs font-bold text-neutral-800 mb-2">
                      Assigned Knowledge Transfer (KT) & Handover Work Plan Tasks:
                    </div>
                    <Table
                      headers={[
                        'Project / Responsibility',
                        'Pending Task',
                        'Handover & KT Details',
                        'Deadline',
                        'Taking Over Person',
                        'Status',
                      ]}
                    >
                      {rec.workPlanTasks.map((t) => (
                        <tr key={t.id}>
                          <td className="px-3 py-2 text-xs font-bold">
                            {t.projectOrResponsibility}
                          </td>
                          <td className="px-3 py-2 text-xs">
                            {t.pendingTaskDescription}
                          </td>
                          <td className="px-3 py-2 text-xs text-neutral-600">
                            {t.handoverDetails} • KT: {t.ktRequirement}
                          </td>
                          <td className="px-3 py-2 text-xs font-mono">
                            {t.deadline}
                          </td>
                          <td className="px-3 py-2 text-xs font-bold text-sky-800">
                            {t.handoverToEmployeeName}
                          </td>
                          <td className="px-3 py-2">
                            <select
                              value={t.status}
                              onChange={(e) =>
                                handleToggleWorkPlanTaskStatus(
                                  rec,
                                  t.id,
                                  e.target.value as any
                                )
                              }
                              className="px-2 py-1 text-xs font-bold border border-neutral-300 rounded-md bg-white"
                            >
                              <option value="Pending">Pending</option>
                              <option value="In Progress">In Progress</option>
                              <option value="Completed">Completed</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                    </Table>
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      )}

      {/* Manager / HR / Admin Exit Workflow Monitor & History Registry */}
      <Card
        title={
          isAdmin || isCEO
            ? 'HR / Admin Organization Exit & Notice Period Monitor (All Employees)'
            : 'Reporting Manager Exit Workflow & Mandatory 2-Day Work Plan Queue'
        }
        subtitle="Within 2 days of an employee submitting their resignation, the Reporting Manager must upload the employee's Work Plan (responsibilities, pending tasks, handover details, KT requirements, deadlines, and person taking over)."
      >
        {managedExitRecords.length === 0 ? (
          <EmptyState
            title="No Active or Historical Exit Records"
            description="When an employee submits a resignation, the 10-stage exit workflow, 2-day manager work plan SLA tracker, and handover checklist appear here."
          />
        ) : (
          <Table
            headers={[
              'Employee & Dept',
              'Resignation & Last Working Day',
              'Reporting Manager',
              'Manager Work Plan (2-Day SLA)',
              'Current Exit Stage',
              'Pending Tasks',
              'Workflow Controls',
            ]}
          >
            {managedExitRecords.map((rec) => {
              const sla = getWorkPlanSlaStatus(rec);
              const pendingTasksCount = rec.workPlanTasks.filter(
                (t) => t.status !== 'Completed'
              ).length;
              const completedStages = Object.values(rec.stageChecklist).filter(
                (s) => s.completed
              ).length;

              return (
                <tr key={rec.id} className="hover:bg-neutral-50">
                  <td className="px-3 py-3">
                    <div className="text-xs font-bold text-neutral-900">
                      {rec.employeeName} ({rec.employeeEcode})
                    </div>
                    <div className="text-[11px] text-neutral-500">
                      {rec.designation} • {rec.department}
                    </div>
                  </td>

                  <td className="px-3 py-3 text-xs font-mono">
                    <div>Resigned: {rec.resignationDate}</div>
                    <div className="font-bold text-rose-700">
                      LWD: {rec.proposedLastWorkingDay} ({rec.noticePeriodDays}d)
                    </div>
                  </td>

                  <td className="px-3 py-3 text-xs font-semibold text-neutral-800">
                    {rec.reportingManagerName}
                  </td>

                  <td className="px-3 py-3">
                    <Badge variant={sla.variant}>{sla.label}</Badge>
                  </td>

                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1.5">
                      <Badge
                        variant={
                          rec.status === 'Completed & Exited'
                            ? 'success'
                            : 'info'
                        }
                      >
                        {rec.currentStage}
                      </Badge>
                      <span className="text-[11px] font-mono text-neutral-500">
                        ({completedStages}/10)
                      </span>
                    </div>
                  </td>

                  <td className="px-3 py-3 text-xs">
                    {rec.workPlanTasks.length === 0 ? (
                      <span className="text-amber-700 font-semibold">
                        Awaiting Work Plan
                      </span>
                    ) : (
                      <span className="font-mono font-bold text-neutral-800">
                        {pendingTasksCount} Pending / {rec.workPlanTasks.length}{' '}
                        Total
                      </span>
                    )}
                  </td>

                  <td className="px-3 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button
                        size="xs"
                        variant={
                          rec.stageChecklist.workPlanUpload.completed
                            ? 'outline'
                            : 'primary'
                        }
                        icon={<Upload className="w-3 h-3" />}
                        onClick={() => {
                          setWorkPlanExitRecord(rec);
                          setWorkPlanSummary(rec.workPlanSummary || '');
                          setWorkPlanTasks(rec.workPlanTasks || []);
                          setTaskDeadline(rec.proposedLastWorkingDay);
                        }}
                      >
                        {rec.stageChecklist.workPlanUpload.completed
                          ? 'Edit Work Plan'
                          : 'Upload Work Plan'}
                      </Button>

                      <Button
                        size="xs"
                        variant="secondary"
                        icon={<ShieldCheck className="w-3 h-3" />}
                        onClick={() => setInspectExitRecord(rec)}
                      >
                        Manage 10 Stages
                      </Button>

                      {(isAdmin || isCEO) &&
                        rec.status !== 'Completed & Exited' && (
                          <Button
                            size="xs"
                            variant="outline"
                            icon={<Bell className="w-3 h-3" />}
                            onClick={() => handleSendExitReminder(rec)}
                          >
                            Remind
                          </Button>
                        )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      {/* MODAL 1: Submit Resignation */}
      <Modal
        isOpen={resignModalOpen}
        onClose={() => setResignModalOpen(false)}
        size="md"
        title="Submit Formal Resignation"
        subtitle={`Standard Notice Period: ${defaultNoticeDays} days. Your Reporting Manager will be notified immediately to upload your Work Plan within 2 days.`}
      >
        <form onSubmit={handleSubmitResignation} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                Resignation Date *
              </label>
              <input
                type="date"
                required
                value={resignDate}
                onChange={(e) => {
                  setResignDate(e.target.value);
                  const d = new Date(e.target.value);
                  if (!isNaN(d.getTime())) {
                    d.setDate(d.getDate() + defaultNoticeDays);
                    setProposedLwd(d.toISOString().slice(0, 10));
                  }
                }}
                className="w-full px-3 py-2 text-xs font-mono border border-neutral-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                Proposed Last Working Day *
              </label>
              <input
                type="date"
                required
                value={proposedLwd}
                onChange={(e) => setProposedLwd(e.target.value)}
                className="w-full px-3 py-2 text-xs font-mono font-bold border border-neutral-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">
              Primary Reason Category *
            </label>
            <select
              value={reasonCategory}
              onChange={(e) => setReasonCategory(e.target.value as any)}
              className="w-full px-3 py-2 text-xs font-bold border border-neutral-300 rounded-lg bg-white"
            >
              <option value="Career Growth / Better Opportunity">
                Career Growth / Better Opportunity
              </option>
              <option value="Higher Education">Higher Education</option>
              <option value="Relocation / Personal">
                Relocation / Personal
              </option>
              <option value="Health / Family Reasons">
                Health / Family Reasons
              </option>
              <option value="Role / Compensation Alignment">
                Role / Compensation Alignment
              </option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">
              Detailed Reason & Transition Notes *
            </label>
            <textarea
              rows={3}
              required
              value={detailedReason}
              onChange={(e) => setDetailedReason(e.target.value)}
              placeholder="Please share your reason for resignation and initial thoughts on project handover..."
              className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setResignModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="danger">
              Confirm & Submit Resignation
            </Button>
          </div>
        </form>
      </Modal>

      {/* MODAL 2: Manager Work Plan Upload (Mandatory Within 2 Days) */}
      <Modal
        isOpen={Boolean(workPlanExitRecord)}
        onClose={() => setWorkPlanExitRecord(null)}
        size="2xl"
        title={
          workPlanExitRecord
            ? `Upload Manager Work Plan & Handover Schedule — ${workPlanExitRecord.employeeName} (${workPlanExitRecord.employeeEcode})`
            : 'Upload Work Plan'
        }
        subtitle="Mandatory within 2 days of resignation submission. Document ongoing projects, pending tasks, handover details, KT requirements, deadlines, and the person responsible for taking over each task."
      >
        {workPlanExitRecord && (
          <form onSubmit={handleSaveManagerWorkPlan} className="space-y-4">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900">
              <span>
                <strong>Resignation Date:</strong>{' '}
                {workPlanExitRecord.resignationDate} •{' '}
                <strong>Proposed LWD:</strong>{' '}
                {workPlanExitRecord.proposedLastWorkingDay}
              </span>
              <span>
                <strong>2-Day Upload Deadline:</strong>{' '}
                {workPlanExitRecord.workPlanDueDate.slice(0, 10)}
              </span>
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                Overall Transition & Work Plan Summary
              </label>
              <input
                type="text"
                value={workPlanSummary}
                onChange={(e) => setWorkPlanSummary(e.target.value)}
                placeholder="High-level summary of responsibilities and transition plan..."
                className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
              />
            </div>

            {/* Add Task Builder */}
            <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-xl space-y-3">
              <div className="text-xs font-bold text-neutral-800 flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5 text-sky-600" />
                <span>
                  Add Responsibility, Pending Task & Handover Owner
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                    Current Responsibility / Ongoing Project *
                  </label>
                  <input
                    type="text"
                    value={taskProject}
                    onChange={(e) => setTaskProject(e.target.value)}
                    placeholder="e.g. Q4 Client Deployment / Core API Module"
                    className="w-full px-3 py-1.5 text-xs border border-neutral-300 rounded-lg bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                    Pending Task Description *
                  </label>
                  <input
                    type="text"
                    value={taskPendingDesc}
                    onChange={(e) => setTaskPendingDesc(e.target.value)}
                    placeholder="e.g. Complete UAT sign-off and runbook"
                    className="w-full px-3 py-1.5 text-xs border border-neutral-300 rounded-lg bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                    Handover Details
                  </label>
                  <input
                    type="text"
                    value={taskHandoverDetails}
                    onChange={(e) => setTaskHandoverDetails(e.target.value)}
                    placeholder="e.g. Credentials, architecture docs, client contacts"
                    className="w-full px-3 py-1.5 text-xs border border-neutral-300 rounded-lg bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                    Knowledge Transfer (KT) Requirements
                  </label>
                  <input
                    type="text"
                    value={taskKtReq}
                    onChange={(e) => setTaskKtReq(e.target.value)}
                    placeholder="e.g. 2 recorded KT walkthrough sessions"
                    className="w-full px-3 py-1.5 text-xs border border-neutral-300 rounded-lg bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                    Important Deadline *
                  </label>
                  <input
                    type="date"
                    value={taskDeadline}
                    onChange={(e) => setTaskDeadline(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs font-mono border border-neutral-300 rounded-lg bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-neutral-700 mb-1">
                    Person Responsible for Taking Over *
                  </label>
                  <select
                    value={taskAssigneeId}
                    onChange={(e) => setTaskAssigneeId(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs font-bold border border-neutral-300 rounded-lg bg-white"
                  >
                    <option value="">-- Select Handover Owner --</option>
                    {employees
                      .filter(
                        (e) =>
                          e.id !== workPlanExitRecord.employeeId &&
                          e.status === 'Active'
                      )
                      .map((emp) => (
                        <option key={emp.id} value={emp.id}>
                          {emp.name} ({emp.ecode}) — {emp.designation}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  type="button"
                  size="xs"
                  variant="secondary"
                  icon={<Plus className="w-3.5 h-3.5" />}
                  onClick={handleAddTaskToWorkPlan}
                >
                  Add Task to Work Plan
                </Button>
              </div>
            </div>

            {/* Current Tasks in Work Plan */}
            {workPlanTasks.length > 0 && (
              <Table
                headers={[
                  'Project / Responsibility',
                  'Pending Task',
                  'Handover & KT',
                  'Deadline',
                  'Taking Over Person',
                  'Remove',
                ]}
              >
                {workPlanTasks.map((t) => (
                  <tr key={t.id}>
                    <td className="px-3 py-2 text-xs font-bold">
                      {t.projectOrResponsibility}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {t.pendingTaskDescription}
                    </td>
                    <td className="px-3 py-2 text-xs text-neutral-600">
                      {t.handoverDetails} ({t.ktRequirement})
                    </td>
                    <td className="px-3 py-2 text-xs font-mono">
                      {t.deadline}
                    </td>
                    <td className="px-3 py-2 text-xs font-bold text-sky-800">
                      {t.handoverToEmployeeName}
                    </td>
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        onClick={() =>
                          setWorkPlanTasks((prev) =>
                            prev.filter((x) => x.id !== t.id)
                          )
                        }
                        className="text-rose-600 hover:text-rose-800 p-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </Table>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-neutral-200">
              <Button
                type="button"
                variant="outline"
                onClick={() => setWorkPlanExitRecord(null)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                icon={<Upload className="w-4 h-4" />}
              >
                Save & Upload Manager Work Plan
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* MODAL 3: 10-Stage Exit Workflow Checklist & Pending Tasks Inspector */}
      <Modal
        isOpen={Boolean(inspectExitRecord)}
        onClose={() => setInspectExitRecord(null)}
        size="2xl"
        title={
          inspectExitRecord
            ? `Complete 10-Stage Exit Workflow — ${inspectExitRecord.employeeName} (${inspectExitRecord.employeeEcode})`
            : 'Exit Workflow Details'
        }
        subtitle="Monitor every stage from Resignation Submission and Manager Work Plan to Departmental Clearance, Asset Return, Final Settlement, and Final Exit Confirmation."
      >
        {inspectExitRecord && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl">
                <div className="text-neutral-500">Employee & Role</div>
                <div className="font-bold text-neutral-900 mt-0.5">
                  {inspectExitRecord.employeeName} (
                  {inspectExitRecord.employeeEcode})
                </div>
                <div className="text-[11px] text-neutral-500">
                  {inspectExitRecord.designation} •{' '}
                  {inspectExitRecord.department}
                </div>
              </div>

              <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl">
                <div className="text-neutral-500">Notice Period Timeline</div>
                <div className="font-mono font-bold text-neutral-900 mt-0.5">
                  {inspectExitRecord.resignationDate} →{' '}
                  {inspectExitRecord.proposedLastWorkingDay}
                </div>
                <div className="text-[11px] text-rose-700 font-semibold">
                  {inspectExitRecord.noticePeriodDays} Days Notice Period
                </div>
              </div>

              <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl">
                <div className="text-neutral-500">Current Stage & Status</div>
                <div className="mt-1 flex items-center gap-1.5">
                  <Badge variant="info">{inspectExitRecord.currentStage}</Badge>
                  <Badge
                    variant={
                      inspectExitRecord.status === 'Completed & Exited'
                        ? 'success'
                        : 'warning'
                    }
                  >
                    {inspectExitRecord.status}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Optional Stage Completion Note Input */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={stageNoteInput}
                onChange={(e) => setStageNoteInput(e.target.value)}
                placeholder="Optional clearance / sign-off remark before marking a stage complete..."
                className="flex-1 px-3 py-1.5 text-xs border border-neutral-300 rounded-lg"
              />
            </div>

            {/* 10 Stages Table */}
            <Table
              headers={[
                'Stage',
                'Owner',
                'Status',
                'Completed By & Notes',
                'Action',
              ]}
            >
              {EXIT_STAGES_ORDERED.map((st) => {
                const item = inspectExitRecord.stageChecklist[st.key];
                return (
                  <tr key={st.key} className="hover:bg-neutral-50">
                    <td className="px-3 py-2.5 text-xs font-bold text-neutral-900">
                      {st.title}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge variant="neutral">{st.ownerRole}</Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      {item.completed ? (
                        <Badge variant="success">
                          <CheckCircle2 className="w-3 h-3" /> Completed
                        </Badge>
                      ) : (
                        <Badge variant="warning">Pending</Badge>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-neutral-600">
                      {item.completed ? (
                        <div>
                          <span className="font-semibold text-neutral-800">
                            {item.actor}
                          </span>{' '}
                          on{' '}
                          {item.completedAt
                            ? new Date(item.completedAt).toLocaleDateString()
                            : ''}
                          {item.notes && (
                            <div className="text-[11px] text-neutral-500">
                              {item.notes}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-neutral-400">
                          Awaiting sign-off
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {!item.completed && (
                        <Button
                          size="xs"
                          variant="primary"
                          onClick={() =>
                            handleCompleteExitStage(
                              inspectExitRecord,
                              st.key,
                              st.stageLabel
                            )
                          }
                        >
                          Mark Complete
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </Table>

            {/* Pending Tasks & Responsible Persons Table */}
            <div>
              <h4 className="text-xs font-bold uppercase text-neutral-600 mb-2">
                Work Plan Pending Tasks & Responsible Persons (
                {inspectExitRecord.workPlanTasks.length})
              </h4>
              {inspectExitRecord.workPlanTasks.length === 0 ? (
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-center justify-between">
                  <span>
                    Manager Work Plan has not been uploaded yet (Mandatory
                    within 2 days of resignation).
                  </span>
                  <Button
                    size="xs"
                    variant="primary"
                    onClick={() => {
                      const target = inspectExitRecord;
                      setInspectExitRecord(null);
                      setWorkPlanExitRecord(target);
                      setWorkPlanSummary(target.workPlanSummary || '');
                      setWorkPlanTasks(target.workPlanTasks || []);
                    }}
                  >
                    Upload Work Plan Now
                  </Button>
                </div>
              ) : (
                <Table
                  headers={[
                    'Responsibility / Project',
                    'Pending Task',
                    'KT & Handover Details',
                    'Deadline',
                    'Responsible Person',
                    'Task Status',
                  ]}
                >
                  {inspectExitRecord.workPlanTasks.map((t) => (
                    <tr key={t.id}>
                      <td className="px-3 py-2 text-xs font-bold">
                        {t.projectOrResponsibility}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {t.pendingTaskDescription}
                      </td>
                      <td className="px-3 py-2 text-xs text-neutral-600">
                        {t.handoverDetails} • KT: {t.ktRequirement}
                      </td>
                      <td className="px-3 py-2 text-xs font-mono">
                        {t.deadline}
                      </td>
                      <td className="px-3 py-2 text-xs font-bold text-sky-800">
                        <UserCheck className="w-3 h-3 inline mr-1" />
                        {t.handoverToEmployeeName}
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={t.status}
                          onChange={(e) =>
                            handleToggleWorkPlanTaskStatus(
                              inspectExitRecord,
                              t.id,
                              e.target.value as any
                            )
                          }
                          className="px-2 py-1 text-xs font-bold border border-neutral-300 rounded-md bg-white"
                        >
                          <option value="Pending">Pending</option>
                          <option value="In Progress">In Progress</option>
                          <option value="Completed">Completed</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </Table>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
