import type { ProjectWorkspaceProps } from './project-workspace-types';
import { ProjectWorkspaceHeader } from './ProjectWorkspaceHeader';
import { ProjectWorkspaceRoutes } from './ProjectWorkspaceRoutes';
import { ProjectWorkspaceModals } from './ProjectWorkspaceModals';

export function ProjectWorkspace({
  headerProps,
  routesProps,
  modalProps,
}: ProjectWorkspaceProps) {
  return (
    <>
      <ProjectWorkspaceHeader {...headerProps} />
      <ProjectWorkspaceRoutes {...routesProps} />
      <ProjectWorkspaceModals {...modalProps} />
    </>
  );
}
