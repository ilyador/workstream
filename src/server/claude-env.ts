export const claudeEnv = {
  ...process.env,
  TERM: 'dumb',
  PATH: `${process.env.HOME}/.local/bin:${process.env.PATH}`,
};
