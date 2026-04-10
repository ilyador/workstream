import { useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import type { HeaderProjectSummary } from './header-types';
import { useDismissOnOutsideClick } from '../hooks/useDismissOnOutsideClick';
import s from './Header.module.css';

interface HeaderProjectSwitcherProps {
  projectName: string;
  projects: HeaderProjectSummary[];
  currentProjectId: string | null;
  onSwitchProject: (id: string) => void;
  onNewProject: () => void;
  onManageMembers?: () => void;
}

const MOBILE_LINKS: ReadonlyArray<{ to: string; label: string; exact?: boolean }> = [
  { to: '/', label: 'Streams', exact: true },
  { to: '/flows', label: 'AI Flows' },
  { to: '/project-data', label: 'Project Data' },
  { to: '/archive', label: 'Archive' },
];

export function HeaderProjectSwitcher({
  projectName,
  projects,
  currentProjectId,
  onSwitchProject,
  onNewProject,
  onManageMembers,
}: HeaderProjectSwitcherProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useDismissOnOutsideClick(dropdownRef, open, () => setOpen(false));

  return (
    <>
      <span className={s.logo}>WorkStream</span>
      <span className={s.sep}>/</span>
      <div className={s.switcher} ref={dropdownRef}>
        <button className={s.project} onClick={() => setOpen(current => !current)}>
          {projectName} <span className={`${s.caret} ${open ? s.caretOpen : ''}`}>&#9662;</span>
        </button>
        {open && (
          <div className={s.dropdown}>
            <div className={s.dropdownList}>
              {projects.map(project => (
                <button
                  key={project.id}
                  className={`${s.dropdownItem} ${project.id === currentProjectId ? s.dropdownItemActive : ''}`}
                  onClick={() => {
                    onSwitchProject(project.id);
                    setOpen(false);
                  }}
                >
                  <span className={s.dropdownCheck}>
                    {project.id === currentProjectId ? '\u2713' : ''}
                  </span>
                  <span className={s.dropdownName}>{project.name}</span>
                </button>
              ))}
            </div>
            <div className={s.dropdownDivider} />
            <button
              className={s.dropdownNew}
              onClick={() => {
                setOpen(false);
                onNewProject();
              }}
            >
              + New Project
            </button>
            {onManageMembers && (
              <>
                <div className={s.dropdownDivider} />
                <button
                  className={s.dropdownNew}
                  onClick={() => {
                    setOpen(false);
                    onManageMembers();
                  }}
                >
                  Manage Members
                </button>
              </>
            )}
            <div className={s.mobileNav}>
              <div className={s.dropdownDivider} />
              {MOBILE_LINKS.map(link => {
                const active = link.exact ? location.pathname === link.to : location.pathname.startsWith(link.to);
                return (
                  <button
                    key={link.to}
                    className={`${s.dropdownNew} ${active ? s.dropdownNavActive : ''}`}
                    onClick={() => {
                      setOpen(false);
                      navigate(link.to);
                    }}
                  >
                    {link.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <nav className={s.headerNav}>
        <NavLink to="/" end className={({ isActive }) => (isActive ? s.navLinkActive : s.navLink)}>
          Streams
        </NavLink>
        <NavLink to="/flows" className={({ isActive }) => (isActive ? s.navLinkActive : s.navLink)}>
          AI Flows
        </NavLink>
        <NavLink to="/project-data" className={({ isActive }) => (isActive ? s.navLinkActive : s.navLink)}>
          Project Data
        </NavLink>
        <NavLink to="/archive" className={({ isActive }) => (isActive ? s.navLinkActive : s.navLink)}>
          Archive
        </NavLink>
      </nav>
    </>
  );
}
