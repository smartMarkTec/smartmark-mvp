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

/* ─────────────────────────────────────────────────────────────────────────
   POST /api/landing-events
   Saves a lightweight tracking event fired from a client landing page.
   eventName: page_view | call_click | lead_submit | cta_click
   Non-fatal: returns ok:true even if the DB write fails so the visitor UX
   is never blocked by a tracking failure.
───────────────────────────────────────────────────────────────────────── */
router.post('/landing-events', async (req, res) => {
  const {
    clientSlug,
    pageSlug,
    eventName,
    phone,
    campaignId,
    metaAdId,
    fbclid,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    userAgent,
    timestamp,
  } = req.body || {};

  const ALLOWED = new Set(['page_view', 'call_click', 'lead_submit', 'cta_click']);
  const safeEvent = String(eventName || '').trim();
  if (!safeEvent || !ALLOWED.has(safeEvent)) {
    return res.status(400).json({ ok: false, error: 'Invalid or missing eventName.' });
  }

  const event = {
    id:           crypto.randomUUID(),
    clientSlug:   String(clientSlug   || '').slice(0, 100),
    pageSlug:     String(pageSlug     || '').slice(0, 100),
    eventName:    safeEvent,
    phone:        String(phone        || '').slice(0, 50),
    campaignId:   String(campaignId   || '').slice(0, 100),
    metaAdId:     String(metaAdId     || '').slice(0, 100),
    fbclid:       String(fbclid       || '').slice(0, 200),
    utm_source:   String(utm_source   || '').slice(0, 200),
    utm_medium:   String(utm_medium   || '').slice(0, 100),
    utm_campaign: String(utm_campaign || '').slice(0, 200),
    utm_content:  String(utm_content  || '').slice(0, 200),
    userAgent:    String(userAgent    || req.get('user-agent') || '').slice(0, 300),
    ip:           req.ip || '',
    createdAt:    new Date().toISOString(),
    clientTimestamp: String(timestamp || '').slice(0, 50),
  };

  try {
    await db.read();
    if (!Array.isArray(db.data.landing_events)) db.data.landing_events = [];
    db.data.landing_events.push(event);
    await db.write();
    console.log(`[landing-events] event=${event.eventName} slug=${event.pageSlug} id=${event.id}`);
  } catch (err) {
    // Non-fatal — log but don't block the visitor
    console.error('[landing-events] db write error:', err.message);
  }

  return res.json({ ok: true, id: event.id });
});

module.exports = router;
