// server/routes/gpt.js
const express = require('express');
const router = express.Router();

const MARKETING_QA = [
  // Who/what
  { triggers: ["who are you", "what are you", "what is this", "what do you do"], reply: "I'm your AI Ad Manager. I help you launch digital ad campaigns—like an agency, but fully automated." },
  { triggers: ["how does this work", "how do you work", "how does it work", "what's the process"], reply: "I’ll ask you a few quick questions, then instantly create image and video ads for your business. You preview, then launch!" },

  // Ad campaign specifics
  { triggers: ["what platforms", "which platforms", "where will my ads show", "where do ads run"], reply: "Right now, I generate ad creatives optimized for platforms like Facebook, Instagram, and more coming soon." },
  { triggers: ["can you post my ads", "will you launch ads", "can you run my ads"], reply: "I generate ready-to-use ads and campaigns. For now, you review and launch them yourself. Automated launching is coming soon!" },
  { triggers: ["do you write the ads", "who writes the ads", "do you create the ads", "do you make the ads"], reply: "Yes, I create the ad copy, design the images, and produce a video preview—all automatically." },
  { triggers: ["do you use ai", "is this ai", "is this artificial intelligence", "do you use artificial intelligence"], reply: "Yes, everything is powered by AI—from generating headlines and images to building campaign videos." },

  // Pricing & trials
  { triggers: ["is this free", "how much does this cost", "pricing", "do I have to pay", "is there a fee"], reply: "The service is currently free during beta. Paid plans and agency integrations coming soon." },

  // Results
  { triggers: ["will this get me more customers", "does this work", "is this effective", "will I get results"], reply: "Our AI generates proven ad styles designed to maximize clicks and sales. The better your answers, the better your results!" },

  // Data/privacy
  { triggers: ["do you store my data", "is my data safe", "what do you do with my info", "privacy"], reply: "Your info is used only to generate your ads and isn’t shared or stored long-term. Privacy is a priority." },

  // Campaign workflow
  { triggers: ["can I edit the ads", "can I change my answers", "can I update my campaign"], reply: "Absolutely! You can correct any answer at any time, regenerate ads, and preview everything before launching." },
  { triggers: ["how many ads do I get", "can I generate more ads", "how many campaigns"], reply: "You can generate unlimited image and video ad previews. Try as many variations as you want!" },

  // Contact/support
  { triggers: ["can I contact support", "help", "support", "I need help", "problem", "issue"], reply: "If you have any questions or need help, just type your question here—I'm here to assist you as your ad manager." },

  // Misc (launch, setup, integrations)
  { triggers: ["do you integrate with facebook", "can you connect to facebook", "instagram", "google ads"], reply: "Currently, I generate ads for you to upload to your ad accounts. Direct integrations are coming soon!" },
  { triggers: ["can I upload my logo", "can I add my own images", "can I use my own video"], reply: "Right now, I generate ads automatically, but custom uploads are planned for a future update." },
  { triggers: ["can you handle multiple businesses", "multiple accounts", "more than one business"], reply: "Yes, you can generate campaigns for as many businesses as you want. Just start a new campaign for each!" },
  { triggers: ["is this like an agency", "are you an agency", "are you a real person", "is this a bot"], reply: "I’m not a human agency—I’m an automated ad manager, but I handle all the busywork like a top agency would." },

  // Fun/variation/common chat
  { triggers: ["thanks", "thank you"], reply: "You’re welcome! Ready to launch your best campaign yet?" },
  { triggers: ["good job", "great", "cool", "nice"], reply: "Thanks! Let's get your ads up and running." },
  { triggers: ["are you real", "are you alive"], reply: "I’m not a person—I’m an automated AI built to manage ads for you, anytime you need." },
  { triggers: ["reset", "start over", "clear"], reply: "Let’s start fresh! Just begin answering the questions again." },
  { triggers: ["what can you do", "what can you help with"], reply: "I generate ad creatives, suggest campaign structures, and handle your digital ad workflow automatically." },

  // Process/flow variations
  { triggers: ["how long does it take", "is this fast", "how fast"], reply: "Most campaigns generate in under two minutes. You’ll see image and video previews instantly." },
  { triggers: ["can you make video ads", "do you generate videos", "video ad"], reply: "Yes! I’ll create a short video ad based on your answers—no editing needed." },

  // More variations...
  { triggers: ["can you target my audience", "do you handle targeting", "set audience"], reply: "I help you create ads for your ideal audience. Audience targeting recommendations are coming soon!" },
  { triggers: ["can you handle retargeting", "retarget"], reply: "Retargeting features are in development! For now, I generate creative for all ad campaign types." },

  // End variations
  { triggers: ["how do I get started", "how do I begin", "how to start", "begin"], reply: "Just answer each question as best you can, and I’ll take care of the rest." },
  { triggers: ["are you always available", "can I use this anytime", "24/7"], reply: "Yes! I’m always available to manage your ads—24/7, whenever you need." },

  // A few more for safety:
  { triggers: ["can I change my industry", "can I update business"], reply: "Of course! Just type your correction anytime and I’ll update your info before generating new ads." },
  { triggers: ["can I pause a campaign", "pause my ads"], reply: "Pausing and scheduling features are coming soon—stay tuned!" },
  { triggers: ["can you optimize my ads", "can you improve my campaign"], reply: "My AI always uses the latest best practices to optimize your campaign for success." },
  { triggers: ["can I use this for e-commerce", "do you support ecommerce"], reply: "Absolutely—many users generate high-converting e-commerce ads with my platform." },
  { triggers: ["do you handle compliance", "compliance", "ad policies"], reply: "I follow the latest ad platform policies to keep your campaigns compliant and effective." },
  { triggers: ["do you work for agencies", "can agencies use this"], reply: "Yes! Agencies can use me to generate campaigns for multiple clients, faster than ever." },
  // Add even more variations as you see fit!
];

const GENERIC_REPLY = "I'm your AI Ad Manager—here to generate your digital ad campaigns. Just answer each question, or type what you want to know!";

// Utility to find best match
function getMarketingReply(text) {
  const t = text.toLowerCase();
  for (let qa of MARKETING_QA) {
    if (qa.triggers.some(trig => t.includes(trig))) {
      return qa.reply;
    }
  }
  return GENERIC_REPLY;
}

router.post('/gpt-chat', (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ reply: "Please provide a message." });
  const reply = getMarketingReply(message);
  res.json({ reply });
});

module.exports = router;