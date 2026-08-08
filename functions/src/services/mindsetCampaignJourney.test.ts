import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_MINDSET_CAMPAIGN_JOURNEY,
  mindsetCampaignFollowUpDelayMs,
  normalizeMindsetCampaignJourney,
  validateMindsetCampaignJourney,
} from './mindsetCampaignJourney';

test('normalizes legacy campaigns to the complete default journey', () => {
  assert.deepEqual(
    normalizeMindsetCampaignJourney(undefined),
    DEFAULT_MINDSET_CAMPAIGN_JOURNEY
  );
  assert.equal(
    DEFAULT_MINDSET_CAMPAIGN_JOURNEY.followUps.useCheck.message,
    'hi, just curious what you think of the app so far if you’ve had a chance to try it yet'
  );
});

test('preserves editable message, link, and follow-up settings', () => {
  const journey = normalizeMindsetCampaignJourney({
    openingMessage: 'Want the app link?',
    openingButtonText: 'Send it',
    linkMessage: 'Here you go:',
    linkButtonText: 'Open app',
    destinationUrl: 'https://athletemindset.app/app?source=reel',
    followUps: {
      noClick: { enabled: false, delayMinutes: 8, message: 'Still interested?' },
    },
  });

  assert.equal(journey.openingMessage, 'Want the app link?');
  assert.equal(journey.linkButtonText, 'Open app');
  assert.equal(journey.followUps.noClick.enabled, false);
  assert.equal(journey.followUps.noClick.delayMinutes, 8);
  assert.equal(journey.followUps.downloadCheck.message, DEFAULT_MINDSET_CAMPAIGN_JOURNEY.followUps.downloadCheck.message);
});

test('validates Instagram limits, secure links, timing, and copy style', () => {
  assert.deepEqual(validateMindsetCampaignJourney(DEFAULT_MINDSET_CAMPAIGN_JOURNEY), []);

  const errors = validateMindsetCampaignJourney({
    ...DEFAULT_MINDSET_CAMPAIGN_JOURNEY,
    openingButtonText: 'This button label is much too long',
    destinationUrl: 'http://athletemindset.app/app',
    followUps: {
      ...DEFAULT_MINDSET_CAMPAIGN_JOURNEY.followUps,
      noClick: { enabled: true, delayMinutes: 1, message: 'Hi — checking in' },
    },
  });

  assert.ok(errors.some((error) => error.includes('Opening DM button')));
  assert.ok(errors.some((error) => error.includes('HTTPS')));
  assert.ok(errors.some((error) => error.includes('timing')));
  assert.ok(errors.some((error) => error.includes('em dashes')));
});

test('disabled follow-ups do not require timing or message validation', () => {
  const errors = validateMindsetCampaignJourney({
    ...DEFAULT_MINDSET_CAMPAIGN_JOURNEY,
    followUps: {
      ...DEFAULT_MINDSET_CAMPAIGN_JOURNEY.followUps,
      feedbackCheck: { enabled: false, delayMinutes: 0, message: '' },
    },
  });
  assert.deepEqual(errors, []);
});

test('converts bounded follow-up timing to milliseconds', () => {
  assert.equal(mindsetCampaignFollowUpDelayMs({ enabled: true, delayMinutes: 15, message: 'Hi' }), 900000);
  assert.equal(mindsetCampaignFollowUpDelayMs({ enabled: true, delayMinutes: 1, message: 'Hi' }), 120000);
  assert.equal(mindsetCampaignFollowUpDelayMs({ enabled: true, delayMinutes: 2000, message: 'Hi' }), 79200000);
});
