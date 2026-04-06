import { useRef, useState } from 'react';
import { useDismissOnOutsideClick } from '../hooks/useDismissOnOutsideClick';
import s from './Header.module.css';

interface HeaderUserMenuProps {
  userInitials: string;
  onSignOut?: () => void;
}

export function HeaderUserMenu({ userInitials, onSignOut }: HeaderUserMenuProps) {
  const [open, setOpen] = useState(false);
  const avatarRef = useRef<HTMLDivElement>(null);

  useDismissOnOutsideClick(avatarRef, open, () => setOpen(false));

  return (
    <div className={s.avatarWrap} ref={avatarRef}>
      <button className={s.avatar} onClick={() => setOpen(current => !current)}>
        {userInitials}
      </button>
      {open && (
        <div className={s.avatarDropdown}>
          <button
            className={s.avatarOption}
            onClick={() => {
              setOpen(false);
              onSignOut?.();
            }}
          >
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
