import { useState, useMemo, useEffect } from 'react';
import { useAuth } from './hooks/useAuth';
import { useProjects } from './hooks/useProjects';
import { useTasks } from './hooks/useTasks';
import { useJobs } from './hooks/useJobs';
import { useMilestones } from './hooks/useMilestones';
import { useMembers } from './hooks/useMembers';
import { useNotifications } from './hooks/useNotifications';
import { signUp, signIn, signOut, addComment as apiAddComment, runTaskApi, replyToJob, approveJob, rejectJob, revertJob, terminateJob, deleteJob, gitCommit, gitPush, gitPr, updateTask } from './lib/api';
import { computeFocus } from './lib/focus';
import { OnboardingCheck } from './components/OnboardingCheck';
import { AuthGate } from './components/AuthGate';
import { NewProject } from './components/NewProject';
import { Header } from './components/Header';
import { FocusView } from './components/FocusView';
import { JobsPanel } from './components/JobsPanel';
import type { JobView } from './components/JobsPanel';
import { Backlog } from './components/Backlog';
import { TaskForm, type EditTaskData } from './components/TaskForm';
import { AddProjectModal } from './components/AddProjectModal';
import { MembersModal } from './components/MembersModal';
import './styles/global.css';

import { elapsed, timeAgo } from './lib/time';

/** Full phase pipeline per task type (mirrors server DEFAULT_TASK_TYPES + final). */
const TASK_TYPE_PHASES: Record<string, string[]> = {
  'bug-fix': ['plan', 'analyze', 'fix', 'verify', 'review'],
  'feature': ['plan', 'implement', 'verify', 'review'],
  'refactor': ['plan', 'analyze', 'refactor', 'verify', 'review'],
  'test': ['plan', 'write-tests', 'verify', 'review'],
  'ui-fix': ['plan', 'implement', 'verify', 'review'],
  'design': ['plan', 'implement', 'verify', 'review'],
  'chore': ['plan', 'implement', 'verify', 'review'],
};

/** Build phases array for the UI from API data.
 *  Shows the full pipeline for the task type, marking each phase as
 *  completed, current, or pending. */
function buildPhases(phasesCompleted: any[], currentPhase: string | null, taskType: string): { name: string; status: string }[] {
  const completed = new Set(
    (phasesCompleted || []).map((p: any) => typeof p === 'string' ? p : p.name || p.phase)
  );
  const allPhases = TASK_TYPE_PHASES[taskType] || TASK_TYPE_PHASES['feature'];

  return allPhases.map(name => {
    if (completed.has(name)) return { name, status: 'completed' };
    if (name === currentPhase) return { name, status: 'current' };
    return { name, status: 'pending' };
  });
}

export default function App() {
  const [envReady, setEnvReady] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [editingTask, setEditingTask] = useState<EditTaskData | null>(null);
  const [showAddProject, setShowAddProject] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [milestoneFilter, setMilestoneFilter] = useState<string | null>(null);
  const auth = useAuth();
  const projects = useProjects(auth.profile?.id);
  const tasks = useTasks(projects.current?.id || null);
  const jobs = useJobs(projects.current?.id || null);
  const milestones = useMilestones(projects.current?.id || null);
  const members = useMembers(projects.current?.id || null);
  const notifs = useNotifications(auth.profile?.id);

  // Build a task-title lookup from all tasks
  const taskTitleMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const t of tasks.tasks) {
      map[t.id] = t.title;
    }
    return map;
  }, [tasks.tasks]);

  // Build a task-type lookup from all tasks (id -> type)
  const taskTypeMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const t of tasks.tasks) {
      map[t.id] = t.type;
    }
    return map;
  }, [tasks.tasks]);

  // Tick counter for elapsed time updates on running jobs
  const [, setTick] = useState(0);
  useEffect(() => {
    const hasRunning = jobs.jobs.some(j => j.status === 'running');
    if (!hasRunning) return;
    const interval = setInterval(() => setTick(t => t + 1), 10000);
    return () => clearInterval(interval);
  }, [jobs.jobs]);

  // Build a member lookup from project members
  const memberMap = useMemo(() => {
    const map: Record<string, { name: string; initials: string }> = {};
    for (const m of members.members) {
      map[m.id] = { name: m.name, initials: m.initials };
    }
    return map;
  }, [members.members]);

  // Focus algorithm: score tasks by blockers, deadlines, position
  const focusResult = useMemo(() => {
    const blockers = tasks.tasks.flatMap(t =>
      (t.blocked_by || []).map(dep => ({ task_id: t.id, blocked_by: dep }))
    );
    return computeFocus(
      tasks.tasks.map(t => ({
        id: t.id,
        title: t.title,
        type: t.type,
        mode: t.mode,
        effort: t.effort,
        status: t.status,
        position: t.position,
        milestone_id: t.milestone_id,
      })),
      milestones.milestones.map(m => ({
        id: m.id,
        name: m.name,
        deadline: m.deadline,
      })),
      blockers,
    );
  }, [tasks.tasks, milestones.milestones]);

  // Map API jobs to the shape JobsPanel expects
  const jobViews: JobView[] = useMemo(() => {
    // Order: running first, then paused, review, done, failed
    const order: Record<string, number> = { running: 0, paused: 1, review: 2, done: 3, failed: 4 };
    const sorted = [...jobs.jobs].sort((a, b) => (order[a.status] ?? 5) - (order[b.status] ?? 5));

    return sorted.map(j => ({
      id: j.id,
      taskId: j.task_id,
      title: taskTitleMap[j.task_id] || 'Task',
      type: 'task',
      status: j.status as JobView['status'],
      currentPhase: j.current_phase || undefined,
      attempt: j.attempt,
      maxAttempts: j.max_attempts,
      elapsed: j.status === 'running' ? elapsed(j.started_at) : undefined,
      phases: buildPhases(j.phases_completed || [], j.current_phase, taskTypeMap[j.task_id] || 'feature'),
      question: j.question || undefined,
      review: j.review_result ? {
        filesChanged: j.review_result.files_changed ?? j.review_result.filesChanged ?? 0,
        testsPassed: j.review_result.tests_passed ?? j.review_result.testsPassed ?? true,
        linesAdded: j.review_result.lines_added ?? j.review_result.linesAdded ?? 0,
        linesRemoved: j.review_result.lines_removed ?? j.review_result.linesRemoved ?? 0,
        summary: j.review_result.summary ?? '',
        changedFiles: j.review_result.changed_files ?? j.review_result.changedFiles ?? undefined,
      } : undefined,
      completedAgo: j.completed_at ? timeAgo(j.completed_at) : undefined,
    }));
  }, [jobs.jobs, taskTitleMap, taskTypeMap]);

  // Step 1: Environment check
  if (!envReady) {
    return <OnboardingCheck onReady={() => setEnvReady(true)} />;
  }

  // Step 2: Loading auth
  if (auth.loading) {
    return <Loading text="Loading..." />;
  }

  // Step 3: Not logged in
  if (!auth.loggedIn || !auth.profile) {
    return (
      <AuthGate onAuth={async (action, email, password, name) => {
        if (action === 'signUp') await signUp(email, password, name!);
        else await signIn(email, password);
        auth.onAuthSuccess();
      }} />
    );
  }

  // Step 4: Loading projects
  if (projects.loading) {
    return <Loading text="Loading projects..." />;
  }

  // Step 5: No projects yet
  if (projects.projects.length === 0) {
    return <NewProject onCreate={async (name, supabaseConfig, localPath) => { await projects.createProject(name, supabaseConfig, localPath); }} />;
  }

  // Step 6: Focus task
  const focusTask = focusResult?.task
    ? tasks.backlog.find(t => t.id === focusResult.task.id) || tasks.backlog[0]
    : tasks.backlog[0];
  const focusReason = focusResult?.reason || `Top of your backlog. ${tasks.backlog.length} tasks remaining.`;
  const nextTasks = tasks.backlog.filter(t => t.id !== focusTask?.id).slice(0, 2);

  // Milestone progress
  const activeMilestone = milestones.active[0];
  const milestoneTasks = activeMilestone
    ? tasks.tasks.filter(t => t.milestone_id === activeMilestone.id)
    : tasks.tasks;
  const msProgress = {
    name: activeMilestone?.name || 'All',
    tasksDone: milestoneTasks.filter(t => t.status === 'done').length,
    tasksTotal: milestoneTasks.length,
  };

  return (
    <>
      <Header
        projectName={projects.current?.name || ''}
        milestone={msProgress}
        notifications={notifs.unreadCount}
        notificationList={notifs.notifications}
        onMarkRead={notifs.markRead}
        onMarkAllRead={notifs.markAllRead}
        userInitials={auth.profile.initials}
        projects={projects.projects.map(p => ({ id: p.id, name: p.name }))}
        currentProjectId={projects.current?.id || null}
        onSwitchProject={projects.switchProject}
        onNewProject={() => setShowAddProject(true)}
        onSignOut={async () => { await signOut(); window.location.reload(); }}
        onManageMembers={() => setShowMembersModal(true)}
      />
      <main style={{
        display: 'grid',
        gridTemplateColumns: '1fr 480px',
        minHeight: 'calc(100vh - 56px)',
      }}>
        <div style={{
          padding: '56px 64px 100px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}>
          <div style={{ width: '100%', maxWidth: 600 }}>
            {focusTask ? (
              <FocusView
                task={{
                  id: focusTask.id,
                  title: focusTask.title,
                  type: focusTask.type,
                  mode: focusTask.mode,
                  effort: focusTask.effort,
                  blocksCount: 0,
                }}
                reason={focusReason}
                next={nextTasks[0]?.title || ''}
                then={nextTasks[1]?.title || ''}
                onRun={async (taskId) => {
                  if (!projects.current?.id || !projects.current?.local_path) {
                    alert('Set a local folder path for this project first.');
                    return;
                  }
                  try {
                    await runTaskApi(taskId, projects.current.id, projects.current.local_path);
                    jobs.reload();
                    tasks.reload();
                  } catch (err: any) {
                    alert(err.message || 'Failed to start task');
                  }
                }}
                onSkip={async (taskId, reason) => {
                  await tasks.updateTask(taskId, { position: tasks.backlog.length + 1 });
                  if (reason) {
                    await apiAddComment(taskId, `Skipped: ${reason}`);
                  }
                }}
              />
            ) : (
              <EmptyState onAdd={() => setShowTaskForm(true)} />
            )}
            {tasks.loading ? (
              <p style={{ fontSize: 14, color: 'var(--text-4)', marginTop: 24 }}>Loading tasks...</p>
            ) : (
              <Backlog
                tasks={tasks.backlog.map(t => {
                  const blockedByTitles = (t.blocked_by || [])
                    .map(id => taskTitleMap[id])
                    .filter((title): title is string => !!title);
                  const member = t.assignee ? memberMap[t.assignee] : null;
                  return {
                    id: t.id,
                    title: t.title,
                    description: t.description || '',
                    type: t.type,
                    mode: t.mode,
                    effort: t.effort,
                    multiagent: t.multiagent,
                    blocked: blockedByTitles.length > 0,
                    blockedByTitles,
                    blockedByIds: t.blocked_by || [],
                    assignee: member
                      ? { type: 'user', name: member.name, initials: member.initials }
                      : { type: 'ai' },
                    assigneeId: t.assignee,
                    images: t.images || [],
                    status: t.status,
                    milestone_id: t.milestone_id,
                  };
                })}
                onAddTask={() => setShowTaskForm(true)}
                onEditTask={(task) => {
                  setEditingTask({
                    id: task.id,
                    title: task.title,
                    description: task.description,
                    type: task.type,
                    mode: task.mode,
                    effort: task.effort,
                    multiagent: task.multiagent,
                    assignee: task.assigneeId,
                    blocked_by: task.blockedByIds,
                    images: task.images,
                    milestone_id: task.milestone_id,
                  });
                }}
                onUpdateTask={async (taskId, data) => {
                  await tasks.updateTask(taskId, data);
                }}
                onSwapTasks={async (idA, idB) => {
                  const taskA = tasks.backlog.find(t => t.id === idA);
                  const taskB = tasks.backlog.find(t => t.id === idB);
                  if (!taskA || !taskB) return;
                  await Promise.all([
                    updateTask(idA, { position: taskB.position }),
                    updateTask(idB, { position: taskA.position }),
                  ]);
                  tasks.reload();
                }}
                onDeleteTask={async (taskId) => {
                  await tasks.deleteTask(taskId);
                }}
                milestoneFilter={milestoneFilter}
                milestones={milestones.active.map(m => ({ id: m.id, name: m.name }))}
                onMilestoneFilter={setMilestoneFilter}
              />
            )}
          </div>
        </div>
        <div style={{
          padding: '56px 40px 100px',
          borderLeft: '1px solid var(--divider)',
        }}>
          <JobsPanel
            jobs={jobViews}
            onTerminate={async (jobId) => {
              if (confirm('Terminate this running job?')) {
                await terminateJob(jobId);
                jobs.reload();
                tasks.reload();
              }
            }}
            onReply={async (jobId, answer) => {
              try {
                await replyToJob(jobId, answer, projects.current?.local_path || '');
                jobs.reload();
                tasks.reload();
              } catch (err: any) {
                alert(err.message || 'Failed to send reply');
              }
            }}
            onApprove={async (jobId, action) => {
              try {
                await approveJob(jobId);
                const localPath = projects.current?.local_path || '';
                if (action === 'commit') {
                  await gitCommit(jobId, localPath);
                } else if (action === 'commit_push') {
                  await gitCommit(jobId, localPath);
                  await gitPush(localPath);
                } else if (action === 'branch_pr') {
                  await gitPr(jobId, localPath);
                }
                jobs.reload();
                tasks.reload();
              } catch (err: any) {
                alert(err.message || 'Failed to approve');
              }
            }}
            onReject={async (jobId) => {
              try {
                await rejectJob(jobId, '');
                jobs.reload();
                tasks.reload();
              } catch (err: any) {
                alert(err.message || 'Failed to reject');
              }
            }}
            onRevert={async (jobId) => {
              if (confirm('Revert all file changes? This restores files to their state before the task ran.')) {
                try {
                  await revertJob(jobId, projects.current?.local_path || '');
                  jobs.reload();
                  tasks.reload();
                } catch (err: any) {
                  alert(err.message || 'Failed to revert');
                }
              }
            }}
            onDeleteJob={async (jobId) => {
              try {
                await deleteJob(jobId);
                jobs.reload();
              } catch (err: any) {
                alert(err.message || 'Failed to dismiss job');
              }
            }}
          />
        </div>
      </main>

      {showTaskForm && projects.current && (
        <TaskForm
          localPath={projects.current?.local_path}
          milestones={milestones.active.map(m => ({ id: m.id, name: m.name }))}
          members={members.members.map(m => ({ id: m.id, name: m.name, initials: m.initials }))}
          existingTasks={tasks.tasks
            .filter(t => t.status !== 'done' && t.status !== 'canceled')
            .map(t => ({ id: t.id, title: t.title }))
          }
          onSubmit={async (data) => {
            await tasks.createTask({
              project_id: projects.current!.id,
              title: data.title,
              description: data.description,
              type: data.type,
              mode: data.mode as any,
              effort: data.effort as any,
              multiagent: data.multiagent,
              assignee: data.assignee,
              blocked_by: data.blocked_by,
              images: data.images,
              milestone_id: data.milestone_id,
            });
          }}
          onClose={() => setShowTaskForm(false)}
        />
      )}

      {editingTask && projects.current && (
        <TaskForm
          localPath={projects.current?.local_path}
          milestones={milestones.active.map(m => ({ id: m.id, name: m.name }))}
          members={members.members.map(m => ({ id: m.id, name: m.name, initials: m.initials }))}
          existingTasks={tasks.tasks
            .filter(t => t.status !== 'done' && t.status !== 'canceled' && t.id !== editingTask.id)
            .map(t => ({ id: t.id, title: t.title }))
          }
          editTask={editingTask}
          onSubmit={async (data) => {
            await tasks.updateTask(editingTask.id, {
              title: data.title,
              description: data.description,
              type: data.type,
              mode: data.mode,
              effort: data.effort,
              multiagent: data.multiagent,
              assignee: data.assignee,
              blocked_by: data.blocked_by,
              images: data.images,
              milestone_id: data.milestone_id,
            });
          }}
          onClose={() => setEditingTask(null)}
        />
      )}

      {showAddProject && (
        <AddProjectModal
          onClose={() => setShowAddProject(false)}
          onCreate={async (name, localPath) => {
            await projects.createProject(name, undefined, localPath);
          }}
        />
      )}

      {showMembersModal && projects.current && (
        <MembersModal
          projectId={projects.current.id}
          currentUserId={auth.profile.id}
          onClose={() => setShowMembersModal(false)}
        />
      )}
    </>
  );
}

function Loading({ text }: { text: string }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 15 }}>
      {text}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div style={{ marginBottom: 72 }}>
      <p style={{ fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--blue)', marginBottom: 20 }}>Now</p>
      <h1 style={{ fontSize: 36, fontWeight: 700, letterSpacing: '-0.03em', marginBottom: 16 }}>Nothing to do</h1>
      <p style={{ fontSize: 15, color: 'var(--text-2)', marginBottom: 32 }}>Add a task to get started.</p>
      <button
        onClick={onAdd}
        style={{ padding: '10px 28px', background: 'var(--text)', color: 'var(--bg)', border: 'none', borderRadius: 8, fontFamily: 'var(--font)', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}
      >
        New Task
      </button>
    </div>
  );
}
