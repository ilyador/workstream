import { ProviderSettingsPage } from './ProviderSettingsPage';
import type { ProjectWorkspaceRoutesProps } from './ProjectWorkspaceRoutes';

type ProjectProvidersRouteProps = Pick<
  ProjectWorkspaceRoutesProps,
  | 'providers'
  | 'embeddingProviderConfigId'
  | 'embeddingDimensions'
  | 'detectedLocalProviders'
  | 'onLoadProviderDiagnostics'
  | 'onCreateProvider'
  | 'onUpdateProvider'
  | 'onDeleteProvider'
  | 'onTestProvider'
  | 'onRefreshProviderModels'
  | 'onUpdateEmbeddingProvider'
  | 'onReindexDocuments'
>;

export function ProjectProvidersRoute(props: ProjectProvidersRouteProps) {
  const { onLoadProviderDiagnostics, ...rest } = props;
  return <ProviderSettingsPage {...rest} onLoadDiagnostics={onLoadProviderDiagnostics} />;
}
