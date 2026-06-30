import {
  DecisionCandidate,
  DiscussionType,
  Inconsistency,
  Issue,
  RoomAgentSpec,
} from './orchestrator.types';
import { SIGNAL_TURN_TOOL } from './control-tool';
import {
  DECISION_CONTRACT,
  MODERATOR,
  Prompt,
  renderDecisionCandidate,
  renderIssues,
  renderInconsistencies,
  roster,
  TYPE_GUIDE,
} from './prompt-render';

export { MODERATOR, DECISION_CONTRACT, toMessages, renderIssues, renderInconsistencies } from './prompt-render';
export type { Prompt } from './prompt-render';

export const prompts = {
  validateTopic(topic: string): Prompt {
    return {
      system: `As the moderator, judge whether the given topic is a real agenda worth a multi-expert discussion. Meaningless strings, random keyboard mashing, simple greetings, and pointless test inputs are not valid discussion topics. Output a JSON object only: {"valid": boolean, "reason": string}`,
      user: `Topic: ${topic}\n\nIs this topic worth discussing? Answer with JSON only.`,
    };
  },

  rejectTopic(topic: string): Prompt {
    return {
      system: `As the moderator, inform the user that the topic they entered is too unclear or empty to start a discussion. Respond in Korean.`,
      user: `The user entered "${topic}". The discussion cannot start, so politely ask them in 1-2 sentences to re-enter, in concrete terms, the agenda they want to discuss. Respond in Korean.`,
    };
  },

  pickSpeaker(
    topic: string,
    agents: RoomAgentSpec[],
    history: string,
    lastDone: boolean,
    openIssues = '',
    options: string[] = [],
    decisionCandidate: DecisionCandidate | null = null,
    convergencePressure = '',
  ): Prompt {
    const issuesSection = openIssues ? `\n\nCurrently open issues:\n${openIssues}` : '';
    const optionsSection = options.length
      ? `\n\nKey options for this agenda:\n${options.map((o) => `- ${o}`).join('\n')}`
      : '';
    const optionsRule = options.length
      ? ' Before judging to end (done=true), confirm that each key option above has been seriously advocated at least once. If any option has not yet been defended by anyone, do not end; instead nominate a participant to defend that position and write "Unexamined option: <option>" in reason.'
      : '';
    const candidateSection = `\n\nCurrent recommendation candidate:\n${renderDecisionCandidate(decisionCandidate)}`;
    const pressureRule = convergencePressure ? ` ${convergencePressure}` : '';
    return {
      system: `As the moderator, pick the single next speaker of the discussion, or judge whether to end it. Use each participant's role (description) to nominate an expert who can make a new contribution to the currently open issues. Prefer a participant whose distinct role lens has not yet evaluated the agenda or the key options, so the discussion gathers genuinely different perspectives rather than the same angle restated. Not every participant needs to speak. If the same role repeats the same issue, give the floor to a participant who can add a different perspective. Continue the discussion only while unresolved issues that directly contribute to the original agenda (the required output contract) remain. If every remaining open issue is out_of_scope, or post-consensus remarks only spill into new side topics (follow-up implementation such as UI, logging, notifications) rather than the original agenda, end with done=true. If the recommendation candidate is already a definitive statement (not hedging such as "검토하되/고려한다/논의가 필요하다") with conditions and verification filled in, and every remaining open issue is out_of_scope or a side topic, end with done=true even if minor side issues are still open.${optionsRule}${pressureRule} Output a JSON object only: {"next": "<agentId>" | null, "done": boolean, "reason": string}. When done is true, set next to null.`,
      user: `Topic: ${topic}\n\nParticipants:\n${roster(agents)}${optionsSection}${issuesSection}${candidateSection}\n\nDiscussion so far:\n${history || '(no remarks yet)'}\n\nThe previous speaker ${lastDone ? 'judged' : 'did not consider'} that the discussion may wrap up.\n\nDecide the next speaker or whether to end, answering with JSON only.`,
    };
  },

  updateIssues(
    topic: string,
    existingIssues: Issue[],
    decisionCandidate: DecisionCandidate | null,
    speakerName: string,
    speakerRole: string | undefined,
    latestUtterance: string,
    existingInconsistencies: Inconsistency[] = [],
  ): Prompt {
    return {
      system: `As the moderator, update the discussion's issue ledger. Analyze the most recent remark and do the following:\n- Extract claims, risks, and proposals from the remark.\n- If a point is semantically the same as an existing issue, do not create a new issue; merge it into that issue and count it as repeatClaims. If it is semantically new, count it as newClaims and add a new issue or reinforce an existing one.\n- A remark counts as newClaims only when it adds a genuinely new argument, constraint, counterexample, or trade-off that moves the issue forward. Restating an already-recorded claim counts as repeatClaims even if it is dressed up with fresh illustrative examples, cases, or numbers (e.g. "ES handles millions of docs", "100k is fine but 1M degrades"): an example or a bigger/smaller number attached to a point already made is repeatClaims, not newClaims.
- If the remark is semantically the same position as this same speaker's own earlier remark, count it as repeatClaims regardless of rewording.\n- If the remark is not a direct decision on this agenda but spills into follow-up implementation, side features, or extension topics (e.g. UI details, logging approach, notification scheme), classify that issue with out_of_scope status.\n- Keep issue ids as short English slugs (e.g. "perf", "compat", "jump") and stable. Once created, never change an id.\n- If the remark contains numbers, re-compute units, multiplications, and totals step by step to verify them. If you find a calculation error or a number that contradicts an earlier remark, record it in inconsistencies as {id, description, kind:"arithmetic|unit|contradiction", turn} and set the related issue status to needs_verification. If the most recent remark corrected an existing inconsistency, re-report the same id with resolved:true.\n- Incrementally update decisionCandidate (recommendation/conditions/risks/verification) with the content so far. If it is too early to state a recommendation, use null.\nDo not invent content not present in the source. Output a JSON object only: {"issues":[{"id","title","status":"open|decidable|needs_verification|out_of_scope","claims":[],"risks":[],"proposals":[],"ownerRole"}], "newClaims": <number>, "repeatClaims": <number>, "decisionCandidate": {"recommendation","conditions":[],"risks":[],"verification":[]} | null, "inconsistencies":[{"id","description","kind","turn","resolved"}]}. Include in issues only the issues newly created or changed this turn, and in inconsistencies only those newly found or resolved this turn. Keep the extracted text (titles, claims, risks, proposals) in its original language.`,
      user: `Topic: ${topic}\n\nExisting issues:\n${renderIssues(existingIssues)}\n\nUnresolved numeric inconsistencies:\n${renderInconsistencies(existingInconsistencies)}\n\nCurrent recommendation candidate:\n${renderDecisionCandidate(decisionCandidate)}\n\nMost recent remark — ${speakerName}${speakerRole ? `(${speakerRole})` : ''}:\n${latestUtterance}\n\nOutput the update result as JSON only.`,
    };
  },

  draftDecision(
    topic: string,
    issues: Issue[],
    outputContract: string[],
    decisionCandidate: DecisionCandidate | null,
  ): Prompt {
    return {
      system: `As the moderator, organize the open issues into a resolution stage. Classify each issue by status: decidable (can be decided now), needs_verification (verification or measurement must come first), out_of_scope (not this agenda's direct responsibility; a separate task). Do not attach a new feature to every risk — sort each risk into one of: required mitigation, follow-up task, or excluded from this scope. For issues where only numbers/amounts were exchanged without agreement, organize them into a range (min–max) and a recommended baseline value. Then finalize a decisionCandidate that fills every item of the outputContract. Write the recommendation as a definitive decision statement in Korean (e.g. "~한다/도입한다/채택한다/보류한다"). Do not end with hedging such as "검토하되/고려한다/논의가 필요하다". If it is conditional, separate the decision from its premise, e.g. "~를 전제로 도입한다". Write all recommendation/conditions/risks/verification text in Korean. Set isCommitted to true only when the recommendation is a definitive, actionable decision statement — not when it hedges or defers judgment. Output a JSON object only: {"issues":[{"id","title","status","claims":[],"risks":[],"proposals":[]}], "decisionCandidate":{"recommendation","conditions":[],"risks":[],"verification":[],"isCommitted":boolean}}`,
      user: `Topic: ${topic}\n\nRequired conclusion items (outputContract): ${JSON.stringify(outputContract)}\n\nCurrent issues:\n${renderIssues(issues)}\n\nCurrent recommendation candidate:\n${renderDecisionCandidate(decisionCandidate)}\n\nOutput the issue classification and finalized recommendation as JSON only.`,
    };
  },

  writeResult(
    topic: string,
    discussionType: DiscussionType,
    outputContract: string[],
    issues: Issue[],
    decisionCandidate: DecisionCandidate | null,
    history: string,
  ): Prompt {
    const sections =
      discussionType === 'decision'
        ? '## 결정\n## 채택 조건\n## 호환·이행\n## 리스크 분류\n## 검증 항목'
        : outputContract.map((item) => `## ${item}`).join('\n');
    return {
      system: `As the moderator, synthesize the discussion into an actionable conclusion. Organize it strictly into the markdown sections below.\n${sections}\nWrite each section as bullets (- ). In the '결정' (Decision) section, write what to do as a definitive decision statement in Korean ("~한다/도입한다/채택한다/보류한다"). Do not end with "검토하되/고려한다". Mark each item in the risk-classification section as one of: required mitigation, follow-up task, or excluded from this scope. Reflect only what actually came up in the discussion and the finalized recommendation below. Do not write speculation. Write all content in Korean; keep the section headers exactly as given.`,
      user: `Topic: ${topic}\n\nFinalized recommendation:\n${renderDecisionCandidate(decisionCandidate)}\n\nIssue summary:\n${renderIssues(issues)}\n\nFull discussion:\n${history}`,
    };
  },

  defineAgenda(topic: string, agents: RoomAgentSpec[]): Prompt {
    const guide = Object.entries(TYPE_GUIDE)
      .map(([type, desc]) => `- ${type}: ${desc}`)
      .join('\n');
    return {
      system: `As the moderator, classify the discussion topic and define the items that must be included in the final conclusion (outputContract). discussionType kinds:\n${guide}\nIf discussionType is decision, the outputContract must be exactly ${JSON.stringify(DECISION_CONTRACT)}. For other types, define 2-4 items that the conclusion of that agenda genuinely requires. Also, if the topic asks a binary/opposing choice such as "A vs B" or has clearly distinct alternatives, put those key options (2-4) in options. For a single or divergent topic, leave options as an empty array. Write the outputContract items in Korean. Output a JSON object only: {"discussionType": "<type>", "outputContract": ["..."], "options": ["..."]}`,
      user: `Topic: ${topic}\n\nParticipants:\n${roster(agents)}\n\nAnswer this topic's type, required conclusion items, and key options as JSON only.`,
    };
  },

  agent(
    topic: string,
    agent: RoomAgentSpec,
    agents: RoomAgentSpec[],
    history: string,
    openIssues = '',
    openInconsistencies = '',
    decisionCandidate: DecisionCandidate | null = null,
    convergencePressure = '',
  ): Prompt {
    const others = agents.filter((a) => a.id !== agent.id);
    const issuesSection = openIssues
      ? `\n\nIssues and claims already raised (do not duplicate):\n${openIssues}\nDo not restate the claims above in the same words. Make only a new claim, counterexample, resolution, or a remark that narrows an open issue. If you have no new point to add, set done to true when calling the ${SIGNAL_TURN_TOOL} tool.`
      : '';
    const inconsistencySection = openInconsistencies
      ? `\n\nUnresolved numeric inconsistencies (resolve first):\n${openInconsistencies}\nBefore making a new claim, speak to correct the numeric errors or inconsistencies above first.`
      : '';
    const candidateSection = decisionCandidate
      ? `\n\nRecommendation candidate formed so far:\n${renderDecisionCandidate(decisionCandidate)}\nIf you essentially agree with this candidate and have no new claim, counterexample, or risk to add, set done to true when calling the ${SIGNAL_TURN_TOOL} tool instead of forcing another remark.`
      : '';
    const pressureSection = convergencePressure ? `\n\n${convergencePressure}` : '';
    return {
      system: `${agent.instructions}\n\nYou participate in a multi-party discussion in the role of '${agent.name}'. Speak in Korean. Rules:
- Contribute only through the lens of your own role above. Even when the agenda lies outside your specialty, speak to how it affects your role's concerns and evaluation axes (the metrics/criteria your role owns) — never reason as if you were another discipline. If a point is better owned by another participant's role, yield to that participant instead of arguing it yourself. If you have nothing to add from your own role's lens, set done to true rather than echoing another role's argument.
- State your opinion directly, with no greetings or thanks.
- Deliver only one claim per turn. Do not list multiple points.
- Finish in 3-5 sentences.
- Do not use hedging expressions such as '~것 같습니다', '어쩌면', '~할 수도 있습니다', '고려해야 합니다'. State claims definitively.
- Do not repeat background or definitions already mentioned. Get straight to the point.
- Do not blindly agree with the previous remark. Even if you agree, present at least one addition, counterexample, or risk.
- Argue with concrete conditions, cases, and numbers instead of generalities.
- Do not open new side topics that do not directly contribute to the original agenda's conclusion (follow-up implementation such as UI details, logging approach, notification scheme). If only such side topics remain, set done to true instead of raising them.
- Continue the conversation by agreeing with, rebutting, or supplementing previous remarks. You may directly name a participant's claim to rebut or question it.
- When you need evidence, use the rag_search tool to look up reference knowledge.${issuesSection}${inconsistencySection}${candidateSection}${pressureSection}
- After finishing your remark, call the ${SIGNAL_TURN_TOOL} tool exactly once as your final action: set done (true if you consider this agenda sufficiently discussed, otherwise false), yieldTo (the id of the participant you want to hear from next, or null to leave it open), and passReason (a short phrase on why that participant should speak next when yieldTo is set, otherwise null).`,
      user: `Topic: ${topic}\n\nOther participants:\n${roster(others) || '(none)'}\n\nDiscussion so far:\n${history || '(no remarks yet)'}\n\nRemark of '${agent.name}':`,
    };
  },

  summarizeHistory(topic: string, previousSummary: string, newTranscript: string, maxChars: number): Prompt {
    return {
      system: `As the moderator, update the internal memory of the ongoing discussion. Merge the previous summary and the new remarks, preserving only the key claims, points of agreement, remaining issues, and each participant's position. Do not add facts not present in the source, and write in Korean within ${maxChars} characters.`,
      user: `Topic: ${topic}\n\nExisting memory:\n${previousSummary || '(none)'}\n\nNew remarks to compress:\n${newTranscript}\n\nOutput the updated discussion memory only.`,
    };
  },
};
