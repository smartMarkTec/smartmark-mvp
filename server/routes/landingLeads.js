// server/routes/landingLeads.js
'use strict';

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const db = require('../db');

/* ─────────────────────────────────────────────────────────────────────────
   POST /api/landing-leads
   Saves a Schedule Service form submission from a client landing page.
   Notification: saved_no_notification until email/SMS infra is added.
───────────────────────────────────────────────────────────────────────── */
router.post('/landing-leads', async (req, res) => {
  const {
    landingPageSlug,
    businessName,
    name,
    phone,
    preferredDate,
    preferredTime,
    source,
    pageUrl,
  } = req.body || {};

  if (!name || !phone || !preferredDate || !preferredTime) {
    return res.status(400).json({ ok: false, error: 'All fields are required.' });
  }

  const lead = {
    id: crypto.randomUUID(),
    landingPageSlug: String(landingPageSlug || '').slice(0, 100),
    businessName: String(businessName || '').slice(0, 200),
    name: String(name).slice(0, 200),
    phone: String(phone).slice(0, 50),
    preferredDate: String(preferredDate).slice(0, 50),
    preferredTime: String(preferredTime).slice(0, 100),
    source: String(source || 'landing_page').slice(0, 200),
    pageUrl: String(pageUrl || '').slice(0, 500),
    createdAt: new Date().toISOString(),
    notificationStatus: 'saved_no_notification',
  };

  try {
    await db.read();
    if (!Array.isArray(db.data.landing_leads)) db.data.landing_leads = [];
    db.data.landing_leads.push(lead);
    await db.write();
    console.log(`[landing-leads] saved lead id=${lead.id} slug=${lead.landingPageSlug} name=${lead.name}`);
  } catch (err) {
    console.error('[landing-leads] db write error:', err.message);
    return res.status(500).json({ ok: false, error: 'Failed to save lead.' });
  }

  return res.json({ ok: true, id: lead.id, notificationStatus: lead.notificationStatus });
});

module.exports = router;
