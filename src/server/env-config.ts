import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

export interface SupabaseRuntimeConfig {
  mode: string;
  url?: string;
  serviceRoleKey?: string;
}

function setEnvVar(content: string, key: string, value: string): string {
  if (/[\r\n]/.test(value)) {
    throw new Error(`${key} cannot contain newlines`);
  }
  const regex = new RegExp(`^${key}=.*$`, 'm');
  if (regex.test(content)) {
    return content.replace(regex, `${key}=${value}`);
  }
  return content + (content.endsWith('\n') || content === '' ? '' : '\n') + `${key}=${value}\n`;
}

export function persistSupabaseConfig(config: SupabaseRuntimeConfig): void {
  if (process.env.WORKSTREAM_ALLOW_RUNTIME_SUPABASE_CONFIG !== 'true') {
    return;
  }
  if (!config || typeof config !== 'object' || typeof config.mode !== 'string') {
    throw new Error('supabase_config.mode is required');
  }

  const envPath = resolve(process.cwd(), '.env');
  let envContent = '';
  if (existsSync(envPath)) {
    envContent = readFileSync(envPath, 'utf-8');
  }

  if (config.mode === 'local') {
    envContent = setEnvVar(envContent, 'SUPABASE_URL', 'http://127.0.0.1:54321');
    envContent = setEnvVar(envContent, 'SUPABASE_MODE', 'local');
  } else if ((config.mode === 'cloud' || config.mode === 'custom') && config.url && config.serviceRoleKey) {
    if (typeof config.url !== 'string' || typeof config.serviceRoleKey !== 'string') {
      throw new Error('supabase_config.url and serviceRoleKey are required');
    }
    try {
      new URL(config.url);
    } catch {
      throw new Error('supabase_config.url must be a valid URL');
    }
    envContent = setEnvVar(envContent, 'SUPABASE_URL', config.url);
    envContent = setEnvVar(envContent, 'SUPABASE_SERVICE_ROLE_KEY', config.serviceRoleKey);
    envContent = setEnvVar(envContent, 'SUPABASE_MODE', config.mode);
  } else {
    throw new Error('supabase_config.mode must be local, cloud, or custom');
  }

  writeFileSync(envPath, envContent, 'utf-8');
}
