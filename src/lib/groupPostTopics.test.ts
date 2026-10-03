import { describe, expect, it } from 'vitest';
import { GROUP_POST_TOPICS, groupPostTopic, groupPostTopicInstructions } from './groupPostTopics';

describe('group post topics', () => {
  it('offers six distinct topics and defaults safely for old drafts', () => {
    expect(GROUP_POST_TOPICS).toHaveLength(6);
    expect(new Set(GROUP_POST_TOPICS.map((topic) => topic.id)).size).toBe(6);
    expect(groupPostTopic(undefined).id).toBe('daily-tip');
    expect(groupPostTopic('unknown').id).toBe('daily-tip');
  });
  it('injects the selected topic and factual guardrails into the prompt', () => {
    for (const topic of GROUP_POST_TOPICS) {
      expect(groupPostTopicInstructions(topic.id)).toContain(topic.label);
      expect(groupPostTopicInstructions(topic.id)).toContain('אין לקדם נכס מסוים');
      expect(groupPostTopicInstructions(topic.id)).toContain('אל תמציא');
    }
  });
});