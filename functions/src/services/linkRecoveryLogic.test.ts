import test from 'node:test';
import assert from 'node:assert/strict';
import {isLinkRecoveryRequest,isVerifiedCampaignUrl,VERIFIED_APP_LINKS} from './linkRecoveryLogic';
import {classifyMindsetReply,isMindsetAppLinkRequest} from './mindsetFlowLogic';
test('recognizes bounded missing-link and resend phrases with normalized apostrophes',()=>{
  for(const s of ["I didn't get the link",'I didnt get the link','I didn’t get the link!','I haven’t received a link','I never received the download link',"The link didn't arrive","where's my link?",'WHERE IS THE LINK','send it again please','please resend the link','can you send me the link?','could you resend it again','I did not get it','Link please']) assert.equal(isLinkRecoveryRequest(s),true,s);
});
test('excludes opt-outs, negations, unrelated links and sensitive requests',()=>{
 for(const s of ["Don't send me the link",'dont send the link','I did not get the link but no thanks',"I don't want the link",'I no longer need the link','I got the link','I did not get a reply','I did not get the joke','the link is great','send me the invoice link','resend the password reset link','send me https://evil.example','I need a refund, send the link'])assert.equal(isLinkRecoveryRequest(s),false,s);
 for(const s of ["I don't want the link",'I no longer need the link','No thanks, send the link']){assert.equal(isMindsetAppLinkRequest(s),false);assert.equal(classifyMindsetReply(s),'not_interested');}
});
test('only the verified App Store product ID and HTTPS host are eligible',()=>{
 for(const [template,app] of Object.entries(VERIFIED_APP_LINKS))assert(isVerifiedCampaignUrl(template,app.url));
 for(const url of ['https://evil.example/id6809517672','http://apps.apple.com/app/id6809517672','https://apps.apple.com/app/id6757509163','https://apps.apple.com/app/id6809517672?redirect=evil','https://x@apps.apple.com/app/id6809517672'])assert.equal(isVerifiedCampaignUrl('trackjump_download',url),false);
});

test('normal collaboration sentences cannot become app-link commands or recovery requests',()=>{
 for(const text of [
  'Sure I’ll give it a shot, I’ll let you know how it goes!',
  "I'll give it a try", 'Give it a shot!', 'Can you give it a try?',
  "I'll send it again", 'I can share the app link with friends',
  'They asked me to resend the link', 'We can give the app another shot',
  'When you send me the link I will check the design',
  'I need the link between training and mindset explained',
 ]) {
  assert.equal(isMindsetAppLinkRequest(text),false,text);
  assert.equal(isLinkRecoveryRequest(text),false,text);
  assert.notEqual(classifyMindsetReply(text),'app_link_request',text);
 }
});
test('whole explicit requests keep capitalization, punctuation and polite forms',()=>{
 for(const text of ['SEND ME THE LINK!!!','Could you send me the app link, please?',
  'Hey, can you share the download link?', 'Send my link again please',
  'Give me the link', 'Drop the link please', 'Please resend', 'Send it again',
  'Share that again', 'Where is the download link?', 'I need the link again']) {
  assert.equal(isMindsetAppLinkRequest(text),true,text);
 }
});
