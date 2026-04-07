import type React from 'react';
import type { SetupMode } from './new-project-types';
import s from './NewProject.module.css';

interface NewProjectSetupCardsProps {
  mode: SetupMode;
  onModeChange: (mode: SetupMode) => void;
}

export function NewProjectSetupCards({ mode, onModeChange }: NewProjectSetupCardsProps) {
  return (
    <div className={s.cards}>
      <SetupCard
        selected={mode === 'local'}
        title="Local (Docker)"
        description="Run Supabase on your machine. Good for development."
        icon={<LocalIcon />}
        onClick={() => onModeChange('local')}
      />
      <SetupCard
        selected={mode === 'cloud'}
        title="Supabase Cloud"
        description="Connect to a hosted Supabase project. Good for teams."
        icon={<CloudIcon />}
        onClick={() => onModeChange('cloud')}
      />
      <SetupCard
        selected={mode === 'custom'}
        title="Custom Connection"
        description="Connect to a self-hosted Supabase on another machine or custom URL."
        icon={<CustomIcon />}
        onClick={() => onModeChange('custom')}
      />
    </div>
  );
}

function SetupCard({
  selected,
  title,
  description,
  icon,
  onClick,
}: {
  selected: boolean;
  title: string;
  description: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      className={`${s.card} ${selected ? s.cardSelected : ''}`}
      onClick={onClick}
      type="button"
    >
      <span className={s.cardIcon}>{icon}</span>
      <span className={s.cardTitle}>{title}</span>
      <span className={s.cardDesc}>{description}</span>
    </button>
  );
}

function LocalIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="2" y="4" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 10h8M6 13h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function CloudIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M5.5 14.5A3.5 3.5 0 015 7.536 5 5 0 0114.63 6.5 4 4 0 0115 14.5H5.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function CustomIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M10 2v4M10 14v4M2 10h4M14 10h4M4.93 4.93l2.83 2.83M12.24 12.24l2.83 2.83M15.07 4.93l-2.83 2.83M7.76 12.24l-2.83 2.83" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
