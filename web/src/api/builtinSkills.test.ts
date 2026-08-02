import { describe, it, expect } from 'vitest';
import { isPersonalSkill } from './builtinSkills';

describe('isPersonalSkill', () => {
  it('keeps skills you wrote, whichever way they were triggered', () => {
    expect(isPersonalSkill('writing-plans')).toBe(true);
    expect(isPersonalSkill('/writing-plans')).toBe(true);
  });

  it('drops built-in skills and built-in slash commands', () => {
    expect(isPersonalSkill('dataviz')).toBe(false);
    expect(isPersonalSkill('/context')).toBe(false);
  });

  it('matches a built-in through either trigger path, since one entry covers both', () => {
    // `init` and `review` ship as skills and are also reachable as slash commands.
    expect(isPersonalSkill('init')).toBe(false);
    expect(isPersonalSkill('/init')).toBe(false);
  });

  it('keeps a name you own even when a built-in shares it', () => {
    // skill-creator ships with Claude Code but is also authored under ~/.claude/skills.
    expect(isPersonalSkill('skill-creator')).toBe(true);
  });

  it('drops the regex fragments the <command-name> scrape lifts out of prose', () => {
    expect(isPersonalSkill('X')).toBe(false);
    expect(isPersonalSkill('(.*?)')).toBe(false);
    // Case-sensitive: a real skill named `x` would survive.
    expect(isPersonalSkill('x')).toBe(true);
  });
});
