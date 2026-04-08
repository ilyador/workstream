import { signOut } from '../lib/api';
import { toTaskCreatePayload, toTaskMutationPayload } from '../lib/task-form-payload';
import { CurrentProjectWorkspace } from './CurrentProjectWorkspace';
import type { useCurrentProjectResources } from '../hooks/useCurrentProjectResources';
import type { useExecutionActions } from '../hooks/useExecutionActions';
import type { useNotifications } from '../hooks/useNotifications';
import type { useProjectOrderingMutations } from '../hooks/useProjectOrderingMutations';
import type { useProjects } from '../hooks/useProjects';
import type { useProjectViewModels } from '../hooks/useProjectViewModels';
import type { useTaskEditorState } from '../hooks/useTaskEditorState';
import type { useWebNotifications } from '../hooks/useWebNotifications';

interface AppProjectWorkspaceProps {
  projects: ReturnType<typeof useProjects>;
  profile: {
    id: string;
    initials: string;
  };
  resources: ReturnType<typeof useCurrentProjectResources>;
  notifications: ReturnType<typeof useNotifications>;
  webNotifications: ReturnType<typeof useWebNotifications>;
  viewModels: ReturnType<typeof useProjectViewModels>;
  taskEditor: ReturnType<typeof useTaskEditorState>;
  executionActions: ReturnType<typeof useExecutionActions>;
  ordering: ReturnType<typeof useProjectOrderingMutations>;
  focusTaskId: string | null;
  focusWsId: string | null;
  showAddProject: boolean;
  showMembersModal: boolean;
  onOpenAddProject: () => void;
  onCloseAddProject: () => void;
  onOpenMembersModal: () => void;
  onCloseMembersModal: () => void;
}

export function AppProjectWorkspace({
  projects,
  profile,
  resources,
  notifications,
  webNotifications,
  viewModels,
  taskEditor,
  executionActions,
  ordering,
  focusTaskId,
  focusWsId,
  showAddProject,
  showMembersModal,
  onOpenAddProject,
  onCloseAddProject,
  onOpenMembersModal,
  onCloseMembersModal,
}: AppProjectWorkspaceProps) {
  const currentProject = projects.current;
  if (!currentProject) return null;

  return (
    <CurrentProjectWorkspace
      project={{
        id: currentProject.id,
        name: currentProject.name,
        local_path: currentProject.local_path ?? null,
        role: currentProject.role || 'dev',
      }}
      projects={projects.projects.map(project => ({ id: project.id, name: project.name }))}
      profile={{ id: profile.id, initials: profile.initials }}
      webNotifications={webNotifications}
      notifications={notifications}
      todoItems={viewModels.todoItems}
      reviewItems={viewModels.reviewItems}
      tasks={resources.tasks.tasks}
      activeWorkstreams={resources.workstreams.active}
      allWorkstreams={resources.workstreams.workstreams}
      members={resources.members.members}
      flows={resources.aiFlows.flows}
      setFlows={resources.aiFlows.setFlows}
      providers={resources.providers.providers}
      embeddingProviderConfigId={resources.providers.embeddingProviderConfigId}
      embeddingDimensions={resources.providers.embeddingDimensions}
      detectedLocalProviders={resources.providers.detectedLocalProviders}
      onLoadProviderDiagnostics={resources.providers.loadDiagnostics}
      customTypes={resources.customTypes.types}
      jobs={viewModels.jobViews}
      memberMap={viewModels.memberMap}
      flowMap={viewModels.flowMap}
      typeFlowMap={viewModels.typeFlowMap}
      mentionedTaskIds={viewModels.mentionedTaskIds}
      commentCounts={resources.commentCounts.counts}
      focusTaskId={focusTaskId}
      focusWsId={focusWsId}
      showTaskForm={taskEditor.showTaskForm}
      taskFormWorkstream={taskEditor.taskFormWorkstream}
      editingTask={taskEditor.editingTask}
      showAddProject={showAddProject}
      showMembersModal={showMembersModal}
      onSwitchProject={projects.switchProject}
      onOpenAddProject={onOpenAddProject}
      onSignOut={async () => { await signOut(); window.location.reload(); }}
      onOpenMembersModal={onOpenMembersModal}
      onUpdateLocalPath={path => projects.updateLocalPath(currentProject.id, path)}
      onCloseAddProject={onCloseAddProject}
      onCreateProject={async (name, localPath) => {
        await projects.createProject(name, undefined, localPath);
      }}
      onCloseMembersModal={onCloseMembersModal}
      onSaveCustomType={async (name, pipeline) => {
        await resources.customTypes.addType(name, pipeline);
      }}
      onCreateTask={async (data) => {
        await resources.tasks.createTask(toTaskCreatePayload(currentProject.id, data));
      }}
      onUpdateTaskForm={async (taskId, data) => {
        await resources.tasks.updateTask(taskId, toTaskMutationPayload(data));
      }}
      onCloseCreateTask={taskEditor.closeCreateTask}
      onCloseEditTask={taskEditor.closeEditTask}
      onStartEditingTask={taskEditor.startEditingTask}
      onCreateWorkstream={resources.workstreams.createWorkstream}
      onUpdateWorkstream={resources.workstreams.updateWorkstream}
      onDeleteWorkstream={executionActions.deleteWorkstreamAndReloadTasks}
      onSwapColumns={ordering.handleSwapWorkstreams}
      onAddTask={taskEditor.openCreateTask}
      onRunWorkstream={executionActions.runWorkstream}
      onRunTask={executionActions.runTask}
      onDeleteTask={resources.tasks.deleteTask}
      onUpdateTask={resources.tasks.updateTask}
      onMoveTask={ordering.handleMoveTask}
      onTerminate={executionActions.terminate}
      onReply={executionActions.reply}
      onApprove={executionActions.approve}
      onReject={executionActions.reject}
      onRework={executionActions.rework}
      onDeleteJob={executionActions.dismissJob}
      onMoveToBacklog={executionActions.sendToBacklog}
      onContinue={executionActions.continueExecution}
      onCreatePr={executionActions.createPr}
      onRestoreArchiveWorkstream={async (workstreamId) => {
        await resources.workstreams.updateWorkstream(workstreamId, { status: 'active' });
      }}
      onSaveFlow={async (flowId, updates) => {
        await resources.aiFlows.updateFlow(flowId, updates);
        await resources.aiFlows.reload();
      }}
      onSaveFlowSteps={async (flowId, steps) => {
        await resources.aiFlows.updateFlowSteps(flowId, steps);
        await resources.aiFlows.reload();
      }}
      onCreateFlow={resources.aiFlows.createFlow}
      onDeleteFlow={resources.aiFlows.deleteFlow}
      onSwapFlows={ordering.handleSwapFlows}
      onCreateProvider={resources.providers.createProvider}
      onUpdateProvider={resources.providers.updateProvider}
      onDeleteProvider={resources.providers.deleteProvider}
      onTestProvider={resources.providers.testProvider}
      onRefreshProviderModels={resources.providers.refreshProviderModels}
      onUpdateEmbeddingProvider={resources.providers.updateEmbeddingProvider}
      onReindexDocuments={resources.providers.reindexDocuments}
    />
  );
}
