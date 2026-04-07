import { FlowEditor } from './FlowEditor';
import type { ProjectWorkspaceRoutesProps } from './ProjectWorkspaceRoutes';

type ProjectFlowsRouteProps = Pick<
  ProjectWorkspaceRoutesProps,
  'flows' | 'setFlows' | 'project' | 'onSaveFlow' | 'onSaveFlowSteps' | 'onCreateFlow' | 'onDeleteFlow' | 'onSwapFlows'
>;

export function ProjectFlowsRoute({
  flows,
  setFlows,
  project,
  onSaveFlow,
  onSaveFlowSteps,
  onCreateFlow,
  onDeleteFlow,
  onSwapFlows,
}: ProjectFlowsRouteProps) {
  return (
    <FlowEditor
      flows={flows}
      setFlows={setFlows}
      projectId={project.id}
      onSave={onSaveFlow}
      onSaveSteps={onSaveFlowSteps}
      onCreateFlow={onCreateFlow}
      onDeleteFlow={onDeleteFlow}
      onSwapColumns={onSwapFlows}
    />
  );
}
