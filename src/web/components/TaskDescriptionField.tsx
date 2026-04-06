import { useCallback, useEffect, useRef, useState } from 'react';
import { getSkills, type SkillInfo } from '../lib/api';
import { MdField } from './MdField';
import { useSlashCommands } from '../hooks/useSlashCommands';
import { computeSkillInsert } from '../lib/skill-insert';
import s from './TaskForm.module.css';

interface TaskDescriptionFieldProps {
  mode: string;
  value: string;
  localPath?: string;
  onChange: (value: string) => void;
  onImagePaste: (event: React.ClipboardEvent<HTMLTextAreaElement>) => void;
}

export function TaskDescriptionField({
  mode,
  value,
  localPath,
  onChange,
  onImagePaste,
}: TaskDescriptionFieldProps) {
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [skillsLoaded, setSkillsLoaded] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const slash = useSlashCommands(skills);

  useEffect(() => {
    getSkills(localPath)
      .then(data => {
        setSkills(data);
        setSkillsLoaded(true);
      })
      .catch(() => {
        setSkillsLoaded(true);
      });
  }, [localPath]);

  const skillNames = new Set(skills.map(skill => skill.name));
  const referencedSkills = mode === 'ai' && value
    ? [...value.matchAll(/(?:^|[\s\n])\/([a-zA-Z0-9_][\w:-]*)/g)].map(match => match[1])
    : [];
  const invalidSkills = referencedSkills.filter(name => !skillNames.has(name));
  const validSkills = referencedSkills.filter(name => skillNames.has(name));

  const handleDescriptionChange = useCallback((event: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = event.target.value;
    const cursor = event.target.selectionStart;
    onChange(nextValue);
    event.target.style.height = 'auto';
    event.target.style.height = `${event.target.scrollHeight}px`;
    if (mode === 'ai') {
      slash.handleTextChange(nextValue, cursor);
    }
  }, [mode, onChange, slash]);

  const insertSkill = useCallback((skillName: string) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const result = computeSkillInsert(value, textarea.selectionStart, skillName);
    if (!result) return;
    onChange(result.newText);
    slash.dismiss();
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.selectionStart = result.newCursor;
      textarea.selectionEnd = result.newCursor;
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    });
  }, [onChange, slash, value]);

  const handleDescriptionKeyDown = useCallback((event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mode === 'ai') {
      slash.handleKeyDown(event, insertSkill);
    }
  }, [insertSkill, mode, slash]);

  const placeholder = mode === 'ai'
    ? 'Description (optional) -- type / to insert a skill'
    : 'Description (optional)';

  return (
    <div className={s.descriptionWrap}>
      <MdField
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        minHeight={72}
        renderTextarea={(stopEditing) => (
          <textarea
            ref={element => {
              textareaRef.current = element;
              if (element) {
                element.style.height = 'auto';
                element.style.height = `${element.scrollHeight}px`;
              }
            }}
            className={s.descriptionTextarea}
            placeholder={placeholder}
            value={value}
            onChange={handleDescriptionChange}
            onKeyDown={handleDescriptionKeyDown}
            onBlur={event => {
              const relatedTarget = event.relatedTarget as HTMLElement | null;
              if (!relatedTarget?.tagName?.match(/^BUTTON$/i) && !relatedTarget?.closest('button')) {
                stopEditing();
              }
              setTimeout(() => slash.dismiss(), 150);
            }}
            onPaste={event => {
              const hasImage = Array.from(event.clipboardData.items).some(item => item.type.startsWith('image/'));
              if (hasImage) {
                event.preventDefault();
                onImagePaste(event);
              }
            }}
            autoFocus
          />
        )}
      />
      {mode === 'ai' && slash.matches.length > 0 && (
        <div className={s.skillDropdown}>
          {slash.matches.map((skill, index) => (
            <div
              key={skill.name}
              className={`${s.skillItem} ${index === slash.selectedIdx ? s.skillItemActive : ''}`}
              onMouseDown={event => {
                event.preventDefault();
                insertSkill(skill.name);
              }}
              onMouseEnter={() => {}}
            >
              <span className={s.skillName}>/{skill.name}</span>
              {skill.description && <span className={s.skillDesc}>{skill.description}</span>}
              <span className={s.skillSource}>{skill.source}</span>
            </div>
          ))}
        </div>
      )}
      {mode === 'ai' && referencedSkills.length > 0 && slash.matches.length === 0 && skillsLoaded && (
        <div className={s.skillBadges}>
          {validSkills.map(name => (
            <span key={name} className={s.skillBadgeValid}>
              /{name}
            </span>
          ))}
          {invalidSkills.map(name => (
            <span
              key={name}
              className={s.skillBadgeInvalid}
              title="Skill not found - will be ignored"
            >
              /{name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
