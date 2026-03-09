/**
 * lead-scraper.js
 * ─────────────────────────────────────────────────────────────
 * Fetches school listings from Serper API and saves raw leads to DB.
 * Calculates base_score (0-80) from rating, reviews, phone, website, address.
 */

require('dotenv').config();
const axios = require('axios');
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: false });

// ── BASE SCORE CALCULATOR ─────────────────────────────────────
function calcBaseScore({ rating, reviews, phone, website, address }) {
    let score = 0;

    const r = parseFloat(rating) || 0;
    if (r >= 4.5) score += 25;
    else if (r >= 4.0) score += 20;
    else if (r >= 3.5) score += 14;
    else if (r >= 3.0) score += 8;
    else if (r > 0) score += 4;

    const rv = parseInt(reviews) || 0;
    if (rv >= 200) score += 20;
    else if (rv >= 100) score += 16;
    else if (rv >= 50) score += 12;
    else if (rv >= 20) score += 8;
    else if (rv >= 5) score += 4;

    if (phone) score += 10;
    if (website) score += 15;
    if (address) score += 10;

    return Math.min(score, 80);
}

// ── PHONE CLEANER ─────────────────────────────────────────────
function cleanPhone(raw) {
    if (!raw) return '';
    return String(raw).replace(/^['"\s]+/, '').trim();
}

// ── SCRAPE & SAVE ─────────────────────────────────────────────
async function scrapeAndSave(query = 'preschools in Bengaluru') {
    const apiKey = process.env.SERPER_API_KEY;
    if (!apiKey) throw new Error('SERPER_API_KEY not set in .env');

    console.log(`\n🔍 Searching Serper for: "${query}"`);

    const response = await axios.post(
        'https://google.serper.dev/maps',
        { q: query, num: 20 },
        { headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' } }
    );

    const places = response.data?.places || [];
    console.log(`   Found ${places.length} results`);

    const saved = [], skipped = [], errors = [];

    for (const place of places) {
        try {
            const phone = cleanPhone(place.phoneNumber || place.phone || '');
            const website = place.website || '';
            const address = place.address || '';
            const name = place.title || place.name || 'Unknown';
            const rating = place.rating ? String(place.rating) : null;
            const reviews = place.reviews || place.reviewsCount || null;
            const baseScore = calcBaseScore({ rating, reviews, phone, website, address });

            const result = await pool.query(
                `INSERT INTO leads
                   (school_name, address, phone, website, rating, reviews, base_score, score, source, status, search_query)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'serper','new',$9)
                 ON CONFLICT (school_name, address) DO NOTHING
                 RETURNING *`,
                [name, address, phone, website, rating, reviews, baseScore, baseScore, query]
            );

            if (result.rows.length) {
                saved.push(result.rows[0]);
                console.log(`   ✅ Saved: ${name} (base_score: ${baseScore})`);
            } else {
                skipped.push(name);
                console.log(`   ⏭️  Skipped (duplicate): ${name}`);
            }
        } catch (err) {
            errors.push({ name: place.title, error: err.message });
            console.error(`   ❌ Error saving ${place.title}:`, err.message);
        }
    }

    console.log(`\n📋 Scrape done: ${saved.length} saved, ${skipped.length} skipped, ${errors.length} errors`);
    return { saved, skipped, errors };
}

module.exports = { scrapeAndSave, calcBaseScore, cleanPhone };
