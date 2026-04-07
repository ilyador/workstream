import { Router, type Response } from 'express';
import { requireAuth } from '../auth-middleware.js';
import { optionalString, requireAnyExactRegisteredLocalPath } from '../authz.js';
import { discoverSkills, publicSkillInfo, type SkillInfo } from '../skills.js';

export const skillsRouter = Router();

const skillsCache = new Map<string, { skills: SkillInfo[]; expires: number }>();
const SKILLS_CACHE_TTL = 30000;

skillsRouter.get('/api/skills', requireAuth, async (req, res) => {
  const localPath = optionalString(req.query.local_path);
  let authorizedLocalPath: string | undefined;
  if (localPath) {
    const authorized = await requireAnyExactRegisteredLocalPath(req, res, localPath);
    if (!authorized) return;
    authorizedLocalPath = authorized;
  }
  sendSkillsResponse(res, authorizedLocalPath);
});

function sendSkillsResponse(res: Response, localPath?: string): void {
  const cacheKey = localPath || '__global__';
  const cached = skillsCache.get(cacheKey);
  if (cached && Date.now() < cached.expires) {
    res.json(cached.skills.map(publicSkillInfo));
    return;
  }
  const skills = discoverSkills(localPath);
  skillsCache.set(cacheKey, { skills, expires: Date.now() + SKILLS_CACHE_TTL });
  res.json(skills.map(publicSkillInfo));
}
