import { isDirectAppLinkCommand, normalizeMindsetText, requiresMindsetHumanHandoff } from './mindsetFlowLogic';

export const VERIFIED_APP_LINKS: Record<string, { name: string; id: string; url: string }> = {
  trackjump_download: {name:'TrackJump',id:'6809517672',url:'https://apps.apple.com/us/app/trackjump-jump-height-rsi/id6809517672'},
  trackspeed_download: {name:'TrackSpeed',id:'6757509163',url:'https://apps.apple.com/us/app/trackspeed-sprint-timer/id6757509163'},
  athlete_mindset_download: {name:'Athlete Mindset',id:'6757452747',url:'https://apps.apple.com/app/id6757452747'},
  vault_tracker_download: {name:'Vault',id:'6767121354',url:'https://apps.apple.com/us/app/vault-pole-vault-training/id6767121354'},
};

export function isLinkOptOut(text: string): boolean {
  const s=normalizeMindsetText(text);
  return /\b(?:unsubscribe|stop messaging|stop sending|leave me alone|no thanks|not interested)\b/.test(s)
    || /\b(?:do not|don't|dont|never|stop)\b.{0,30}\b(?:send|share|resend|re-send|message)\b/.test(s)
    || /\b(?:do not|don't|dont|no longer)\s+(?:need|want)\b/.test(s);
}

export function isLinkRecoveryRequest(text: string): boolean {
  const s=normalizeMindsetText(text);
  if (isLinkOptOut(s) || requiresMindsetHumanHandoff(s) || /https?:\/\//.test(s)
    || /\b(?:article|invoice|zoom|meeting|video|reel|website|password|reset|verification|affiliate)\b/.test(s)) return false;
  return /\b(?:did not|didn't|didnt|have not|haven't|havent|never)\s+(?:get|got|receive|received|see|seen)\s+(?:(?:the|a|my|your)\s+)?(?:(?:app|download)\s+)?link\b/.test(s)
    || /\b(?:the |my )?link\s+(?:did not|didn't|didnt|has not|hasn't|hasnt|never)\s+(?:arrive|come through|show up)\b/.test(s)
    || /\b(?:where(?:'s| is)|can't find|cannot find|couldn't find)\s+(?:(?:the|my|your)\s+)?(?:(?:app|download)\s+)?link\b/.test(s)
    || isDirectAppLinkCommand(s)
    || /^(?:(?:i\s+)?(?:didn't|didnt|did not|never)\s+(?:get|receive)\s+it|nothing\s+(?:arrived|came through))[.!?]*$/.test(s)
    || /^(?:the\s+)?(?:app\s+|download\s+)?link(?:\s+(?:again|please))?[.!?]*$/.test(s);
}

export function mentionedAppTemplates(text: string): string[] {
  const s=normalizeMindsetText(text);
  return Object.entries(VERIFIED_APP_LINKS).filter(([,v])=>new RegExp(`\\b${v.name.toLowerCase().replace(/ /g,'\\s*')}\\b`).test(s)).map(([k])=>k);
}

export function isVerifiedCampaignUrl(template: string, destination: unknown): boolean {
  if(typeof destination!=='string' || !VERIFIED_APP_LINKS[template]) return false;
  try {
    const url=new URL(destination);
    return url.protocol==='https:' && url.hostname==='apps.apple.com' && !url.username && !url.password
      && url.pathname.endsWith('/id'+VERIFIED_APP_LINKS[template].id) && !url.search && !url.hash;
  } catch { return false; }
}
