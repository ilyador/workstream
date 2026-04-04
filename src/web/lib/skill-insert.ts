/**
 * Compute the new text and cursor position after inserting a /skill command.
 * Works for both input and textarea elements.
 */
export function computeSkillInsert(
  text: string,
  cursorPos: number,
  skillName: string,
): { newText: string; newCursor: number } | null {
  const before = text.slice(0, cursorPos);
  const slashMatch = before.match(/(?:^|[\s\n])(\/[a-zA-Z0-9_:-]*)$/);
  if (!slashMatch) return null;
  const slashStart = before.length - slashMatch[1].length;
  const prefix = text.substring(0, slashStart);
  const after = text.substring(cursorPos);
  const newText = prefix + '/' + skillName + ' ' + after;
  const newCursor = prefix.length + skillName.length + 2;
  return { newText, newCursor };
}
