import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { parseSkillFrontmatter } from './skill-frontmatter.js';
import type { SkillInfo } from './skill-types.js';

export function addPluginSkills(pluginSkillsDir: string, plugin: string, skills: SkillInfo[], seen: Set<string>): void {
  if (!existsSync(pluginSkillsDir)) return;

  try {
    for (const skillName of readdirSync(pluginSkillsDir)) {
      const skillDir = join(pluginSkillsDir, skillName);
      try {
        if (!statSync(skillDir).isDirectory()) continue;
      } catch {
        continue;
      }
      if (seen.has(skillName)) continue;

      const filePath = findSkillFile(skillDir, skillName);
      if (!filePath) continue;
      const meta = parseSkillFrontmatter(filePath);
      if (!meta) continue;

      seen.add(skillName);
      skills.push({ name: `${plugin}:${skillName}`, description: meta.description, source: plugin, filePath });
    }
  } catch {
    // Ignore unreadable plugin skill directories.
  }
}

function findSkillFile(skillDir: string, skillName: string): string | null {
  const candidateFiles = [
    join(skillDir, `${skillName}.md`),
    join(skillDir, 'SKILL.md'),
  ];
  for (const candidate of candidateFiles) {
    if (existsSync(candidate)) return candidate;
  }

  const altFile = readdirSync(skillDir).find(file => file.endsWith('.md'));
  return altFile ? join(skillDir, altFile) : null;
}
