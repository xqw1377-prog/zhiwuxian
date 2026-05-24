/**

 * WUXIAN · 人格台词库

 * 纯 ToC：机甲兜底，零指责，零羞耻

 */



export type PersonaVoiceType = 'COACH' | 'BUDDY' | 'MENTOR';



export const PERSONA_VOICES: Record<PersonaVoiceType, Record<string, string>> = {

  COACH: {

    MILD_MISSED: '今日路径已静默重排，斜率微调完成。你休息，机甲值守。',

    NEED_ENCOURAGE: '精力触底不等于失败。明日任务已砍至超迷你模式——动一小步，路径就还在。',

    SHOCK_THERAPY: '负荷偏高，已启动降落伞模式。目标未删除，只是拆成今天能走的一格。',

    ON_TRACK: '配速稳定。继续走你的节奏。',

    NIGHT_PATROL: '深夜巡逻完成。未完成任务已平摊，明天醒来仍是新路径。',

  },

  BUDDY: {

    MILD_MISSED: '今天辛苦啦～任务已悄悄平摊到后面，明天我们一起踩一小格就好。',

    NEED_ENCOURAGE: '有点吃力没关系。明天只读两页、只写五分钟，就算赢。',

    SHOCK_THERAPY: '目标有点重了，我帮你拆掉多余节点。不是放弃，是换一条能走的近路。',

    ON_TRACK: '今天也踩实了一格，很棒～',

    NIGHT_PATROL: '路径已调好。好好睡一觉，明天继续～',

  },

  MENTOR: {

    MILD_MISSED: '沉默是呼吸，不是失败。路径已微调，明日再续。',

    NEED_ENCOURAGE: '也许不是你不适合，而是坡度需要更平。明天只做一件小事。',

    SHOCK_THERAPY: '长期偏离时，重构的是路径，不是否定你。降落伞已展开。',

    ON_TRACK: '你在走自己的路。很好。',

    NIGHT_PATROL: '不必责备自己。明天的路已留好，休息也是修行。',

  },

};



export function getVoice(personaType: string, context: string, driveForce?: string): string {

  const voices = PERSONA_VOICES[personaType as PersonaVoiceType] ?? PERSONA_VOICES.BUDDY;

  const base = voices[context] ?? voices.MILD_MISSED;

  if (context === 'SHOCK_THERAPY' && driveForce) {

    return `${base} 你曾写下：「${driveForce.slice(0, 50)}」—— 路还在，只是换了坡度。`;

  }

  return base;

}



export const PERSONA_DISPLAY: Record<PersonaVoiceType, string> = {

  COACH: '路径机甲',

  BUDDY: '随行外挂',

  MENTOR: '进化向导',

};

