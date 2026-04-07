import type { CurrentProjectWorkspaceProps } from './project-workspace-types';
import { ProjectWorkspace } from './ProjectWorkspace';
import { useCurrentProjectWorkspaceProps } from '../hooks/useCurrentProjectWorkspaceProps';

export function CurrentProjectWorkspace(props: CurrentProjectWorkspaceProps) {
  const workspaceProps = useCurrentProjectWorkspaceProps(props);
  return <ProjectWorkspace {...workspaceProps} />;
}
