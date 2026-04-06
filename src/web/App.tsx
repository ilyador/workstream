import { useState, useMemo, useEffect, useRef } from 'react';
import { useAuth } from './hooks/useAuth';
import { useProjects } from './hooks/useProjects';
import { useTasks } from './hooks/useTasks';
import { useJobs } from './hooks/useJobs';
import { useWorkstreams } from './hooks/useWorkstreams';
import { useMembers } from './hooks/useMembers';
import { useNotifications } from './hooks/useNotifications';
import { useCommentCounts } from './hooks/useCommentCounts';
import { useWebNotifications } from './hooks/useWebNotifications';
import { useFlows } from './hooks/useFlows';
import { useCustomTypes } from './hooks/useCustomTypes';
import { signUp, signIn, signOut, runTaskApi, replyToJob, approveJob, rejectJob, reworkJob, revertJob, terminateJob, deleteJob, moveToBacklog, continueJob, updateTask, updateWorkstream as apiUpdateWorkstream, updateFlow as apiUpdateFlow, updateFlowSteps as apiUpdateFlowSteps, reviewAndCreatePr, createWorkstreamPr } from './lib/api';
import { Routes, Route, useSearchParams } from 'react-router-dom';
import { OnboardingCheck } from './components/OnboardingCheck';
import { AuthGate } from './components/AuthGate';
import { NewProject } from './components/NewProject';
import { Header } from './components/Header';
import { Board } from './components/Board';
import { ArchivePage } from './components/ArchivePage';
import type { JobView } from './components/job-types';
import { TaskForm, type EditTaskData } from './components/TaskForm';
import { AddProjectModal } from './components/AddProjectModal';
import { MembersModal } from './components/MembersModal';
import { FlowEditor2 } from './components/FlowEditor2';
import { useModal } from './hooks/useModal';
import './styles/global.css';

import { timeAgo } from './lib/time';

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

/** Strip tool-call log lines from review summary for display. */
function cleanSummary(raw: string): string {
  return raw
    .split('\n')
    .filter(line => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      if (/^\[/.test(trimmed)) return false;
      return true;
    })
    .join('\n')
    .trim();
}

function buildPhases(phasesCompleted: any[], currentPhase: string | null, taskType: string, flowSnapshot?: any): { name: string; status: string; summary?: string }[] {
  const completedMap = new Map<string, string>();
  for (const p of (phasesCompleted || [])) {
    const name = typeof p === 'string' ? p : p.name || p.phase;
    const summary = typeof p === 'string' ? '' : p.summary || '';
    completedMap.set(name, summary);
  }
  // Use flow_snapshot steps if available, otherwise fall back to legacy type mapping
  const allPhases = flowSnapshot?.steps
    ? flowSnapshot.steps.map((s: any) => s.name)
    : (TASK_TYPE_PHASES[taskType] || TASK_TYPE_PHASES['feature']);

  return allPhases.map((name: string) => {
    if (completedMap.has(name)) return { name, status: 'completed', summary: completedMap.get(name) || undefined };
    if (name === currentPhase) return { name, status: 'current' };
    return { name, status: 'pending' };
  });
}

export default function App() {
  const [envReady, setEnvReady] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskFormWorkstream, setTaskFormWorkstream] = useState<string | null>(null);
  const [editingTask, setEditingTask] = useState<EditTaskData | null>(null);
  const [showAddProject, setShowAddProject] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const auth = useAuth();
  const projects = useProjects(auth.profile?.id);
  const tasks = useTasks(projects.current?.id || null);
  const jobs = useJobs(projects.current?.id || null);
  const workstreams = useWorkstreams(projects.current?.id || null);
  const members = useMembers(projects.current?.id || null);
  const aiFlows = useFlows(projects.current?.id || null);
  const customTypes = useCustomTypes(projects.current?.id || null);
  const notifs = useNotifications(auth.profile?.id);
  const commentCounts = useCommentCounts(projects.current?.id || null);
  const webNotifs = useWebNotifications();
  const modal = useModal();
  const [searchParams, setSearchParams] = useSearchParams();
  const focusTaskId = searchParams.get('task');
  const focusWsId = searchParams.get('ws');

  // Compute which tasks have unread @mentions
  const mentionedTaskIds = useMemo(() => {
    const ids = new Set<string>();
    for (const n of notifs.notifications) {
      if (!n.read && n.type === 'mention' && n.task_id) ids.add(n.task_id);
    }
    return ids;
  }, [notifs.notifications]);

  // Clear ?task= and ?ws= params after a short delay so they don't stick
  useEffect(() => {
    if (focusTaskId || focusWsId) {
      const timer = setTimeout(() => setSearchParams({}, { replace: true }), 1000);
      return () => clearTimeout(timer);
    }
  }, [focusTaskId, focusWsId, setSearchParams]);

  // Build a task-title lookup from all tasks
  const taskTitleMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const t of tasks.tasks) map[t.id] = t.title;
    return map;
  }, [tasks.tasks]);

  // Build a task-type lookup from all tasks (id -> type)
  const taskTypeMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const t of tasks.tasks) map[t.id] = t.type;
    return map;
  }, [tasks.tasks]);

  // Track previous job/task statuses for web push notifications
  const prevJobStatuses = useRef<Record<string, string>>({});
  const prevTaskStatuses = useRef<Record<string, string>>({});

  useEffect(() => {
    const prev = prevJobStatuses.current;
    for (const job of jobs.jobs) {
      const oldStatus = prev[job.id];
      if (oldStatus !== job.status) {
        const title = taskTitleMap[job.task_id] || 'Task';
        // Failed notifications fire even on first sight (no oldStatus guard)
        if (job.status === 'failed') {
          webNotifs.notify('Task failed', `${title}: ${job.question || 'unknown error'}`);
        } else if (oldStatus) {
          // Other notifications only fire on status transitions (not initial load)
          if (job.status === 'paused') {
            webNotifs.notify('Question asked', `${title} needs your input`);
          } else if (job.status === 'done') {
            webNotifs.notify('Task completed', `${title} finished successfully`);
          }
        }
      }
      prev[job.id] = job.status;
    }
  }, [jobs.jobs, taskTitleMap, webNotifs.notify]);

  useEffect(() => {
    const prev = prevTaskStatuses.current;
    for (const task of tasks.tasks) {
      const oldStatus = prev[task.id];
      if (oldStatus && oldStatus !== task.status && task.status === 'review') {
        webNotifs.notify('Ready for review', `${task.title} is ready for review`);
      }
      prev[task.id] = task.status;
    }
  }, [tasks.tasks, webNotifs.notify]);

  // Tick removed — elapsed is now computed locally inside TaskCard

  useEffect(() => {
    document.title = projects.current?.name
      ? `${projects.current.name} - WorkStream`
      : 'WorkStream';
  }, [projects.current?.name]);

  // Build a member lookup from project members
  const memberMap = useMemo(() => {
    const map: Record<string, { name: string; initials: string }> = {};
    for (const m of members.members) map[m.id] = { name: m.name, initials: m.initials };
    return map;
  }, [members.members]);

  // Build flow name lookup (id -> name)
  const flowMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const f of aiFlows.flows) map[f.id] = f.name;
    return map;
  }, [aiFlows.flows]);

  // Build task-type -> flow id lookup (for AI assignee display when flow_id not set)
  const typeFlowMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const f of aiFlows.flows) {
      for (const t of f.default_types || []) {
        if (!map[t]) map[t] = f.id;
      }
    }
    return map;
  }, [aiFlows.flows]);

  // Map API jobs to JobView shape
  const jobViews: JobView[] = useMemo(() => {
    const order: Record<string, number> = { running: 0, queued: 1, paused: 2, review: 3, done: 4, failed: 5 };
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
      startedAt: j.started_at || undefined,
      phases: buildPhases(j.phases_completed || [], j.current_phase, taskTypeMap[j.task_id] || 'feature', j.flow_snapshot),
      question: j.question || undefined,
      review: j.review_result ? {
        filesChanged: j.review_result.files_changed ?? j.review_result.filesChanged ?? 0,
        testsPassed: j.review_result.tests_passed ?? j.review_result.testsPassed ?? true,
        linesAdded: j.review_result.lines_added ?? j.review_result.linesAdded ?? 0,
        linesRemoved: j.review_result.lines_removed ?? j.review_result.linesRemoved ?? 0,
        summary: cleanSummary(j.review_result.summary ?? ''),
        changedFiles: j.review_result.changed_files ?? j.review_result.changedFiles ?? undefined,
      } : undefined,
      completedAgo: j.completed_at ? timeAgo(j.completed_at) : undefined,
    }));
  }, [jobs.jobs, taskTitleMap, taskTypeMap]);

  // Workstream name lookup for sublabels
  const wsNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const w of workstreams.workstreams) map[w.id] = w.name;
    return map;
  }, [workstreams.workstreams]);

  // Action items for header
  const todoItems = useMemo(() => {
    const uid = auth.profile?.id;
    if (!uid) return [];
    return tasks.tasks
      .filter(t => t.assignee === uid && t.status !== 'done' && t.workstream_id)
      .map(t => ({
        id: t.id,
        label: t.title,
        sublabel: t.workstream_id ? wsNameMap[t.workstream_id] : undefined,
        tag: t.type,
        taskId: t.id,
      }));
  }, [tasks.tasks, wsNameMap, auth.profile?.id]);

  const reviewItems = useMemo(() => {
    const uid = auth.profile?.id;
    const items: Array<{ id: string; label: string; sublabel?: string; tag?: string; taskId?: string; workstreamId?: string }> = [];
    // Workstreams assigned to current user for review (not yet merged/archived)
    if (uid) {
      for (const ws of workstreams.workstreams) {
        if (ws.reviewer_id === uid && ws.status !== 'merged' && ws.status !== 'archived') {
          items.push({
            id: `ws-${ws.id}`,
            label: ws.name,
            sublabel: 'Workstream review',
            workstreamId: ws.id,
          });
        }
      }
    }
    // Jobs awaiting review
    for (const job of jobViews) {
      if (job.status === 'review') {
        const task = tasks.tasks.find(t => t.id === job.taskId);
        items.push({
          id: job.id,
          label: job.title,
          sublabel: task?.workstream_id ? wsNameMap[task.workstream_id] : undefined,
          tag: task?.type,
          taskId: job.taskId,
        });
      }
    }
    // Jobs with questions
    for (const job of jobViews) {
      if (job.status === 'paused' && job.question) {
        const task = tasks.tasks.find(t => t.id === job.taskId);
        items.push({
          id: job.id,
          label: job.title,
          sublabel: 'Question asked',
          tag: task?.type,
          taskId: job.taskId,
        });
      }
    }
    return items;
  }, [jobViews, tasks.tasks, wsNameMap, workstreams.workstreams, auth.profile?.id]);

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

  // Workstream progress for header
  const activeWs = workstreams.active[0];
  const wsTasks = activeWs
    ? tasks.tasks.filter(t => t.workstream_id === activeWs.id)
    : tasks.tasks;
  const wsProgress = {
    name: activeWs?.name || 'All',
    tasksDone: wsTasks.filter(t => t.status === 'done').length,
    tasksTotal: wsTasks.length,
  };

  return (
    <>
      {webNotifs.showPrompt && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
          padding: '8px 20px', background: 'var(--blue-bg)', borderBottom: '1px solid var(--divider)',
          fontSize: 13, color: 'var(--text-2)',
        }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
            <path d="M8 1.5C5.5 1.5 4 3.5 4 5.5V8L2.5 10.5V11.5H13.5V10.5L12 8V5.5C12 3.5 10.5 1.5 8 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
            <path d="M6.5 12.5C6.5 13.3 7.2 14 8 14C8.8 14 9.5 13.3 9.5 12.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          <span>Enable notifications to stay updated on task progress</span>
          <button
            className="btn btnPrimary btnSm"
            style={{ padding: '3px 12px', fontSize: 12 }}
            onClick={webNotifs.requestPermission}
          >Enable</button>
          <button
            className="btn btnGhost btnSm"
            style={{ padding: '3px 8px', fontSize: 12 }}
            onClick={webNotifs.dismiss}
          >Dismiss</button>
        </div>
      )}

      <Header
        projectName={projects.current?.name || ''}
        localPath={projects.current?.local_path}
        milestone={wsProgress}
        notifications={notifs.unreadCount}
        notificationList={notifs.notifications}
        onMarkRead={notifs.markRead}
        onMarkAllRead={notifs.markAllRead}
        todoItems={todoItems}
        reviewItems={reviewItems}
        userInitials={auth.profile.initials}
        projects={projects.projects.map(p => ({ id: p.id, name: p.name }))}
        currentProjectId={projects.current?.id || null}
        onSwitchProject={projects.switchProject}
        onNewProject={() => setShowAddProject(true)}
        onSignOut={async () => { await signOut(); window.location.reload(); }}
        onManageMembers={() => setShowMembersModal(true)}
        onUpdateLocalPath={projects.current?.id ? (path) => projects.updateLocalPath(projects.current!.id, path) : undefined}
      />

      <Routes>
        <Route path="/" element={
          <Board
            workstreams={workstreams.active}
            tasks={tasks.tasks}
            jobs={jobViews}
            memberMap={memberMap}
            flowMap={flowMap}
            typeFlowMap={typeFlowMap}
            userRole={projects.current?.role || 'dev'}
            projectId={projects.current?.id || null}
            mentionedTaskIds={mentionedTaskIds}
            commentCounts={commentCounts.counts}
            focusTaskId={focusTaskId}
            focusWsId={focusWsId}
            currentUserId={auth.profile?.id}
            onCreateWorkstream={async (name, description, has_code) => {
              await workstreams.createWorkstream(name, description, has_code);
            }}
            onUpdateWorkstream={async (id, data) => {
              await workstreams.updateWorkstream(id, data);
            }}
            onDeleteWorkstream={async (id) => {
              await workstreams.deleteWorkstream(id);
              tasks.reload();
            }}
            onSwapColumns={(draggedId, targetId) => {
              const dragged = workstreams.workstreams.find(w => w.id === draggedId);
              const target = workstreams.workstreams.find(w => w.id === targetId);
              if (!dragged || !target) return;
              workstreams.setWorkstreams(prev => prev.map(w => {
                if (w.id === draggedId) return { ...w, position: target.position };
                if (w.id === targetId) return { ...w, position: dragged.position };
                return w;
              }));
              apiUpdateWorkstream(draggedId, { position: target.position });
              apiUpdateWorkstream(targetId, { position: dragged.position });
            }}
            onAddTask={(workstreamId) => {
              setTaskFormWorkstream(workstreamId);
              setShowTaskForm(true);
            }}
            onRunWorkstream={async (workstreamId) => {
              if (!projects.current?.id || !projects.current?.local_path) {
                await modal.alert('Missing path', 'Set a local folder path for this project first.');
                return;
              }
              const wsTasks = tasks.tasks
                .filter(t => t.workstream_id === workstreamId && ['backlog', 'todo'].includes(t.status) && t.mode === 'ai')
                .sort((a, b) => a.position - b.position);
              if (wsTasks.length === 0) {
                await modal.alert('No tasks', 'No runnable AI tasks in this workstream.');
                return;
              }
              try {
                await runTaskApi(wsTasks[0].id, projects.current.id, projects.current.local_path, true);
                jobs.reload();
                tasks.reload();
              } catch (err: any) {
                await modal.alert('Error', err.message || 'Failed to start workstream');
              }
            }}
            onRunTask={async (taskId) => {
              if (!projects.current?.id || !projects.current?.local_path) {
                await modal.alert('Missing path', 'Set a local folder path for this project first.');
                return;
              }
              try {
                await runTaskApi(taskId, projects.current.id, projects.current.local_path, false);
                jobs.reload();
                tasks.reload();
              } catch (err: any) {
                await modal.alert('Error', err.message || 'Failed to start task');
              }
            }}
            onEditTask={(task) => {
              const rawTask = tasks.tasks.find(t => t.id === task.id);
              setEditingTask({
                id: task.id,
                title: task.title,
                description: task.description,
                type: task.type,
                mode: task.mode,
                effort: task.effort,
                multiagent: task.multiagent,
                assignee: rawTask?.assignee ?? null,
                flow_id: rawTask?.flow_id ?? null,
                images: task.images,
                workstream_id: task.workstream_id,
                auto_continue: task.auto_continue,
                priority: task.priority,
                chaining: rawTask?.chaining,
              });
            }}
            onDeleteTask={async (taskId) => {
              await tasks.deleteTask(taskId);
            }}
            onUpdateTask={async (taskId, data) => {
              await tasks.updateTask(taskId, data);
            }}
            onMoveTask={(taskId, workstreamId, newPosition) => {
              tasks.setTasks(prev => prev.map(t =>
                t.id === taskId ? { ...t, workstream_id: workstreamId, position: newPosition } : t
              ));
              updateTask(taskId, { workstream_id: workstreamId, position: newPosition });
            }}
            onTerminate={async (jobId) => {
              if (await modal.confirm('Terminate job', 'Terminate this running job?', { label: 'Terminate', danger: true })) {
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
                await modal.alert('Error', err.message || 'Failed to send reply');
              }
            }}
            onApprove={async (jobId) => {
              try {
                await approveJob(jobId);
                jobs.reload();
                tasks.reload();
              } catch (err: any) {
                await modal.alert('Error', err.message || 'Failed to approve');
              }
            }}
            onReject={async (jobId) => {
              try {
                await rejectJob(jobId);
                jobs.reload();
                tasks.reload();
              } catch (err: any) {
                await modal.alert('Error', err.message || 'Failed to reject');
              }
            }}
            onRework={async (jobId, note) => {
              try {
                await reworkJob(jobId, note, projects.current!.id, projects.current!.local_path!);
                jobs.reload();
                tasks.reload();
              } catch (err: any) {
                await modal.alert('Error', err.message || 'Failed to rework');
              }
            }}
            onDeleteJob={async (jobId) => {
              try {
                await deleteJob(jobId);
                jobs.reload();
              } catch (err: any) {
                await modal.alert('Error', err.message || 'Failed to dismiss job');
              }
            }}
            onMoveToBacklog={async (jobId) => {
              try {
                await moveToBacklog(jobId);
                jobs.reload();
                tasks.reload();
              } catch (err: any) {
                await modal.alert('Error', err.message || 'Failed to move to backlog');
              }
            }}
            onContinue={async (jobId) => {
              try {
                await continueJob(jobId);
                jobs.reload();
                tasks.reload();
              } catch (err: any) {
                await modal.alert('Error', err.message || 'Failed to continue job');
              }
            }}
            onCreatePr={async (workstreamId, opts) => {
              try {
                if (opts?.review) {
                  await reviewAndCreatePr(workstreamId, projects.current?.local_path || '');
                } else {
                  const result = await createWorkstreamPr(workstreamId, projects.current?.local_path || '');
                  if (result.prUrl) workstreams.reload();
                }
              } catch (err: any) {
                await modal.alert('Error', err.message || 'Failed');
              }
            }}
          />
        } />
        <Route path="/archive" element={
          <ArchivePage
            workstreams={workstreams.workstreams.filter(w => w.status === 'archived')}
            tasks={tasks.tasks}
            jobs={jobViews}
            memberMap={memberMap}
            projectId={projects.current?.id || null}
            onRestore={async (wsId) => { await workstreams.updateWorkstream(wsId, { status: 'active' }); }}
          />
        } />
        <Route path="/flows" element={
          projects.current ? (
            <FlowEditor2
              flows={aiFlows.flows}
              setFlows={aiFlows.setFlows}
              projectId={projects.current.id}
              onSave={async (flowId, updates) => { await aiFlows.updateFlow(flowId, updates); await aiFlows.reload(); }}
              onSaveSteps={async (flowId, steps) => { await aiFlows.updateFlowSteps(flowId, steps); await aiFlows.reload(); }}
              onCreateFlow={async (data) => { return await aiFlows.createFlow(data); }}
              onDeleteFlow={async (flowId) => { await aiFlows.deleteFlow(flowId); }}
              onSwapColumns={(draggedId, targetId) => {
                const dragged = aiFlows.flows.find(f => f.id === draggedId);
                const target = aiFlows.flows.find(f => f.id === targetId);
                if (!dragged || !target) return;
                aiFlows.setFlows(prev => prev.map(f => {
                  if (f.id === draggedId) return { ...f, position: target.position };
                  if (f.id === targetId) return { ...f, position: dragged.position };
                  return f;
                }).sort((a, b) => a.position - b.position));
                apiUpdateFlow(draggedId, { position: target.position });
                apiUpdateFlow(targetId, { position: dragged.position });
              }}
            />
          ) : <div />
        } />
      </Routes>

      {showTaskForm && projects.current && (
        <TaskForm
          localPath={projects.current?.local_path}
          workstreams={workstreams.active.map(w => ({ id: w.id, name: w.name }))}
          defaultWorkstreamId={taskFormWorkstream}
          members={members.members.map(m => ({ id: m.id, name: m.name, initials: m.initials }))}
          flows={aiFlows.flows}
          customTypes={customTypes.types.map(t => ({ id: t.id, name: t.name, pipeline: t.pipeline }))}
          onSaveCustomType={async (name, pipeline) => {
            await customTypes.addType(name, pipeline);
          }}
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
              flow_id: data.flow_id,
              auto_continue: data.auto_continue,
              images: data.images,
              workstream_id: data.workstream_id,
              priority: data.priority,
              chaining: data.chaining,
            });
          }}
          onClose={() => { setShowTaskForm(false); setTaskFormWorkstream(null); }}
        />
      )}

      {editingTask && projects.current && (
        <TaskForm
          localPath={projects.current?.local_path}
          workstreams={workstreams.active.map(w => ({ id: w.id, name: w.name }))}
          members={members.members.map(m => ({ id: m.id, name: m.name, initials: m.initials }))}
          flows={aiFlows.flows}
          customTypes={customTypes.types.map(t => ({ id: t.id, name: t.name, pipeline: t.pipeline }))}
          onSaveCustomType={async (name, pipeline) => {
            await customTypes.addType(name, pipeline);
          }}
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
              flow_id: data.flow_id,
              auto_continue: data.auto_continue,
              images: data.images,
              workstream_id: data.workstream_id,
              priority: data.priority,
              chaining: data.chaining,
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
