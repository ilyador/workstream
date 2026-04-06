import { useState } from 'react';
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
import { useSearchParams } from 'react-router-dom';
import { OnboardingCheck } from './components/OnboardingCheck';
import { AuthGate } from './components/AuthGate';
import { NewProject } from './components/NewProject';
import { CurrentProjectWorkspace } from './components/CurrentProjectWorkspace';
import { useModal } from './hooks/modal-context';
import { useExecutionActions } from './hooks/useExecutionActions';
import { useProjectOrderingMutations } from './hooks/useProjectOrderingMutations';
import { useProjectWorkspaceEffects } from './hooks/useProjectWorkspaceEffects';
import { useProjectViewModels } from './hooks/useProjectViewModels';
import { useTaskEditorState } from './hooks/useTaskEditorState';
import appStyles from './App.module.css';
import './styles/global.css';

export default function App() {
  const [envReady, setEnvReady] = useState(false);
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
  const {
    showTaskForm,
    taskFormWorkstream,
    editingTask,
    openCreateTask,
    closeCreateTask,
    startEditingTask,
    closeEditTask,
  } = useTaskEditorState();
  const executionActions = useExecutionActions({
    projectId: projects.current?.id || null,
    localPath: projects.current?.local_path,
    modal,
    tasks,
    jobs,
    workstreams,
  });

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
  useProjectWorkspaceEffects({
    focusTaskId,
    focusWsId,
    setSearchParams,
    jobs: jobs.jobs,
    tasks: tasks.tasks,
    taskTitleMap,
    notify,
    currentProjectName,
  });

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
    <CurrentProjectWorkspace
      project={{
        id: projects.current.id,
        name: projects.current.name,
        local_path: projects.current.local_path ?? null,
        role: projects.current.role || 'dev',
      }}
      projects={projects.projects.map(project => ({ id: project.id, name: project.name }))}
      profile={{ id: auth.profile.id, initials: auth.profile.initials }}
      webNotifications={webNotifs}
      notifications={notifs}
      milestone={wsProgress}
      todoItems={todoItems}
      reviewItems={reviewItems}
      tasks={tasks.tasks}
      activeWorkstreams={workstreams.active}
      allWorkstreams={workstreams.workstreams}
      members={members.members}
      flows={aiFlows.flows}
      setFlows={aiFlows.setFlows}
      customTypes={customTypes.types}
      jobs={jobViews}
      memberMap={memberMap}
      flowMap={flowMap}
      typeFlowMap={typeFlowMap}
      mentionedTaskIds={mentionedTaskIds}
      commentCounts={commentCounts.counts}
      focusTaskId={focusTaskId}
      focusWsId={focusWsId}
      showTaskForm={showTaskForm}
      taskFormWorkstream={taskFormWorkstream}
      editingTask={editingTask}
      showAddProject={showAddProject}
      showMembersModal={showMembersModal}
      onSwitchProject={projects.switchProject}
      onOpenAddProject={() => setShowAddProject(true)}
      onSignOut={async () => { await signOut(); window.location.reload(); }}
      onOpenMembersModal={() => setShowMembersModal(true)}
      onUpdateLocalPath={path => projects.updateLocalPath(projects.current.id, path)}
      onCloseAddProject={() => setShowAddProject(false)}
      onCreateProject={async (name, localPath) => {
        await projects.createProject(name, undefined, localPath);
      }}
      onCloseMembersModal={() => setShowMembersModal(false)}
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
      onUpdateTaskForm={async (taskId, data) => {
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
      onCloseCreateTask={closeCreateTask}
      onCloseEditTask={closeEditTask}
      onStartEditingTask={startEditingTask}
      onCreateWorkstream={workstreams.createWorkstream}
      onUpdateWorkstream={workstreams.updateWorkstream}
      onDeleteWorkstream={executionActions.deleteWorkstreamAndReloadTasks}
      onSwapColumns={handleSwapWorkstreams}
      onAddTask={openCreateTask}
      onRunWorkstream={executionActions.runWorkstream}
      onRunTask={executionActions.runTask}
      onDeleteTask={tasks.deleteTask}
      onUpdateTask={tasks.updateTask}
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
      onRestoreArchiveWorkstream={async (workstreamId) => { await workstreams.updateWorkstream(workstreamId, { status: 'active' }); }}
      onSaveFlow={async (flowId, updates) => { await aiFlows.updateFlow(flowId, updates); await aiFlows.reload(); }}
      onSaveFlowSteps={async (flowId, steps) => { await aiFlows.updateFlowSteps(flowId, steps); await aiFlows.reload(); }}
      onCreateFlow={aiFlows.createFlow}
      onDeleteFlow={aiFlows.deleteFlow}
      onSwapFlows={handleSwapFlows}
    />
  );
}

function Loading({ text }: { text: string }) {
  return (
    <div className={appStyles.loadingScreen}>
      {text}
    </div>
  );
}
