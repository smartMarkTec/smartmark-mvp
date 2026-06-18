// server/routes/twilio.js
'use strict';

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../db');

// Per-slug call-routing configs — keeps forwarding numbers off the frontend
const CALL_CONFIGS = {
  'aspen-ac': {
    landingPageSlug: 'aspen-ac',
    businessName: 'Aspen Air Conditioning & Heating',
    twilioNumber: '+13466411064',
    forwardingNumber: '+17138822767',
  },
};

/* ─────────────────────────────────────────────────────────────────────────
   POST /api/twilio/voice/:slug
   Twilio voice webhook — returns TwiML that forwards to the client's real number.
   Logs the inbound call to LowDB.
───────────────────────────────────────────────────────────────────────── */
router.post('/twilio/voice/:slug', async (req, res) => {
  const config = CALL_CONFIGS[req.params.slug];
  if (!config) {
    return res.status(404).type('text/xml').send(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Say>This number is not in service.</Say></Response>'
    );
  }

  const { CallSid, From, To, CallStatus, Direction } = req.body || {};

  // Log inbound call
  try {
    await db.read();
    if (!Array.isArray(db.data.call_tracking_events)) db.data.call_tracking_events = [];
    db.data.call_tracking_events.push({
      id: crypto.randomUUID(),
      landingPageSlug: config.landingPageSlug,
      businessName: config.businessName,
      twilioNumber: config.twilioNumber,
      forwardingNumber: config.forwardingNumber,
      from: From || null,
      to: To || null,
      callSid: CallSid || null,
      callStatus: CallStatus || null,
      direction: Direction || null,
      createdAt: new Date().toISOString(),
      rawTwilioPayload: req.body,
    });
    await db.write();
  } catch (err) {
    console.error('[twilio/voice] db write error:', err.message);
  }

  const backendUrl = process.env.BACKEND_URL || 'https://smartmark-mvp.onrender.com';
  const statusCallbackUrl = `${backendUrl}/api/twilio/status/${req.params.slug}`;
  const recordingEnabled = process.env.ENABLE_ASPEN_CALL_RECORDING === 'true';

  const sayNotice = recordingEnabled
    ? '  <Say>This call may be recorded for quality and tracking.</Say>\n'
    : '';

  const recordingAttrs = recordingEnabled
    ? `record="record-from-answer-dual"
    recordingStatusCallback="${backendUrl}/api/twilio/recording/${req.params.slug}"
    recordingStatusCallbackMethod="POST"`
    : '';

  res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
${sayNotice}  <Dial callerId="${config.twilioNumber}" ${recordingAttrs}>
    <Number
      statusCallback="${statusCallbackUrl}"
      statusCallbackEvent="initiated ringing answered completed"
      statusCallbackMethod="POST"
    >${config.forwardingNumber}</Number>
  </Dial>
</Response>`);
});

/* ─────────────────────────────────────────────────────────────────────────
   POST /api/twilio/status/:slug
   Twilio status callback — logs ringing / answered / completed / duration.
───────────────────────────────────────────────────────────────────────── */
router.post('/twilio/status/:slug', async (req, res) => {
  const { CallSid, CallStatus, CallDuration, Timestamp } = req.body || {};

  try {
    await db.read();
    if (!Array.isArray(db.data.call_tracking_events)) db.data.call_tracking_events = [];

    const existing = db.data.call_tracking_events.find(e => e.callSid === CallSid);
    if (existing) {
      if (!Array.isArray(existing.statusUpdates)) existing.statusUpdates = [];
      existing.statusUpdates.push({
        callStatus: CallStatus || null,
        duration: CallDuration != null ? Number(CallDuration) : null,
        timestamp: Timestamp || new Date().toISOString(),
      });
      if (CallStatus === 'completed') {
        if (CallDuration != null) existing.duration = Number(CallDuration);
        existing.completedAt = new Date().toISOString();
      }
    } else {
      // Status arrived before (or without) the initial voice webhook — store as standalone
      db.data.call_tracking_events.push({
        id: crypto.randomUUID(),
        landingPageSlug: req.params.slug,
        callSid: CallSid || null,
        callStatus: CallStatus || null,
        duration: CallDuration != null ? Number(CallDuration) : null,
        createdAt: new Date().toISOString(),
        rawTwilioPayload: req.body,
      });
    }
    await db.write();
  } catch (err) {
    console.error('[twilio/status] db write error:', err.message);
  }

  res.status(204).end();
});

/* ─────────────────────────────────────────────────────────────────────────
   POST /api/twilio/recording/:slug
   Twilio recording status callback — saves RecordingSid, URL, duration, etc.
   Attaches to the matching call_tracking_events record by CallSid if found;
   otherwise writes an orphan entry into call_recordings.
───────────────────────────────────────────────────────────────────────── */
router.post('/twilio/recording/:slug', async (req, res) => {
  const {
    CallSid,
    RecordingSid,
    RecordingUrl,
    RecordingStatus,
    RecordingDuration,
    RecordingChannels,
  } = req.body || {};

  const recordingData = {
    callSid: CallSid || null,
    recordingSid: RecordingSid || null,
    recordingUrl: RecordingUrl || null,
    recordingStatus: RecordingStatus || null,
    recordingDuration: RecordingDuration != null ? Number(RecordingDuration) : null,
    recordingChannels: RecordingChannels != null ? Number(RecordingChannels) : null,
    landingPageSlug: req.params.slug,
  };

  try {
    await db.read();

    if (!Array.isArray(db.data.call_tracking_events)) db.data.call_tracking_events = [];
    if (!Array.isArray(db.data.call_recordings)) db.data.call_recordings = [];

    const existing = db.data.call_tracking_events.find(e => e.callSid === CallSid);
    if (existing) {
      existing.recordingSid = recordingData.recordingSid;
      existing.recordingUrl = recordingData.recordingUrl;
      existing.recordingStatus = recordingData.recordingStatus;
      existing.recordingDuration = recordingData.recordingDuration;
      existing.recordingChannels = recordingData.recordingChannels;
      existing.recordingUpdatedAt = new Date().toISOString();
    } else {
      db.data.call_recordings.push({
        id: crypto.randomUUID(),
        ...recordingData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    await db.write();
  } catch (err) {
    console.error('[twilio/recording] db write error:', err.message);
  }

  res.status(204).end();
});

module.exports = router;
module.exports.CALL_CONFIGS = CALL_CONFIGS;
