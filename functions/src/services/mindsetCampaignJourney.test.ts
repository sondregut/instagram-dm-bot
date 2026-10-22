import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_MINDSET_CAMPAIGN_JOURNEY,
  DEFAULT_VAULT_CAMPAIGN_JOURNEY,
  mindsetCampaignFollowUpDelayMs,
  normalizeMindsetCampaignJourney,
  VAULT_RESOURCE_FOLLOW_UP_MESSAGE,
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
  assert.equal(
    DEFAULT_MINDSET_CAMPAIGN_JOURNEY.followUps.noClick.message,
    'hi, just curious what you think of the app so far if you’ve had a chance to try it yet'
  );
  assert.equal(DEFAULT_MINDSET_CAMPAIGN_JOURNEY.followUps.noClick.delayMinutes, 8 * 60);
  assert.equal(DEFAULT_MINDSET_CAMPAIGN_JOURNEY.followUps.useCheck.delayMinutes, 8 * 60);
  assert.equal(DEFAULT_MINDSET_CAMPAIGN_JOURNEY.followUps.resourceOffer.enabled, false);
  assert.equal(DEFAULT_MINDSET_CAMPAIGN_JOURNEY.followUps.resourceOffer.message, '');
  assert.equal(
    DEFAULT_MINDSET_CAMPAIGN_JOURNEY.linkMessage,
    'here you go! hope you like it'
  );
  assert.match(DEFAULT_MINDSET_CAMPAIGN_JOURNEY.openingMessage, /reply link/i);
  assert.equal(
    normalizeMindsetCampaignJourney({
      openingMessage: 'Click below to get the link to download Athlete Mindset!\n\nAppreciate you,\nSondre',
    }).openingMessage,
    DEFAULT_MINDSET_CAMPAIGN_JOURNEY.openingMessage
  );
  assert.equal(
    normalizeMindsetCampaignJourney({ linkMessage: 'Download Athlete Mindset here:' }).linkMessage,
    'here you go! hope you like it'
  );
  assert.equal(
    normalizeMindsetCampaignJourney({
      followUps: {
        noClick: {
          enabled: true,
          delayMinutes: 30,
          message: 'Hey! Did you get a chance to check out Athlete Mindset yet? Would love to hear what you think.',
        },
      },
    }).followUps.noClick.message,
    'hi, just curious what you think of the app so far if you’ve had a chance to try it yet'
  );
});

test('provides an isolated Vault journey with the exact requested handoff link', () => {
  const journey = normalizeMindsetCampaignJourney(undefined, 'vault_tracker_download');
  assert.deepEqual(journey, DEFAULT_VAULT_CAMPAIGN_JOURNEY);
  assert.equal(journey.destinationUrl, 'https://stavhopp.no/get?src=instagram');
  assert.match(journey.openingMessage, /download Vault/i);
  assert.match(journey.openingMessage, /reply link/i);
  assert.doesNotMatch(JSON.stringify(journey), /Athlete Mindset|mental rep/i);
  assert.equal(journey.followUps.noClick.delayMinutes, 8 * 60);
  assert.equal(journey.followUps.useCheck.delayMinutes, 8 * 60);
  assert.equal(journey.followUps.resourceOffer.enabled, true);
  assert.equal(journey.followUps.resourceOffer.delayMinutes, 8 * 60);
  assert.equal(journey.followUps.resourceOffer.message, VAULT_RESOURCE_FOLLOW_UP_MESSAGE);
  assert.match(journey.followUps.resourceOffer.message, /stavhopp\.no\/coaching/);
  assert.match(journey.followUps.resourceOffer.message, /stavhopp\.no\/shop/);
  assert.match(journey.followUps.resourceOffer.message, /athletemindset\.app\/app/);
  assert.doesNotMatch(journey.followUps.resourceOffer.message, /—|\?$/);
  assert.deepEqual(
    validateMindsetCampaignJourney(journey, 'vault_tracker_download'),
    []
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
  assert.equal(journey.destinationUrl, 'https://apps.apple.com/app/id6757452747');
  assert.equal(journey.followUps.noClick.enabled, false);
  assert.equal(journey.followUps.noClick.delayMinutes, 8);
  assert.equal(journey.followUps.downloadCheck.message, DEFAULT_MINDSET_CAMPAIGN_JOURNEY.followUps.downloadCheck.message);
});

test('migrates an existing Athlete Mindset website destination to the App Store', () => {
  assert.equal(
    normalizeMindsetCampaignJourney({ destinationUrl: 'https://www.athletemindset.app/app?source=reel' }).destinationUrl,
    'https://apps.apple.com/app/id6757452747'
  );
  assert.equal(
    normalizeMindsetCampaignJourney({ destinationUrl: 'https://example.com/custom-app' }).destinationUrl,
    'https://example.com/custom-app'
  );
});

test('TrackSpeed and TrackJump journeys use their own App Store links without follow-ups', () => {
  for (const [template, destination] of [
    ['trackspeed_download', 'https://apps.apple.com/us/app/trackspeed-sprint-timer/id6757509163'],
    ['trackjump_download', 'https://apps.apple.com/us/app/trackjump-jump-height-rsi/id6809517672'],
  ] as const) {
    const journey = normalizeMindsetCampaignJourney({
      followUps: { noClick: { enabled: true, delayMinutes: 30, message: 'Reminder' } },
    }, template);
    assert.equal(journey.destinationUrl, destination);
    assert.match(journey.openingMessage, new RegExp(template === 'trackspeed_download' ? 'TrackSpeed' : 'TrackJump'));
    assert.equal(journey.followUps.noClick.enabled, false);
    assert.deepEqual(validateMindsetCampaignJourney(journey, template), []);
  }
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

test('does not require a reminder button because follow-ups are plain text', () => {
  const errors = validateMindsetCampaignJourney({
    ...DEFAULT_MINDSET_CAMPAIGN_JOURNEY,
    linkButtonText: 'This label would be too long',
    followUps: {
      ...DEFAULT_MINDSET_CAMPAIGN_JOURNEY.followUps,
      noClick: { enabled: true, delayMinutes: 30, message: 'checking in' },
    },
  });
  assert.deepEqual(errors, []);
});

test('converts bounded follow-up timing to milliseconds', () => {
  assert.equal(mindsetCampaignFollowUpDelayMs({ enabled: true, delayMinutes: 15, message: 'Hi' }), 900000);
  assert.equal(mindsetCampaignFollowUpDelayMs({ enabled: true, delayMinutes: 1, message: 'Hi' }), 120000);
  assert.equal(mindsetCampaignFollowUpDelayMs({ enabled: true, delayMinutes: 2000, message: 'Hi' }), 79200000);
});
