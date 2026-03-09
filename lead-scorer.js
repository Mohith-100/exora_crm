/**
 * lead-scorer.js
 * ─────────────────────────────────────────────────────────────
 * Steps:
 *   • Checks website status (live / broken / missing)
 *   • Scrapes HTML to detect missing tech via signatures & keywords
 *   • Calculates final score (base + gap boosts, capped at 100)
 *   • Generates priority + tailored Exora sales pitch
 *   • Updates DB with score, priority, pitch, gaps_found, website_status
 */

require('dotenv').config();
const axios = require('axios');
const cheerio = require('cheerio');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });

// ── EXORA SERVICE GAP DEFINITIONS ───────────────────────────
const GAP_DEFINITIONS = [
    {
        key: 'crm',
        label: 'CRM / Enquiry Management',
        techSigs: ['leadsquared.com', 'hubspot.com', 'salesforce.com', 'zoho.com', 'nopaperforms', 'extraedge', 'meritto.com', 'noesisenquiry', 'leadform', 'forms.gle'],
        keywords: ['crm login', 'enquiry portal'],
        boost: 10,
        pitch: 'No professional CRM or automated enquiry system detected. Exora CRM can automate lead capture, follow-ups, and convert more admissions—without any manual effort.',
    },
    {
        key: 'lms',
        label: 'LMS / Online Learning',
        techSigs: ['moodle', 'canvas', 'blackboard', 'teachable', 'udemy', 'educomp', 'learnpress', 'tutorlms'],
        keywords: ['student portal', 'lms login'],
        boost: 10,
        pitch: 'No LMS or online learning platform found. Exora LMS enables live/recorded classes, homework, quizzes, and parent-teacher communication—all in one place.',
    },
    {
        key: 'payment',
        label: 'Online Fee Payment',
        techSigs: ['razorpay.com', 'stripe.com', 'paytm.in', 'payu.in', 'instamojo.com', 'ccavenue.com', 'cashfree.com', 'secure.pay'],
        keywords: ['pay fee online', 'online fee portal'],
        boost: 10,
        pitch: 'No online fee payment gateway detected. Exora Payments allows parents to pay fees anytime via UPI, cards, or net banking—reducing admin workload by 80%.',
    },
    {
        key: 'admission',
        label: 'Online Admission Portal',
        techSigs: ['admission.nopaperforms', 'apply.meritto'],
        keywords: ['apply online', 'online admission portal', 'registration form'],
        boost: 8,
        pitch: 'No digital admission process found. Exora Admissions digitises the entire process—from application to document upload and fee payment, cutting paperwork completely.',
    },
    {
        key: 'app',
        label: 'Mobile App / Parent Portal',
        techSigs: ['play.google.com/store/apps', 'apps.apple.com'],
        keywords: ['download our app', 'parent portal'],
        boost: 7,
        pitch: 'No mobile app or parent portal detected. Exora Parent App keeps parents updated with attendance, homework, fees, and notices—boosting their satisfaction.',
    },
    {
        key: 'attendance',
        label: 'Attendance / ERP System',
        techSigs: ['fedena', 'edunext', 'entab', 'myclassboard', 'schoolpad', 'edadmin'],
        keywords: ['erp login', 'school erp login', 'staff login'],
        boost: 7,
        pitch: 'No digital attendance or ERP system detected. Exora ERP lets teachers mark attendance digitally, auto-notifying parents and generating compliance reports.',
    },
    {
        key: 'chatbot',
        label: 'Live Chat / Chatbot',
        techSigs: ['tawk.to', 'tidio.co', 'zendesk.com', 'intercom.io', 'freshchat.com', 'drift.com', 'crisp.chat', 'whatsapp.com/send', 'wa.me'],
        keywords: [],
        boost: 5,
        pitch: 'No live chat or WhatsApp integration found. Exora AI Chatbot handles admission queries 24/7 on WhatsApp and your website, converting visitors into enrolled students automatically.',
    },
    {
        key: 'ssl',
        label: 'Secure Website (HTTPS)',
        techSigs: [],
        keywords: [],
        boost: 5,
        pitch: 'Website is not secure (no HTTPS). Exora handles your HTTPS setup as part of the website package, building trust with parents immediately.',
    },
];

// ── WEBSITE STATUS CHECK ─────────────────────────────────────
async function checkWebsiteStatus(url) {
    if (!url || url.trim() === '') {
        return { status: 'missing', html: '', isHttps: false };
    }

    let normalised = url.trim();
    if (!/^https?:\/\//i.test(normalised)) normalised = 'https://' + normalised;
    const isHttps = normalised.startsWith('https://');

    try {
        const response = await axios.get(normalised, {
            timeout: 10000,
            maxRedirects: 5,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ExoraBot/1.0; +https://exora.solutions)' },
            validateStatus: (s) => s < 500,
        });

        if (response.status >= 400) {
            return { status: 'broken', html: '', isHttps, httpStatus: response.status };
        }

        // Check if redirected to HTTPS
        let finalIsHttps = isHttps;
        if (response.request && response.request.res && response.request.res.responseUrl) {
            finalIsHttps = response.request.res.responseUrl.startsWith('https://');
        }

        return { status: 'live', html: response.data || '', isHttps: finalIsHttps, httpStatus: response.status };
    } catch (err) {
        console.log(`   ⚠️  Website unreachable: ${url} — ${err.message}`);
        return { status: 'broken', html: '', isHttps, error: err.message };
    }
}

// ── GAP DETECTOR ─────────────────────────────────────────────
function detectGaps(html, websiteStatus, isHttps) {
    const foundGaps = [];
    const $ = cheerio.load(html || '');

    // Extract all URLs from scripts, iframes, forms, links
    const srcs = [];
    $('[src]').each((_, el) => srcs.push($(el).attr('src')));
    $('[href]').each((_, el) => srcs.push($(el).attr('href')));
    $('[action]').each((_, el) => srcs.push($(el).attr('action')));

    const techString = srcs.filter(Boolean).join(' ').toLowerCase();
    const bodyText = $('body').text().toLowerCase();

    for (const gap of GAP_DEFINITIONS) {
        if (gap.key === 'ssl') {
            if (!isHttps || websiteStatus === 'missing') foundGaps.push(gap);
            continue;
        }

        if (websiteStatus !== 'live') {
            foundGaps.push(gap); // All gaps apply if site is broken/missing
            continue;
        }

        const hasTechSig = gap.techSigs && gap.techSigs.some((sig) => techString.includes(sig));
        const hasKeyword = gap.keywords && gap.keywords.some((kw) => bodyText.includes(kw));

        if (!hasTechSig && !hasKeyword) {
            foundGaps.push(gap);
        }
    }

    return foundGaps;
}

// ── FINAL SCORE CALCULATOR ───────────────────────────────────
function calcFinalScore(baseScore, gaps) {
    let boost = 0;
    for (const gap of gaps) boost += gap.boost;
    return Math.min(baseScore + boost, 100);
}

// ── PRIORITY CLASSIFIER ──────────────────────────────────────
function classifyPriority(finalScore, gapCount) {
    if (finalScore >= 75 || gapCount >= 5) return '🔥 high';
    if (finalScore >= 50 || gapCount >= 3) return '⚡ medium';
    return '📋 low';
}

// ── PITCH GENERATOR ──────────────────────────────────────────
function generatePitch(lead, gaps, websiteStatus, finalScore, priority) {
    const name = lead.school_name || 'your school';
    const gapLabels = gaps.map((g) => g.label);

    let intro = '';
    if (websiteStatus === 'missing') {
        intro = `${name} currently has no website, making it nearly invisible to parents searching online.`;
    } else if (websiteStatus === 'broken') {
        intro = `${name}'s website appears to be offline or broken, causing lost admission opportunities daily.`;
    } else {
        intro = `${name} has an online presence, but our analysis identified ${gaps.length} critical technology gaps.`;
    }

    const pitchPoints = gaps.slice(0, 5).map((g, i) => `${i + 1}. ${g.pitch}`).join('\n');

    const urgency =
        priority === '🔥 high'
            ? '⚡ HIGH PRIORITY — Contact within 24 hours. Multiple urgent gaps identified.'
            : priority === '⚡ medium'
                ? '📅 MEDIUM PRIORITY — Schedule a call this week.'
                : '📋 LOW PRIORITY — Add to drip campaign.';

    return `
=== EXORA SALES INTELLIGENCE REPORT ===
Lead    : ${name}
Score   : ${finalScore}/100 | Priority: ${priority.toUpperCase()}
Website : ${websiteStatus.toUpperCase()}
Rating  : ${lead.rating || 'N/A'} ⭐  (${lead.reviews || 0} reviews)
Phone   : ${lead.phone || 'N/A'}

📌 SITUATION
${intro}

🔍 GAPS IDENTIFIED (${gaps.length} found)
${gapLabels.join(' | ')}

💬 RECOMMENDED PITCH POINTS
${pitchPoints}

🎯 RECOMMENDED EXORA SERVICES
${gapLabels.join(', ')}

${urgency}
`.trim();
}

// ── SCORE & UPDATE ONE LEAD ──────────────────────────────────
async function scoreLead(lead) {
    console.log(`\n🔎 Scoring: ${lead.school_name}`);

    const { status: websiteStatus, html, isHttps } = await checkWebsiteStatus(lead.website);
    console.log(`   🌐 Website status: ${websiteStatus}`);

    const gaps = detectGaps(html, websiteStatus, isHttps);
    console.log(`   📉 Gaps found: ${gaps.map((g) => g.key).join(', ') || 'none'}`);

    const baseScore = lead.base_score || 0;
    const finalScore = calcFinalScore(baseScore, gaps);
    const priority = classifyPriority(finalScore, gaps.length);
    const pitch = generatePitch(lead, gaps, websiteStatus, finalScore, priority);

    await pool.query(
        `UPDATE leads SET
           website_status = $1,
           gaps_found     = $2,
           score          = $3,
           priority       = $4,
           pitch          = $5,
           scored_at      = NOW(),
           status         = CASE WHEN status = 'new' THEN 'scored' ELSE status END
         WHERE id = $6`,
        [websiteStatus, JSON.stringify(gaps.map((g) => g.key)), finalScore, priority, pitch, lead.id]
    );

    console.log(`   ✅ Score: ${baseScore} → ${finalScore}/100 | Priority: ${priority}`);
    return { ...lead, website_status: websiteStatus, gaps, score: finalScore, priority, pitch };
}

// ── SCORE ALL UN-SCORED LEADS ────────────────────────────────
async function scoreAllPendingLeads() {
    const { rows: leads } = await pool.query(
        `SELECT * FROM leads WHERE scored_at IS NULL ORDER BY created_at DESC`
    );

    if (leads.length === 0) {
        console.log('ℹ️  No un-scored leads found.');
        return [];
    }

    console.log(`\n🚀 Scoring ${leads.length} leads...\n`);
    const results = [];

    for (const lead of leads) {
        try {
            const scored = await scoreLead(lead);
            results.push(scored);
            await new Promise((r) => setTimeout(r, 1500)); // polite delay
        } catch (err) {
            console.error(`❌ Failed to score ${lead.school_name}:`, err.message);
        }
    }

    console.log(`\n🏁 Scoring complete — ${results.length}/${leads.length} leads scored.`);
    return results;
}

module.exports = { scoreLead, scoreAllPendingLeads, checkWebsiteStatus, detectGaps, generatePitch };
