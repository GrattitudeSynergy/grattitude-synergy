import React, { useState, useEffect } from 'react';
import {
  CheckSquare,
  Compass,
  MessageSquare,
  Plus,
  CheckCircle2,
  Award,
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
import { AuditService } from '../../core/services/auditService';
import type {
  Employee,
  PerformTaskOkr,
  PerformInternRoadmap,
  PerformInternDiscussion,
} from '../../core/types';

export const InternEnablementTrack: React.FC<{
  currentEmployee: Employee;
  allEmployees: Employee[];
}> = ({ currentEmployee, allEmployees }) => {
  const { showToast } = useToast();
  const [subTab, setSubTab] = useState<'tasks' | 'roadmap' | 'discussions'>('tasks');

  const interns = allEmployees.filter((e) => e.level === 0);
  const [selectedInternId, setSelectedInternId] = useState<string>(
    currentEmployee.level === 0
      ? currentEmployee.id
      : interns[0]?.id || currentEmployee.id
  );

  const [tasks, setTasks] = useState<PerformTaskOkr[]>([]);
  const [roadmaps, setRoadmaps] = useState<PerformInternRoadmap[]>([]);
  const [discussions, setDiscussions] = useState<PerformInternDiscussion[]>([]);

  // Modals
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDeliverable, setTaskDeliverable] = useState('');
  const [taskDueDate, setTaskDueDate] = useState(
    new Date().toISOString().slice(0, 10)
  );

  const [discModalOpen, setDiscModalOpen] = useState(false);
  const [reviewType, setReviewType] = useState<
    '1-Month Review' | 'Mid-Term Appraisal' | 'Final Capstone Evaluation'
  >('1-Month Review');
  const [strengths, setStrengths] = useState('');
  const [improvements, setImprovements] = useState('');
  const [summary, setSummary] = useState('');
  const [readiness, setReadiness] = useState<
    'Exceeding Track' | 'On Track' | 'Needs Support'
  >('On Track');

  useEffect(() => {
    const unsubTasks = FirestoreEngine.subscribeCollection<PerformTaskOkr>(
      'perform_tasks',
      setTasks
    );
    const unsubRoadmaps =
      FirestoreEngine.subscribeCollection<PerformInternRoadmap>(
        'perform_intern_roadmaps',
        setRoadmaps
      );
    const unsubDisc =
      FirestoreEngine.subscribeCollection<PerformInternDiscussion>(
        'perform_intern_discussions',
        setDiscussions
      );
    return () => {
      unsubTasks();
      unsubRoadmaps();
      unsubDisc();
    };
  }, []);

  const targetIntern =
    allEmployees.find((e) => e.id === selectedInternId) || currentEmployee;
  const isMentorOrAdmin =
    currentEmployee.role === 'Admin' ||
    currentEmployee.role === 'CEO' ||
    currentEmployee.role === 'Manager' ||
    currentEmployee.isManager;

  // Roadmap matching intern's department or fallback to Engineering
  const activeRoadmap =
    roadmaps.find(
      (r) =>
        r.id === `ROADMAP-${targetIntern.id}` ||
        r.department.toLowerCase() === targetIntern.department.toLowerCase()
    ) || roadmaps[0];

  const internTasks = tasks.filter((t) => t.employeeId === targetIntern.id);
  const internDiscussions = discussions.filter(
    (d) => d.internId === targetIntern.id
  );

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim() || !taskDeliverable.trim()) return;
    const newTask: PerformTaskOkr = {
      id: `task_${Date.now()}`,
      employeeId: targetIntern.id,
      employeeName: targetIntern.name,
      title: taskTitle.trim(),
      deliverable: taskDeliverable.trim(),
      dueDate: taskDueDate,
      progress: 0,
      status: 'In Progress',
      updatedAt: new Date().toISOString(),
    };
    await FirestoreEngine.setDocument('perform_tasks', newTask.id, newTask);
    showToast('success', 'OKR / Milestone Added', newTask.title);
    setTaskTitle('');
    setTaskDeliverable('');
    setTaskModalOpen(false);
  };

  const handleUpdateTaskProgress = async (
    task: PerformTaskOkr,
    newProgress: number
  ) => {
    const clamped = Math.max(0, Math.min(100, newProgress));
    const status =
      clamped === 100
        ? 'Completed'
        : clamped > 0
        ? 'In Progress'
        : 'Not Started';
    await FirestoreEngine.updateDocument<PerformTaskOkr>(
      'perform_tasks',
      task.id,
      {
        progress: clamped,
        status,
        updatedAt: new Date().toISOString(),
      }
    );
  };

  const handleToggleRoadmapStage = async (stageNum: 1 | 2 | 3 | 4) => {
    if (!activeRoadmap) return;
    const updatedStages = activeRoadmap.stages.map((s) =>
      s.stageNumber === stageNum
        ? {
            ...s,
            completed: !s.completed,
            completedAt: !s.completed ? new Date().toISOString() : undefined,
            mentorSignOff: !s.completed ? currentEmployee.name : undefined,
          }
        : s
    );
    await FirestoreEngine.setDocument(
      'perform_intern_roadmaps',
      activeRoadmap.id,
      {
        ...activeRoadmap,
        stages: updatedStages,
        updatedAt: new Date().toISOString(),
      }
    );
    showToast(
      'success',
      'Roadmap Stage Updated',
      `Stage ${stageNum} status updated for ${activeRoadmap.department}.`
    );
  };

  const handleCreateDiscussion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!strengths.trim() || !summary.trim()) return;
    const rec: PerformInternDiscussion = {
      id: `disc_${Date.now()}`,
      internId: targetIntern.id,
      internName: targetIntern.name,
      mentorId: currentEmployee.id,
      mentorName: currentEmployee.name,
      reviewType,
      date: new Date().toISOString().slice(0, 10),
      strengths: strengths.trim(),
      areasOfImprovement: improvements.trim(),
      qualitativeSummary: summary.trim(),
      readinessRating: readiness,
      createdAt: new Date().toISOString(),
    };
    await FirestoreEngine.setDocument('perform_intern_discussions', rec.id, rec);
    await AuditService.log({
      action: 'INTERN_APPRAISAL_RECORDED',
      actor: currentEmployee,
      targetId: targetIntern.id,
      targetType: 'InternDiscussion',
      details: `Recorded ${reviewType} for ${targetIntern.name} (${readiness}).`,
    });
    showToast('success', 'Appraisal Discussion Logged', `${reviewType} saved.`);
    setStrengths('');
    setImprovements('');
    setSummary('');
    setDiscModalOpen(false);
  };

  return (
    <div className="space-y-5">
      {/* Header Banner */}
      <div className="p-4 bg-white border border-neutral-200 text-neutral-900 rounded-xl flex flex-wrap items-center justify-between gap-4 shadow-2xs">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-sky-700">
            Level 0 Graduate Intern Enablement Track
          </div>
          <h3 className="text-base font-bold mt-0.5 text-neutral-900">
            Bypasses 15-KPI Numerical Matrix • Tasks & OKRs, 4-Stage Department Roadmaps, Qualitative Appraisals
          </h3>
        </div>
        {interns.length > 0 && currentEmployee.level !== 0 && (
          <div>
            <label className="block text-[10px] uppercase text-neutral-500 mb-1">
              Select Intern Track
            </label>
            <select
              value={selectedInternId}
              onChange={(e) => setSelectedInternId(e.target.value)}
              className="px-3 py-1.5 text-xs font-bold bg-neutral-50 text-neutral-900 border border-neutral-300 rounded-lg"
            >
              {interns.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.ecode} — {i.name} ({i.department})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <Tabs
        tabs={[
          {
            id: 'tasks',
            label: 'Tasks & OKRs',
            icon: <CheckSquare className="w-3.5 h-3.5" />,
            badge: internTasks.length,
          },
          {
            id: 'roadmap',
            label: '4-Stage Department Training Roadmap',
            icon: <Compass className="w-3.5 h-3.5" />,
          },
          {
            id: 'discussions',
            label: 'Appraisal Discussions',
            icon: <MessageSquare className="w-3.5 h-3.5" />,
            badge: internDiscussions.length,
          },
        ]}
        activeTab={subTab}
        onChange={(id) => setSubTab(id as any)}
      />

      {subTab === 'tasks' && (
        <Card
          title={`Intern Tasks & OKR Deliverables — ${targetIntern.name}`}
          subtitle="Milestone check-ins, deliverables, and real-time progress bars."
          action={
            <Button
              size="sm"
              variant="primary"
              icon={<Plus className="w-4 h-4" />}
              onClick={() => setTaskModalOpen(true)}
            >
              Add Task / OKR
            </Button>
          }
        >
          {internTasks.length === 0 ? (
            <EmptyState
              title="No Intern Tasks or OKRs Assigned Yet"
              description="Create milestone deliverables and track progress bars from 0% to 100%."
              action={
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Plus className="w-4 h-4" />}
                  onClick={() => setTaskModalOpen(true)}
                >
                  Create First Intern OKR
                </Button>
              }
            />
          ) : (
            <Table
              headers={[
                'Task / OKR Title',
                'Deliverable Outcome',
                'Due Date',
                'Progress Bar',
                'Status',
              ]}
            >
              {internTasks.map((t) => (
                <tr key={t.id}>
                  <td className="px-4 py-3 text-xs font-bold text-neutral-900">
                    {t.title}
                  </td>
                  <td className="px-4 py-3 text-xs text-neutral-600">
                    {t.deliverable}
                  </td>
                  <td className="px-4 py-3 text-xs font-mono text-neutral-600">
                    {t.dueDate}
                  </td>
                  <td className="px-4 py-3 w-64">
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={5}
                        value={t.progress}
                        onChange={(e) =>
                          handleUpdateTaskProgress(t, Number(e.target.value))
                        }
                        className="flex-1 cursor-pointer"
                      />
                      <span className="text-xs font-mono font-bold w-10 text-right">
                        {t.progress}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant={
                        t.status === 'Completed'
                          ? 'success'
                          : t.status === 'In Progress'
                          ? 'info'
                          : 'neutral'
                      }
                    >
                      {t.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
      )}

      {subTab === 'roadmap' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-bold text-neutral-900">
                4-Stage Department Training Roadmaps (perform_intern_roadmaps)
              </h4>
              <p className="text-xs text-neutral-500">
                Pre-seeded structured tracks for Engineering, Marketing, Operations, and Business Development.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {roadmaps.map((rm) => (
              <Card
                key={rm.id}
                title={`${rm.department} Intern Track`}
                subtitle="4 Structured Enablement Stages"
                action={
                  <Badge variant="info">
                    {rm.stages.filter((s) => s.completed).length} / 4 Completed
                  </Badge>
                }
              >
                <div className="space-y-3">
                  {rm.stages.map((stage) => (
                    <div
                      key={stage.stageNumber}
                      className={`p-3.5 rounded-lg border ${
                        stage.completed
                          ? 'bg-emerald-50/50 border-emerald-200'
                          : 'bg-neutral-50 border-neutral-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 text-[10px] font-mono font-bold bg-neutral-900 text-white rounded-sm">
                            STAGE {stage.stageNumber}
                          </span>
                          <span className="text-xs font-bold text-neutral-900">
                            {stage.title}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={async () => {
                            const updatedStages = rm.stages.map((s) =>
                              s.stageNumber === stage.stageNumber
                                ? {
                                    ...s,
                                    completed: !s.completed,
                                    completedAt: !s.completed
                                      ? new Date().toISOString()
                                      : undefined,
                                    mentorSignOff: !s.completed
                                      ? currentEmployee.name
                                      : undefined,
                                  }
                                : s
                            );
                            await FirestoreEngine.setDocument(
                              'perform_intern_roadmaps',
                              rm.id,
                              { ...rm, stages: updatedStages }
                            );
                          }}
                          className={`px-2.5 py-1 text-[11px] font-bold rounded-md border cursor-pointer ${
                            stage.completed
                              ? 'bg-emerald-600 text-white border-emerald-600'
                              : 'bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-100'
                          }`}
                        >
                          {stage.completed ? 'Completed ✓' : 'Mark Complete'}
                        </button>
                      </div>
                      <p className="text-xs text-neutral-600 mt-1.5">
                        {stage.description}
                      </p>
                      <ul className="mt-2 space-y-1 text-[11px] text-neutral-700 list-disc list-inside">
                        {stage.deliverables.map((d, i) => (
                          <li key={i}>{d}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {subTab === 'discussions' && (
        <Card
          title="Structured Qualitative Appraisal Discussions"
          subtitle="1-Month and Mid-Term qualitative appraisal records with mentor feedback."
          action={
            isMentorOrAdmin && (
              <Button
                size="sm"
                variant="primary"
                icon={<Plus className="w-4 h-4" />}
                onClick={() => setDiscModalOpen(true)}
              >
                Record Appraisal Discussion
              </Button>
            )
          }
        >
          {internDiscussions.length === 0 ? (
            <EmptyState
              title="No Qualitative Appraisal Discussions Recorded"
              description="Mentors and Managers can record 1-Month, Mid-Term, and Final Capstone qualitative evaluations here."
            />
          ) : (
            <div className="space-y-3">
              {internDiscussions.map((d) => (
                <div
                  key={d.id}
                  className="p-4 bg-neutral-50 border border-neutral-200 rounded-xl space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="info">{d.reviewType}</Badge>
                      <span className="text-xs font-bold text-neutral-900">
                        Intern: {d.internName}
                      </span>
                      <span className="text-xs text-neutral-500">
                        • Mentor: {d.mentorName} ({d.date})
                      </span>
                    </div>
                    <Badge
                      variant={
                        d.readinessRating === 'Exceeding Track'
                          ? 'success'
                          : d.readinessRating === 'On Track'
                          ? 'info'
                          : 'warning'
                      }
                    >
                      {d.readinessRating}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs pt-1">
                    <div className="p-2.5 bg-white border border-neutral-200 rounded-lg">
                      <div className="font-bold text-emerald-800">
                        Demonstrated Strengths
                      </div>
                      <p className="text-neutral-700 mt-1">{d.strengths}</p>
                    </div>
                    <div className="p-2.5 bg-white border border-neutral-200 rounded-lg">
                      <div className="font-bold text-amber-800">
                        Areas for Improvement
                      </div>
                      <p className="text-neutral-700 mt-1">
                        {d.areasOfImprovement || 'None noted'}
                      </p>
                    </div>
                    <div className="p-2.5 bg-white border border-neutral-200 rounded-lg">
                      <div className="font-bold text-neutral-900">
                        Mentor Qualitative Summary
                      </div>
                      <p className="text-neutral-700 mt-1">
                        {d.qualitativeSummary}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Modal: Add Task/OKR */}
      <Modal
        isOpen={taskModalOpen}
        onClose={() => setTaskModalOpen(false)}
        size="md"
        title="Assign Intern Task / OKR Deliverable"
      >
        <form onSubmit={handleCreateTask} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">
              Milestone / OKR Title *
            </label>
            <input
              type="text"
              required
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="e.g. Complete Unit Tests for Auth Service"
              className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">
              Verifiable Deliverable *
            </label>
            <input
              type="text"
              required
              value={taskDeliverable}
              onChange={(e) => setTaskDeliverable(e.target.value)}
              placeholder="e.g. Merged PR with >85% test coverage"
              className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">
              Target Completion Date
            </label>
            <input
              type="date"
              required
              value={taskDueDate}
              onChange={(e) => setTaskDueDate(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setTaskModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Create Deliverable
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Record Qualitative Appraisal Discussion */}
      <Modal
        isOpen={discModalOpen}
        onClose={() => setDiscModalOpen(false)}
        size="lg"
        title="Record Intern Qualitative Appraisal Discussion"
      >
        <form onSubmit={handleCreateDiscussion} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                Review Milestone
              </label>
              <select
                value={reviewType}
                onChange={(e) => setReviewType(e.target.value as any)}
                className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg bg-white"
              >
                <option value="1-Month Review">1-Month Review</option>
                <option value="Mid-Term Appraisal">Mid-Term Appraisal</option>
                <option value="Final Capstone Evaluation">
                  Final Capstone Evaluation
                </option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-neutral-700 mb-1">
                Track Readiness Rating
              </label>
              <select
                value={readiness}
                onChange={(e) => setReadiness(e.target.value as any)}
                className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg bg-white"
              >
                <option value="Exceeding Track">Exceeding Track</option>
                <option value="On Track">On Track</option>
                <option value="Needs Support">Needs Support</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">
              Key Strengths Demonstrated *
            </label>
            <textarea
              rows={2}
              required
              value={strengths}
              onChange={(e) => setStrengths(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">
              Areas of Improvement & Coaching Plan
            </label>
            <textarea
              rows={2}
              value={improvements}
              onChange={(e) => setImprovements(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-700 mb-1">
              Qualitative Mentor Summary *
            </label>
            <textarea
              rows={2}
              required
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-lg"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDiscModalOpen(false)}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Save Appraisal Record
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
