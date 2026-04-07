import { useState, useEffect, useRef } from 'react';
import { useMembers } from '../hooks/useMembers';
import { useModal } from '../hooks/modal-context';
import { inviteMember, removeMember } from '../lib/api';
import s from './MembersModal.module.css';

interface Props {
  projectId: string;
  currentUserId: string;
  onClose: () => void;
}

export function MembersModal({ projectId, currentUserId, onClose }: Props) {
  const { members, reload } = useMembers(projectId);
  const modal = useModal();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('dev');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose();
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setError('');
    setLoading(true);
    try {
      await inviteMember(projectId, email.trim(), role);
      setEmail('');
      setRole('member');
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to invite member');
    } finally {
      setLoading(false);
    }
  }

  async function handleRemove(userId: string) {
    if (!await modal.confirm('Remove member', 'Remove this member from the project?', { label: 'Remove', danger: true })) return;
    try {
      await removeMember(projectId, userId);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member');
    }
  }

  return (
    <div className={s.overlay} ref={overlayRef} onClick={handleOverlayClick}>
      <div className={s.modal}>
        <h2 className={s.title}>Manage Members</h2>
        <p className={s.subtitle}>Invite people to collaborate on this project.</p>
        {error && <div className={s.error}>{error}</div>}

        <div className={s.memberList}>
          {members.map(m => (
            <div key={m.id} className={s.memberRow}>
              <div className={s.memberAvatar}>{m.initials}</div>
              <div className={s.memberInfo}>
                <span className={s.memberName}>{m.pending ? `${m.email} (pending)` : m.name}</span>
                <span className={s.memberRole}>{m.role}</span>
              </div>
              {m.id !== currentUserId && (
                <button className={s.removeBtn} onClick={() => handleRemove(m.id)}>
                  Remove
                </button>
              )}
            </div>
          ))}
          {members.length === 0 && (
            <p className={s.empty}>No members yet.</p>
          )}
        </div>

        <form className={s.inviteForm} onSubmit={handleInvite}>
          <input
            className={s.input}
            type="email"
            placeholder="Email address"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
          <select
            className={s.roleSelect}
            value={role}
            onChange={e => setRole(e.target.value)}
          >
            <option value="dev">Dev</option>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
          </select>
          <button className="btn btnPrimary btnSm" type="submit" disabled={loading || !email.trim()}>
            {loading ? 'Inviting...' : 'Invite'}
          </button>
        </form>

        <div className={s.actions}>
          <button className="btn btnSecondary" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
