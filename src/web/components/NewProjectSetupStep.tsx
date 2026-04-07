import { NewProjectSetupCards } from './NewProjectSetupCards';
import { NewProjectSetupDetails } from './NewProjectSetupDetails';
import type { HealthStatus, SetupMode } from './new-project-types';
import s from './NewProject.module.css';

interface NewProjectSetupStepProps {
  mode: SetupMode;
  healthStatus: HealthStatus;
  cloudUrl: string;
  cloudKey: string;
  customUrl: string;
  customKey: string;
  canContinue: boolean;
  onModeChange: (mode: SetupMode) => void;
  onCloudUrlChange: (value: string) => void;
  onCloudKeyChange: (value: string) => void;
  onCustomUrlChange: (value: string) => void;
  onCustomKeyChange: (value: string) => void;
  onCheckConnection: () => void;
  onContinue: () => void;
}

export function NewProjectSetupStep({
  mode,
  healthStatus,
  cloudUrl,
  cloudKey,
  customUrl,
  customKey,
  canContinue,
  onModeChange,
  onCloudUrlChange,
  onCloudKeyChange,
  onCustomUrlChange,
  onCustomKeyChange,
  onCheckConnection,
  onContinue,
}: NewProjectSetupStepProps) {
  return (
    <div className={s.container}>
      <h1 className={s.title}>How do you want to store data?</h1>
      <p className={s.subtitle}>WorkStream uses Supabase for storage. Choose a setup.</p>

      <NewProjectSetupCards mode={mode} onModeChange={onModeChange} />
      <NewProjectSetupDetails
        mode={mode}
        healthStatus={healthStatus}
        cloudUrl={cloudUrl}
        cloudKey={cloudKey}
        customUrl={customUrl}
        customKey={customKey}
        onCloudUrlChange={onCloudUrlChange}
        onCloudKeyChange={onCloudKeyChange}
        onCustomUrlChange={onCustomUrlChange}
        onCustomKeyChange={onCustomKeyChange}
        onCheckConnection={onCheckConnection}
      />

      {mode && (
        <button
          className={`btn btnPrimary ${s.submitWrap}`}
          onClick={onContinue}
          disabled={!canContinue}
          type="button"
        >
          Continue
        </button>
      )}
    </div>
  );
}
