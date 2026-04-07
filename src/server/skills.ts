import { existsSync, readdirSync } from 'fs';
import { homedir } from 'os';
import { basename, join } from 'path';
import { parseSkillFrontmatter } from './skill-frontmatter.js';
import { addPluginSkills } from './skill-plugin-discovery.js';
import type { SkillInfo } from './skill-types.js';

export { publicSkillInfo, type PublicSkillInfo, type SkillInfo } from './skill-types.js';

export function discoverSkills(localPath?: string): SkillInfo[] {
  const skills: SkillInfo[] = [];
  const seen = new Set<string>();

  function addFromDir(dir: string, source: string) {
    if (!existsSync(dir)) return;
    try {
      const files = readdirSync(dir).filter(file => file.endsWith('.md'));
      for (const file of files) {
        const name = basename(file, '.md');
        if (seen.has(name)) continue;
        const filePath = join(dir, file);
        const meta = parseSkillFrontmatter(filePath);
        if (!meta) continue;
        seen.add(name);
        skills.push({ name, description: meta.description, source, filePath });
      }
    } catch {
      // Ignore unreadable skill directories.
    }
  }

  if (localPath) {
    addFromDir(join(localPath, '.claude', 'commands'), 'project');
  }

  const home = homedir();
  addFromDir(join(home, '.claude', 'commands'), 'global');

  const pluginsDir = join(home, '.claude', 'plugins', 'marketplaces');
  if (!existsSync(pluginsDir)) return skills;

  try {
    for (const marketplace of readdirSync(pluginsDir)) {
      const marketplacePlugins = join(pluginsDir, marketplace, 'plugins');
      if (!existsSync(marketplacePlugins)) continue;
      for (const plugin of readdirSync(marketplacePlugins)) {
        addFromDir(join(marketplacePlugins, plugin, 'commands'), plugin);
        addPluginSkills(join(marketplacePlugins, plugin, 'skills'), plugin, skills, seen);
      }
    }
  } catch {
    // Plugin discovery is best-effort.
  }

  return skills;
}
