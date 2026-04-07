import { readFileSync } from 'fs';

export function parseSkillFrontmatter(filePath: string): { description: string } | null {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (!match) return { description: '' };
    const frontmatter = match[1];
    const descMatch = frontmatter.match(/^description:\s*(.+)$/m);
    return { description: descMatch?.[1]?.trim() || '' };
  } catch {
    return null;
  }
}
