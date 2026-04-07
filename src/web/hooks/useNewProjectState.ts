import { useState } from 'react';
import type React from 'react';
import { checkHealth } from '../lib/api';
import type { SupabaseConfig } from '../lib/api';
import type { CreateProjectHandler, HealthStatus, NewProjectStep, SetupMode } from '../components/new-project-types';

export function useNewProjectState(onCreate: CreateProjectHandler) {
  const [step, setStep] = useState<NewProjectStep>('setup');
  const [mode, setMode] = useState<SetupMode>(null);
  const [name, setName] = useState('');
  const [localPath, setLocalPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [healthStatus, setHealthStatus] = useState<HealthStatus>('idle');
  const [cloudUrl, setCloudUrl] = useState('');
  const [cloudKey, setCloudKey] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [customKey, setCustomKey] = useState('');
  const [error, setError] = useState('');

  async function handleCheckConnection() {
    setHealthStatus('checking');
    try {
      const result = await checkHealth();
      setHealthStatus(result.ok ? 'ok' : 'error');
    } catch {
      setHealthStatus('error');
    }
  }

  const canContinue = Boolean(mode)
    && (mode !== 'cloud' || (cloudUrl.trim() !== '' && cloudKey.trim() !== ''))
    && (mode !== 'custom' || (customUrl.trim() !== '' && customKey.trim() !== ''));

  function handleContinue() {
    if (!canContinue) return;
    setStep('name');
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || !mode || !localPath.trim()) return;
    setError('');
    setLoading(true);

    try {
      const config: SupabaseConfig = {
        mode,
        ...(mode === 'cloud' ? { url: cloudUrl.trim(), serviceRoleKey: cloudKey.trim() } : {}),
        ...(mode === 'custom' ? { url: customUrl.trim(), serviceRoleKey: customKey.trim() } : {}),
        ...(mode === 'local' ? { url: 'http://127.0.0.1:54321' } : {}),
      };
      await onCreate(name.trim(), config, localPath.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create project');
    } finally {
      setLoading(false);
    }
  }

  const storageSummary = mode === 'local'
    ? ' Using local Supabase.'
    : mode === 'custom'
      ? ` Using ${customUrl}.`
      : ` Using ${cloudUrl}.`;

  return {
    step,
    mode,
    name,
    localPath,
    loading,
    healthStatus,
    cloudUrl,
    cloudKey,
    customUrl,
    customKey,
    error,
    canContinue,
    storageSummary,
    setMode,
    setName,
    setLocalPath,
    setCloudUrl,
    setCloudKey,
    setCustomUrl,
    setCustomKey,
    setStep,
    handleCheckConnection,
    handleContinue,
    handleSubmit,
  };
}
