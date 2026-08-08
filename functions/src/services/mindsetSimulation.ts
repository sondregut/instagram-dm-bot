import {
  buildMindsetActionPlan,
  MindsetButton,
  MindsetQuickReply,
  MindsetStage,
} from './mindsetConversationEngine';
import {
  buildMindsetAISystemPrompt,
  classifyMindsetReplyForStage,
  constrainMindsetAIReply,
  mindsetAIControlAction,
  requiresMindsetHumanHandoff,
  shouldUseMindsetAIForReplyIntent,
  shouldSuppressMindsetAutomatedReply,
} from './mindsetFlowLogic';

export interface MindsetSimulationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface MindsetSimulationResult {
  reply: string;
  nextStage: MindsetStage;
  quickReplies: MindsetQuickReply[];
  buttons: MindsetButton[];
  createsHandoff: boolean;
}

export type MindsetSimulationAIGenerator = (
  systemPrompt: string,
  history: MindsetSimulationMessage[],
  userMessage: string
) => Promise<{ text: string; usedAI: boolean }>;

export async function simulateMindsetTurn(
  stage: MindsetStage,
  message: string,
  activationUrl: string,
  history: MindsetSimulationMessage[] = [],
  generateAI?: MindsetSimulationAIGenerator,
  quickReplyPayload?: string
): Promise<MindsetSimulationResult> {
  const userMessage = message.trim();
  if (!userMessage) throw new Error('A test message is required');

  const quickReplyAction = quickReplyPayload?.startsWith('mindset:')
    ? quickReplyPayload.split(':')[1]
    : null;
  const classifiedAction = requiresMindsetHumanHandoff(userMessage)
    ? 'human'
    : classifyMindsetReplyForStage(userMessage, stage);
  const action = quickReplyAction || classifiedAction;
  if (quickReplyAction || !shouldUseMindsetAIForReplyIntent(classifiedAction)) {
    const plan = buildMindsetActionPlan(action, stage, activationUrl);
    if (plan) {
      return {
        reply: plan.message,
        nextStage: plan.nextStage,
        quickReplies: plan.quickReplies || [],
        buttons: plan.buttons || [],
        createsHandoff: plan.createsHandoff === true,
      };
    }
  }

  const aiResult = generateAI
    ? await generateAI(
      buildMindsetAISystemPrompt(stage),
      [...history.slice(-8), { role: 'user', content: userMessage }],
      userMessage
    )
    : { text: '', usedAI: false };
  const aiRequestedHandoff = aiResult.usedAI
    && mindsetAIControlAction(aiResult.text) === 'handoff';
  const reply = constrainMindsetAIReply(aiResult.text);
  const createsHandoff = !aiResult.usedAI
    || aiRequestedHandoff
    || shouldSuppressMindsetAutomatedReply(reply);

  return {
    reply: createsHandoff ? '' : reply,
    nextStage: createsHandoff ? 'human_handoff' : 'ai_follow_up',
    quickReplies: [],
    buttons: [],
    createsHandoff,
  };
}
