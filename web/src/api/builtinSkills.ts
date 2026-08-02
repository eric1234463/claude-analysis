/**
 * Skills and slash commands that ship with Claude Code, so the Skills page can show only the ones
 * you wrote.
 *
 * Transcripts record no provenance: a `Skill` call is `{"skill":"dataviz"}` and a slash command is
 * `<command-name>/context</command-name>`, with nothing to say whether the definition came from
 * Anthropic, `~/.claude/skills`, or a project's `.claude/skills`. So this hand-kept list is the
 * only way to tell them apart. It is a denylist rather than a scan of the skills directories on
 * purpose — a skill you have since deleted should stay in the history, not vanish from it. The
 * cost is that a built-in Claude Code ships later reads as a personal skill until it is added
 * here.
 *
 * Names are matched bare, after one leading `/` is stripped, so a built-in that is both a skill
 * and a slash command (`/init`, `/review`) needs only one entry. Anything you own wins: this list
 * deliberately omits `skill-creator`, which ships as a built-in but is also authored under
 * `~/.claude/skills`.
 */
const BUILTIN_SKILLS = [
  'artifact-capabilities',
  'artifact-design',
  'claude-api',
  'code-review',
  'dataviz',
  'fewer-permission-prompts',
  'find-skills',
  'init',
  'keybindings-help',
  'loop',
  'review',
  'run',
  'schedule',
  'security-review',
  'simplify',
  'update-config',
];

/** Built-in slash commands, minus the ones already named above as skills. */
const BUILTIN_COMMANDS = [
  'add-dir', 'agents', 'bashes', 'bug', 'clear', 'compact', 'config', 'context', 'cost', 'doctor',
  'exit', 'export', 'fast', 'feedback', 'help', 'hooks', 'ide', 'install-github-app', 'login',
  'logout', 'mcp', 'memory', 'migrate-installer', 'model', 'output-style', 'permissions', 'plan',
  'plugin', 'pr-comments', 'privacy-settings', 'quit', 'remember', 'rename', 'resume', 'rewind',
  'sandbox', 'skills', 'statusline', 'status', 'stickers', 'tasks', 'terminal-setup', 'todos',
  'upgrade', 'usage', 'vim', 'workflows', 'worktree',
];

/**
 * Not skills at all: regex fragments the `<command-name>` scrape lifts out of prose that happens to
 * quote the tag (Claude Code's own docs do). Dropped here rather than tightened in the parser so
 * the aggregate stays a faithful record of what the transcripts contain.
 */
const SCRAPE_ARTIFACTS = ['X', '(.*?)'];

const EXCLUDED = new Set([...BUILTIN_SKILLS, ...BUILTIN_COMMANDS, ...SCRAPE_ARTIFACTS]);

/** True for skills you authored — everything Claude Code did not ship. */
export function isPersonalSkill(name: string): boolean {
  return !EXCLUDED.has(name.startsWith('/') ? name.slice(1) : name);
}
