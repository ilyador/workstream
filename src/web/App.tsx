import { useState } from 'react';
import { useAuth } from './hooks/useAuth';
import { useProjects } from './hooks/useProjects';
import { useNotifications } from './hooks/useNotifications';
import { useWebNotifications } from './hooks/useWebNotifications';
import { signUp, signIn } from './lib/api';
import { useSearchParams } from 'react-router-dom';
import { OnboardingCheck } from './components/OnboardingCheck';
import { AuthGate } from './components/AuthGate';
import { NewProject } from './components/NewProject';
import { AppProjectWorkspace } from './components/AppProjectWorkspace';
import { useModal } from './hooks/modal-context';
import { useExecutionActions } from './hooks/useExecutionActions';
import { useProjectOrderingMutations } from './hooks/useProjectOrderingMutations';
import { useProjectWorkspaceEffects } from './hooks/useProjectWorkspaceEffects';
import { useProjectViewModels } from './hooks/useProjectViewModels';
import { useTaskEditorState } from './hooks/useTaskEditorState';
import { useCurrentProjectResources } from './hooks/useCurrentProjectResources';
import appStyles from './App.module.css';
import './styles/global.css';

export default function App() {
  const [envReady, setEnvReady] = useState(false);
  const [showAddProject, setShowAddProject] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const auth = useAuth();
  const projects = useProjects(auth.profile?.id);
  const projectResources = useCurrentProjectResources(projects.current?.id || null);
  const notifs = useNotifications(auth.profile?.id, projects.current?.id ?? null);
  const webNotifs = useWebNotifications();
  const modal = useModal();
  const [searchParams, setSearchParams] = useSearchParams();
  const focusTaskId = searchParams.get('task');
  const focusWsId = searchParams.get('ws');
  const { notify } = webNotifs;
  const currentProjectName = projects.current?.name || null;
  const taskEditor = useTaskEditorState();
  const executionActions = useExecutionActions({
    projectId: projects.current?.id || null,
    localPath: projects.current?.local_path,
    modal,
    tasks: projectResources.tasks,
    jobs: projectResources.jobs,
    workstreams: projectResources.workstreams,
  });

  const viewModels = useProjectViewModels({
    tasks: projectResources.tasks.tasks,
    jobs: projectResources.jobs.jobs,
    workstreams: projectResources.workstreams.workstreams,
    members: projectResources.members.members,
    flows: projectResources.aiFlows.flows,
    notifications: notifs.notifications,
    currentUserId: auth.profile?.id,
  });
  const ordering = useProjectOrderingMutations({
    modal,
    workstreams: projectResources.workstreams.workstreams,
    setWorkstreams: projectResources.workstreams.setWorkstreams,
    reloadWorkstreams: projectResources.workstreams.reload,
    tasks: projectResources.tasks.tasks,
    setTasks: projectResources.tasks.setTasks,
    reloadTasks: projectResources.tasks.reload,
    flows: projectResources.aiFlows.flows,
    setFlows: projectResources.aiFlows.setFlows,
    reloadFlows: projectResources.aiFlows.reload,
  });
  useProjectWorkspaceEffects({
    focusTaskId,
    focusWsId,
    setSearchParams,
    jobs: projectResources.jobs.jobs,
    tasks: projectResources.tasks.tasks,
    taskTitleMap: viewModels.taskTitleMap,
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

  if (!projectResources.ready) {
    return <Loading text="Loading project..." />;
  }

  return (
    <AppProjectWorkspace
      projects={projects}
      profile={{ id: auth.profile.id, initials: auth.profile.initials }}
      resources={projectResources}
      notifications={notifs}
      webNotifications={webNotifs}
      viewModels={viewModels}
      taskEditor={taskEditor}
      executionActions={executionActions}
      ordering={ordering}
      focusTaskId={focusTaskId}
      focusWsId={focusWsId}
      showAddProject={showAddProject}
      showMembersModal={showMembersModal}
      onOpenAddProject={() => setShowAddProject(true)}
      onOpenMembersModal={() => setShowMembersModal(true)}
      onCloseAddProject={() => setShowAddProject(false)}
      onCloseMembersModal={() => setShowMembersModal(false)}
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
