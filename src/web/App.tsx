import { useState, useEffect, useRef } from 'react';
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
import { signUp, signIn, signOut } from './lib/api';
import { Routes, Route, useSearchParams } from 'react-router-dom';
import { OnboardingCheck } from './components/OnboardingCheck';
import { AuthGate } from './components/AuthGate';
import { NewProject } from './components/NewProject';
import { Header } from './components/Header';
import { Board } from './components/Board';
import { ArchivePage } from './components/ArchivePage';
import { ProjectTaskDialogs } from './components/ProjectTaskDialogs';
import type { EditTaskData } from './components/TaskForm';
import { AddProjectModal } from './components/AddProjectModal';
import { MembersModal } from './components/MembersModal';
import { FlowEditor2 } from './components/FlowEditor2';
import { useModal } from './hooks/modal-context';
import { useExecutionActions } from './hooks/useExecutionActions';
import { useProjectOrderingMutations } from './hooks/useProjectOrderingMutations';
import { useProjectViewModels } from './hooks/useProjectViewModels';
import appStyles from './App.module.css';
import './styles/global.css';

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
  const { notify } = webNotifs;
  const currentProjectName = projects.current?.name || null;
  const executionActions = useExecutionActions({
    projectId: projects.current?.id || null,
    localPath: projects.current?.local_path,
    modal,
    tasks,
    jobs,
    workstreams,
  });

  // Clear ?task= and ?ws= params after a short delay so they don't stick
  useEffect(() => {
    if (focusTaskId || focusWsId) {
      const timer = setTimeout(() => setSearchParams({}, { replace: true }), 1000);
      return () => clearTimeout(timer);
    }
  }, [focusTaskId, focusWsId, setSearchParams]);

  const {
    mentionedTaskIds,
    taskTitleMap,
    memberMap,
    flowMap,
    typeFlowMap,
    jobViews,
    todoItems,
    reviewItems,
    wsProgress,
  } = useProjectViewModels({
    tasks: tasks.tasks,
    jobs: jobs.jobs,
    activeWorkstreams: workstreams.active,
    workstreams: workstreams.workstreams,
    members: members.members,
    flows: aiFlows.flows,
    notifications: notifs.notifications,
    currentUserId: auth.profile?.id,
  });
  const {
    handleSwapWorkstreams,
    handleMoveTask,
    handleSwapFlows,
  } = useProjectOrderingMutations({
    modal,
    workstreams: workstreams.workstreams,
    setWorkstreams: workstreams.setWorkstreams,
    reloadWorkstreams: workstreams.reload,
    tasks: tasks.tasks,
    setTasks: tasks.setTasks,
    reloadTasks: tasks.reload,
    flows: aiFlows.flows,
    setFlows: aiFlows.setFlows,
    reloadFlows: aiFlows.reload,
  });

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
          notify('Task failed', `${title}: ${job.question || 'unknown error'}`);
        } else if (oldStatus) {
          // Other notifications only fire on status transitions (not initial load)
          if (job.status === 'paused') {
            notify('Question asked', `${title} needs your input`);
          } else if (job.status === 'done') {
            notify('Task completed', `${title} finished successfully`);
          }
        }
      }
      prev[job.id] = job.status;
    }
  }, [jobs.jobs, notify, taskTitleMap]);

  useEffect(() => {
    const prev = prevTaskStatuses.current;
    for (const task of tasks.tasks) {
      const oldStatus = prev[task.id];
      if (oldStatus && oldStatus !== task.status && task.status === 'review') {
        notify('Ready for review', `${task.title} is ready for review`);
      }
      prev[task.id] = task.status;
    }
  }, [notify, tasks.tasks]);

  // Tick removed — elapsed is now computed locally inside TaskCard

  useEffect(() => {
    document.title = currentProjectName
      ? `${currentProjectName} - WorkStream`
      : 'WorkStream';
  }, [currentProjectName]);

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

  if (!projects.current) {
    return <Loading text="Loading project..." />;
  }

  const projectReady = tasks.ready
    && jobs.ready
    && workstreams.ready
    && members.ready
    && aiFlows.ready
    && customTypes.ready
    && commentCounts.ready;

  if (!projectReady) {
    return <Loading text="Loading project..." />;
  }

  return (
    <>
      {webNotifs.showPrompt && (
        <div className={appStyles.notificationPrompt}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={appStyles.notificationIcon}>
            <path d="M8 1.5C5.5 1.5 4 3.5 4 5.5V8L2.5 10.5V11.5H13.5V10.5L12 8V5.5C12 3.5 10.5 1.5 8 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
            <path d="M6.5 12.5C6.5 13.3 7.2 14 8 14C8.8 14 9.5 13.3 9.5 12.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          <span>Enable notifications to stay updated on task progress</span>
          <button
            className={`btn btnPrimary btnSm ${appStyles.notificationAction}`}
            onClick={webNotifs.requestPermission}
          >Enable</button>
          <button
            className={`btn btnGhost btnSm ${appStyles.notificationDismiss}`}
            onClick={webNotifs.dismiss}
          >Dismiss</button>
        </div>
      )}

      <Header
        projectName={projects.current?.name || ''}
        localPath={projects.current?.local_path ?? undefined}
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
            onDeleteWorkstream={executionActions.deleteWorkstreamAndReloadTasks}
            onSwapColumns={handleSwapWorkstreams}
            onAddTask={(workstreamId) => {
              setTaskFormWorkstream(workstreamId);
              setShowTaskForm(true);
            }}
            onRunWorkstream={executionActions.runWorkstream}
            onRunTask={executionActions.runTask}
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
            onMoveTask={handleMoveTask}
            onTerminate={executionActions.terminate}
            onReply={executionActions.reply}
            onApprove={executionActions.approve}
            onReject={executionActions.reject}
            onRework={executionActions.rework}
            onDeleteJob={executionActions.dismissJob}
            onMoveToBacklog={executionActions.sendToBacklog}
            onContinue={executionActions.continueExecution}
            onCreatePr={executionActions.createPr}
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
            onUpdateTask={async (taskId, data) => { await tasks.updateTask(taskId, data); }}
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
              onSwapColumns={handleSwapFlows}
            />
          ) : <div />
        } />
      </Routes>

      {projects.current && (
        <ProjectTaskDialogs
          projectId={projects.current.id}
          localPath={projects.current.local_path ?? undefined}
          workstreams={workstreams.active}
          members={members.members}
          flows={aiFlows.flows}
          customTypes={customTypes.types}
          showCreate={showTaskForm}
          defaultWorkstreamId={taskFormWorkstream}
          editingTask={editingTask}
          onSaveCustomType={customTypes.addType}
          onCreateTask={async (data) => {
            await tasks.createTask({
              project_id: projects.current.id,
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
          onUpdateTask={async (taskId, data) => {
            await tasks.updateTask(taskId, {
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
          onCloseCreate={() => { setShowTaskForm(false); setTaskFormWorkstream(null); }}
          onCloseEdit={() => setEditingTask(null)}
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
    <div className={appStyles.loadingScreen}>
      {text}
    </div>
  );
}
