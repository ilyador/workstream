export interface SkillInfo {
  name: string;
  description: string;
  source: string;
  filePath: string;
}

export type PublicSkillInfo = Omit<SkillInfo, 'filePath'>;

export function publicSkillInfo(skill: SkillInfo): PublicSkillInfo {
  return {
    name: skill.name,
    description: skill.description,
    source: skill.source,
  };
}
