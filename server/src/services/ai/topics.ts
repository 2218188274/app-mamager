export const topicCategories = ['daily', 'food', 'hobbies', 'weekend', 'care', 'reconnect', 'work', 'closer'] as const;
const names: Record<typeof topicCategories[number], string> = {
  daily: '日常破冰', food: '美食口味', hobbies: '兴趣娱乐', weekend: '周末出游',
  care: '关心近况', reconnect: '久未联系', work: '同事交流', closer: '慢慢熟悉',
};
export function topicBrief(category: typeof topicCategories[number], background: string, avoid: string[]) {
  return [
    `请主动开启一个“${names[category]}”话题，写出可以直接发给聊天对象的自然开场白。`,
    '现在没有必须回复的对方消息。只给开场白正文，不要标题、编号、解释、聊天建议或模拟对方回答。',
    '每条一到两句话，只问一个容易接住的问题。不要连续盘问、索要隐私、刻意暧昧，或假装双方有未提供的共同经历。',
    background.trim() ? `用户主动补充的背景（仅作参考）：${background.trim()}` : '背景未知，选择低压力、容易回答的话题。',
    avoid.length ? `换个角度，避免重复以下上一批话题：${JSON.stringify(avoid)}` : '',
  ].filter(Boolean).join('\n');
}
