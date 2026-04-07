import type { SupabaseConfig } from '../lib/api';

export type NewProjectStep = 'setup' | 'name';
export type SetupMode = 'local' | 'cloud' | 'custom' | null;
export type HealthStatus = 'idle' | 'checking' | 'ok' | 'error';

export type CreateProjectHandler = (
  name: string,
  supabaseConfig: SupabaseConfig,
  localPath: string,
) => Promise<void>;
