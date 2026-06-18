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

  res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${config.twilioNumber}">
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

module.exports = router;
module.exports.CALL_CONFIGS = CALL_CONFIGS;
