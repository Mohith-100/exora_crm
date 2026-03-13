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

// ── Load scoring config from DB ────────────────────────────
async function loadScoreConfig() {
    const { rows } = await pool.query('SELECT * FROM score_config ORDER BY sort_order ASC');
    return rows;
}

// ── EXORA SERVICE GAP DEFINITIONS ───────────────────────────
const GAP_DEFINITIONS = [
    {
        key: 'crm',
        label: 'CRM / Enquiry Management',
        techSigs: ['leadsquared.com', 'hubspot.com', 'salesforce.com', 'zoho.com', 'nopaperforms', 'extraedge', 'meritto.com', 'noesisenquiry', 'leadform', 'forms.gle'],
        keywords: ['crm login', 'enquiry portal'],
        apiCats: ['crm', 'marketing-automation'],
        boost: 10,
        pitch: 'No professional CRM or automated enquiry system detected. Exora CRM can automate lead capture, follow-ups, and convert more admissions—without any manual effort.',
    },
    {
        key: 'lms',
        label: 'LMS / Online Learning',
        techSigs: ['moodle', 'canvas', 'blackboard', 'teachable', 'udemy', 'educomp', 'learnpress', 'tutorlms'],
        keywords: ['student portal', 'lms login'],
        apiCats: ['lms'],
        boost: 10,
        pitch: 'No LMS or online learning platform found. Exora LMS enables live/recorded classes, homework, quizzes, and parent-teacher communication—all in one place.',
    },
    {
        key: 'payment',
        label: 'Online Fee Payment',
        techSigs: ['razorpay.com', 'stripe.com', 'paytm.in', 'payu.in', 'instamojo.com', 'ccavenue.com', 'cashfree.com', 'secure.pay'],
        keywords: ['pay fee online', 'online fee portal'],
        apiCats: ['payment-processors'],
        boost: 10,
        pitch: 'No online fee payment gateway detected. Exora Payments allows parents to pay fees anytime via UPI, cards, or net banking—reducing admin workload by 80%.',
    },
    {
        key: 'admission',
        label: 'Online Admission Portal',
        techSigs: ['admission.nopaperforms', 'apply.meritto'],
        keywords: ['apply online', 'online admission portal', 'registration form'],
        apiCats: [],
        boost: 8,
        pitch: 'No digital admission process found. Exora Admissions digitises the entire process—from application to document upload and fee payment, cutting paperwork completely.',
    },
    {
        key: 'app',
        label: 'Mobile App / Parent Portal',
        techSigs: ['play.google.com/store/apps', 'apps.apple.com'],
        keywords: ['download our app', 'parent portal'],
        apiCats: [],
        boost: 7,
        pitch: 'No mobile app or parent portal detected. Exora Parent App keeps parents updated with attendance, homework, fees, and notices—boosting their satisfaction.',
    },
    {
        key: 'attendance',
        label: 'Attendance / ERP System',
        techSigs: ['fedena', 'edunext', 'entab', 'myclassboard', 'schoolpad', 'edadmin'],
        keywords: ['erp login', 'school erp login', 'staff login'],
        apiCats: ['erp'],
        boost: 7,
        pitch: 'No digital attendance or ERP system detected. Exora ERP lets teachers mark attendance digitally, auto-notifying parents and generating compliance reports.',
    },
    {
        key: 'chatbot',
        label: 'Live Chat / Chatbot',
        techSigs: ['tawk.to', 'tidio.co', 'zendesk.com', 'intercom.io', 'freshchat.com', 'drift.com', 'crisp.chat', 'whatsapp.com/send', 'wa.me'],
        keywords: [],
        apiCats: ['live-chat'],
        boost: 5,
        pitch: 'No live chat or WhatsApp integration found. Exora AI Chatbot handles admission queries 24/7 on WhatsApp and your website, converting visitors into enrolled students automatically.',
    },
    {
        key: 'ssl',
        label: 'Secure Website (HTTPS)',
        techSigs: [],
        keywords: [],
        apiCats: [],
        boost: 5,
        pitch: 'Website is not secure (no HTTPS). Exora handles your HTTPS setup as part of the website package, building trust with parents immediately.',
    },
];

// ── FREE LOCAL DEEP SCANNER ───────────────────────────────
// Replaces expensive APIs by aggressively scanning for invisible tech signatures
function deepTechScan(html) {
    if (!html) return [];

    const $ = cheerio.load(html);
    const foundTechs = new Set();
    const rawHtml = html.toLowerCase();

    // 1. Scrape all domains from scripts, iframes, and links
    const externalDomains = [];
    $('script[src]').each((_, el) => externalDomains.push($(el).attr('src')));
    $('iframe[src]').each((_, el) => externalDomains.push($(el).attr('src')));
    $('link[href]').each((_, el) => externalDomains.push($(el).attr('href')));

    const domainString = externalDomains.filter(Boolean).map(d => d.toLowerCase()).join(' ');

    // 2. Map of signatures to categories
    const techSignatures = [
        { cat: 'crm', match: ['leadsquared', 'hubspot', 'salesforce', 'zoho', 'nopaperforms', 'meritto', 'leadform', 'extraedge', 'forms.gle'] },
        { cat: 'lms', match: ['moodle', 'canvas', 'learnpress', 'tutorlms', 'teachable', 'blackboard', 'educomp'] },
        { cat: 'payment-processors', match: ['razorpay', 'stripe', 'paytm', 'payu', 'instamojo', 'ccavenue', 'cashfree', 'billdesk'] },
        { cat: 'erp', match: ['fedena', 'edunext', 'entab', 'myclassboard', 'schoolpad', 'edadmin'] },
        { cat: 'live-chat', match: ['tawk.to', 'tidio', 'zendesk', 'intercom', 'freshchat', 'drift', 'crisp', 'whatsapp.com/send', 'wa.me'] }
    ];

    // 3. Hunt through both the visible domains AND the invisible raw HTML
    for (const tech of techSignatures) {
        for (const signature of tech.match) {
            // Uncover hidden scripts embedded directly into the HTML body that cheerio wouldn't extract as an external source
            if (domainString.includes(signature) || rawHtml.includes(signature)) {
                foundTechs.add(tech.cat);
                break; // Found one tool in this category, move to next category
            }
        }
    }

    return Array.from(foundTechs);
}

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
function detectGaps(html, websiteStatus, isHttps, wappalyzerData = []) {
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

        // Deep Tech API Scan Match
        let hasApiMatch = false;
        if (gap.apiCats && wappalyzerData.length > 0) {
            hasApiMatch = gap.apiCats.some(cat => wappalyzerData.includes(cat));
        }

        if (!hasTechSig && !hasKeyword && !hasApiMatch) {
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

// \u2500\u2500 SCORE & UPDATE ONE LEAD ──────────────────────────────────
async function scoreLead(lead) {
    console.log(`\n\ud83d\udd0e Scoring: ${lead.school_name}`);

    // Load live config from DB every time (always up-to-date)
    const cfg = await loadScoreConfig();
    const baseCfg = cfg.filter(c => c.category === 'base');
    const gapCfg = cfg.filter(c => c.category === 'gap');

    // \u2500\u2500 Dynamic base score from DB config \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    const getBase = (key) => { const r = baseCfg.find(c => c.key === key); return (r && r.enabled) ? r.points : 0; };
    let baseScore = 0;
    const rating = parseFloat(lead.rating) || 0;
    if (rating >= 4.5) baseScore += getBase('rating_4_5');
    else if (rating >= 4.0) baseScore += getBase('rating_4_0');
    else if (rating >= 3.5) baseScore += getBase('rating_3_5');
    else if (rating >= 3.0) baseScore += getBase('rating_3_0');
    else if (rating > 0) baseScore += getBase('rating_any');
    const rv = parseInt(lead.reviews) || 0;
    if (rv >= 200) baseScore += getBase('reviews_200');
    else if (rv >= 100) baseScore += getBase('reviews_100');
    else if (rv >= 50) baseScore += getBase('reviews_50');
    else if (rv >= 20) baseScore += getBase('reviews_20');
    else if (rv >= 5) baseScore += getBase('reviews_5');
    if (lead.phone) baseScore += getBase('has_phone');
    if (lead.website) baseScore += getBase('has_website');
    if (lead.address) baseScore += getBase('has_address');
    baseScore = Math.min(baseScore, 80);
    console.log(`   \ud83d\udcca Base score (dynamic): ${baseScore}`);

    // \u2500\u2500 Website check \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    const { status: websiteStatus, html, isHttps } = await checkWebsiteStatus(lead.website);
    console.log(`   \ud83c\udf10 Website status: ${websiteStatus}`);

    let apiTechs = [];
    if (websiteStatus === 'live') {
        apiTechs = deepTechScan(html);
        if (apiTechs.length > 0) console.log(`   \ud83d\udce1 Deep scanner detected: ${apiTechs.join(', ')}`);
    }

    // \u2500\u2500 Gap detection + dynamic boosts from DB config \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    const detectedGaps = detectGaps(html, websiteStatus, isHttps, apiTechs);
    const gaps = detectedGaps
        .map(g => {
            const dbRule = gapCfg.find(c => c.key === g.key);
            if (!dbRule || !dbRule.enabled) return null; // skip disabled rules
            return { ...g, boost: dbRule.points };       // use DB points
        })
        .filter(Boolean);
    console.log(`   \ud83d\udcc9 Gaps: ${gaps.map(g => g.key + '(+' + g.boost + 'pt)').join(', ') || 'none'}`);

    const finalScore = calcFinalScore(baseScore, gaps);
    const priority = classifyPriority(finalScore, gaps.length);
    const pitch = generatePitch(lead, gaps, websiteStatus, finalScore, priority);

    await pool.query(
        `UPDATE leads SET
           base_score     = $1,
           website_status = $2,
           gaps_found     = $3,
           score          = $4,
           priority       = $5,
           pitch          = $6,
           scored_at      = NOW(),
           status         = CASE WHEN status = 'new' THEN 'scored' ELSE status END
         WHERE id = $7`,
        [baseScore, websiteStatus, JSON.stringify(gaps.map(g => g.key)), finalScore, priority, pitch, lead.id]
    );

    console.log(`   \u2705 Score: ${baseScore} base + gaps \u2192 ${finalScore}/100 | Priority: ${priority}`);
    return { ...lead, base_score: baseScore, website_status: websiteStatus, gaps, score: finalScore, priority, pitch };
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
