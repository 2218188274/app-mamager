import test from 'node:test';
import assert from 'node:assert/strict';
import { topicBrief, topicCategories } from '../dist/services/ai/topics.js';
test('topic tasks explicitly open a conversation with bounded, user-supplied background and exclusions', () => {
  assert.equal(topicCategories.length, 8);
  const prompt = topicBrief('hobbies', '刚认识，喜欢音乐', ['旧的开场白']);
  assert.match(prompt, /兴趣娱乐/); assert.match(prompt, /没有必须回复/); assert.match(prompt, /刚认识，喜欢音乐/); assert.match(prompt, /旧的开场白/);
  assert.match(topicBrief('daily', '', []), /背景未知/);
});
