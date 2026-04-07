import { useNewProjectState } from '../hooks/useNewProjectState';
import { NewProjectNameStep } from './NewProjectNameStep';
import { NewProjectSetupStep } from './NewProjectSetupStep';
import type { CreateProjectHandler } from './new-project-types';

interface NewProjectProps {
  onCreate: CreateProjectHandler;
}

export function NewProject({ onCreate }: NewProjectProps) {
  const state = useNewProjectState(onCreate);

  if (state.step === 'setup') {
    return (
      <NewProjectSetupStep
        mode={state.mode}
        healthStatus={state.healthStatus}
        cloudUrl={state.cloudUrl}
        cloudKey={state.cloudKey}
        customUrl={state.customUrl}
        customKey={state.customKey}
        canContinue={state.canContinue}
        onModeChange={state.setMode}
        onCloudUrlChange={state.setCloudUrl}
        onCloudKeyChange={state.setCloudKey}
        onCustomUrlChange={state.setCustomUrl}
        onCustomKeyChange={state.setCustomKey}
        onCheckConnection={state.handleCheckConnection}
        onContinue={state.handleContinue}
      />
    );
  }

  return (
    <NewProjectNameStep
      name={state.name}
      localPath={state.localPath}
      loading={state.loading}
      error={state.error}
      storageSummary={state.storageSummary}
      onBack={() => state.setStep('setup')}
      onNameChange={state.setName}
      onLocalPathChange={state.setLocalPath}
      onSubmit={state.handleSubmit}
    />
  );
}
