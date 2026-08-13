import {
  buildMindsetActionPlan,
  MindsetButton,
  MindsetQuickReply,
  MindsetStage,
} from './mindsetConversationEngine';
import {
  buildMindsetAISystemPrompt,
  buildMindsetScopeClassifierPrompt,
  classifyMindsetReplyForStage,
  constrainMindsetAIReply,
  mindsetAIControlAction,
  parseMindsetScopeDecision,
  precheckMindsetAutomationScope,
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
  additionalReplies: string[];
  nextStage: MindsetStage;
  quickReplies: MindsetQuickReply[];
  buttons: MindsetButton[];
  createsHandoff: boolean;
  handoffReason?: string;
}

export type MindsetSimulationAIGenerator = (
  systemPrompt: string,
  history: MindsetSimulationMessage[],
  userMessage: string
) => Promise<{ text: string; usedAI: boolean }>;

export interface MindsetSimulationOptions {
  conversationIsRecent?: boolean;
  classifyScope?: MindsetSimulationAIGenerator;
}

const CLOSED_SIMULATION_STAGES = new Set<MindsetStage>([
  'trial_claimed',
  'subscription_claimed',
  'trial_started',
  'subscribed',
  'completed',
  'human_handoff',
]);

export async function simulateMindsetTurn(
  stage: MindsetStage,
  message: string,
  activationUrl: string,
  history: MindsetSimulationMessage[] = [],
  generateAI?: MindsetSimulationAIGenerator,
  quickReplyPayload?: string,
  options: MindsetSimulationOptions = {}
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
  const mayContinueAfterClosedFunnel = [
    'app_link_request',
    'trial_started',
    'subscribed',
    'human',
  ].includes(action);
  if (stage === 'human_handoff'
      || (CLOSED_SIMULATION_STAGES.has(stage) && !mayContinueAfterClosedFunnel)) {
    return {
      reply: '',
      additionalReplies: [],
      nextStage: stage,
      quickReplies: [],
      buttons: [],
      createsHandoff: false,
    };
  }
  if (quickReplyAction) {
    const plan = buildMindsetActionPlan(action, stage, activationUrl);
    if (plan) {
      return {
        reply: plan.message,
        additionalReplies: plan.additionalMessages || [],
        nextStage: plan.nextStage,
        quickReplies: plan.quickReplies || [],
        buttons: plan.buttons || [],
        createsHandoff: plan.createsHandoff === true,
      };
    }
  }

  const conversationIsRecent = options.conversationIsRecent !== false;
  const scopePrecheck = precheckMindsetAutomationScope(
    classifiedAction,
    userMessage,
    stage,
    conversationIsRecent
  );
  let scopeDecision = scopePrecheck;
  let scopeClassifierUsedAI = true;
  if (scopePrecheck === 'classify') {
    const classifier = options.classifyScope || generateAI;
    const previousAssistantMessage = [...history]
      .reverse()
      .find((entry) => entry.role === 'assistant')?.content;
    const scopeResult = classifier
      ? await classifier(
        buildMindsetScopeClassifierPrompt(
          stage,
          previousAssistantMessage,
          conversationIsRecent
        ),
        [{ role: 'user', content: userMessage }],
        userMessage
      )
      : { text: '', usedAI: false };
    scopeClassifierUsedAI = scopeResult.usedAI;
    scopeDecision = scopeResult.usedAI
      ? parseMindsetScopeDecision(scopeResult.text)
      : 'uncertain';
  }
  if (scopeDecision !== 'in_scope') {
    const handoffReason = !scopeClassifierUsedAI
      ? 'scope_classifier_unavailable'
      : scopeDecision === 'off_topic'
        ? 'off_topic'
        : scopeDecision === 'human_required'
          ? 'scope_human_required'
          : 'scope_uncertain';
    return {
      reply: '',
      additionalReplies: [],
      nextStage: 'human_handoff',
      quickReplies: [],
      buttons: [],
      createsHandoff: true,
      handoffReason,
    };
  }

  if (!shouldUseMindsetAIForReplyIntent(classifiedAction)) {
    const plan = buildMindsetActionPlan(action, stage, activationUrl);
    if (plan) {
      return {
        reply: plan.message,
        additionalReplies: plan.additionalMessages || [],
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
  const aiRequestedAppLink = aiResult.usedAI
    && mindsetAIControlAction(aiResult.text) === 'send_app_link';
  if (aiRequestedAppLink) {
    const plan = buildMindsetActionPlan('app_link_request', stage, activationUrl);
    if (!plan) throw new Error('App-link action is unavailable');
    return {
      reply: plan.message,
      additionalReplies: plan.additionalMessages || [],
      nextStage: plan.nextStage,
      quickReplies: plan.quickReplies || [],
      buttons: plan.buttons || [],
      createsHandoff: false,
    };
  }
  const reply = constrainMindsetAIReply(aiResult.text);
  const createsHandoff = !aiResult.usedAI
    || aiRequestedHandoff
    || shouldSuppressMindsetAutomatedReply(reply);

  return {
    reply: createsHandoff ? '' : reply,
    additionalReplies: [],
    nextStage: createsHandoff ? 'human_handoff' : 'ai_follow_up',
    quickReplies: [],
    buttons: [],
    createsHandoff,
    handoffReason: createsHandoff
      ? aiRequestedHandoff
        ? 'ai_sensitive_handoff'
        : !aiResult.usedAI
          ? 'ai_provider_unavailable'
          : 'automated_reply_suppressed'
      : undefined,
  };
}
