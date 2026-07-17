/**
 * CLOUDFLARE WORKER W7 — "The Big Guess" Live Poll Engine
 * A special admin-triggered live guessing game open to everyone (its own
 * tile on play.html, not tied to an age group), run off a TV/laptop
 * display (pages/poll-host.html) while guests vote on their phones
 * (pages/guess.html). Fully server-timed so the host screen and every
 * guest phone stay in sync without any per-request admin "next question"
 * click. Internal names still say "poll" (KV keys, routes) from before
 * this was renamed for guests.
 *
 * Routes:
 *   GET  /api/poll/state   → current status/question/phase/tally (guests + host poll this)
 *   POST /api/poll/vote    → cast a vote for the active question (1 per device per question)
 *   GET  /api/poll/final   → final per-question results, once the poll is complete
 *
 * Admin-only controls (enable/start/reset) live in admin-controls.js under
 * /api/admin/poll/* since that file already owns the PIN-gated admin token.
 *
 * KV keys used:
 *   poll_status              → disabled | ready | active | complete
 *   poll_current_index       → 0-based index of the live/most-recent question
 *   poll_question_started_at → timestamp ms — the whole voting+results cycle is
 *                               computed lazily from this on every read, since
 *                               Workers have no background timer
 *   poll_votes_q{n}          → JSON array of { deviceId, choiceIndex, at }
 *   poll_final_results       → JSON array of { question, choices, totalVotes }, written once on completion
 */

// Question content lives in ONE place — public/config/big-guess-questions.js
// — so it can be edited (add/remove/reword questions) without touching any
// worker logic. Like every other config/ file it's technically fetchable
// directly (Wrangler [assets] serves the whole public/ dir), same as every
// other game's answer key already is — not a secret, just avoids the
// question content being duplicated/drifting across files.
import BIG_GUESS_QUESTIONS from '../public/config/big-guess-questions.js';
export const POLL_QUESTIONS = BIG_GUESS_QUESTIONS;

export const VOTE_SEC    = 30; // guests can vote during this window
export const RESULTS_SEC = 10; // results shown before auto-advancing
export const CYCLE_SEC   = VOTE_SEC + RESULTS_SEC;

export default {
  async fetch(request, env) {

    const url    = new URL(request.url);
    const path   = url.pathname;
    const method = request.method;

    const cors = {
      'Access-Control-Allow-Origin':  '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Device-Id, X-Fingerprint, X-Is-Mobile',
    };

    if (method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    const json  = (data, status = 200) =>
      new Response(JSON.stringify(data), {
        status, headers: { 'Content-Type': 'application/json', ...cors },
      });
    const error = (msg, status = 400) => json({ success: false, error: msg }, status);

    const tallyFor = async (index) => {
      const votes = await env.GR_KV.get(`poll_votes_q${index}`, { type: 'json' }) || [];
      const question = POLL_QUESTIONS[index];
      const counts = question.choices.map(() => 0);
      votes.forEach(v => { if (counts[v.choiceIndex] !== undefined) counts[v.choiceIndex]++; });
      const total = votes.length;
      return {
        totalVotes: total,
        choices: question.choices.map((text, i) => ({
          text,
          count: counts[i],
          pct: total ? Math.round((counts[i] / total) * 100) : 0,
        })),
      };
    };

    // Advance poll_current_index/poll_question_started_at as many cycles as
    // have actually elapsed since the last write. Lazy + idempotent: safe
    // to run from many concurrent guest requests, last write wins.
    const resolveActiveState = async () => {
      const [indexRaw, startedRaw] = await Promise.all([
        env.GR_KV.get('poll_current_index'),
        env.GR_KV.get('poll_question_started_at'),
      ]);
      let index   = parseInt(indexRaw || '0');
      let started = parseInt(startedRaw || Date.now().toString());
      let elapsedMs = Date.now() - started;

      let advanced = false;
      while (elapsedMs >= CYCLE_SEC * 1000 && index < POLL_QUESTIONS.length - 1) {
        index++;
        started += CYCLE_SEC * 1000;
        elapsedMs = Date.now() - started;
        advanced = true;
      }

      // Ran past the last question's cycle entirely — poll is done.
      if (elapsedMs >= CYCLE_SEC * 1000 && index === POLL_QUESTIONS.length - 1) {
        const finalResults = await Promise.all(
          POLL_QUESTIONS.map(async (q, i) => ({ question: q.q, ...(await tallyFor(i)) }))
        );
        await Promise.all([
          env.GR_KV.put('poll_status', 'complete'),
          env.GR_KV.put('poll_final_results', JSON.stringify(finalResults)),
        ]);
        return { status: 'complete', index, started };
      }

      if (advanced) {
        await Promise.all([
          env.GR_KV.put('poll_current_index', index.toString()),
          env.GR_KV.put('poll_question_started_at', started.toString()),
        ]);
      }

      return { status: 'active', index, started };
    };

    // ── GET /api/poll/state ──────────────────────────────────
    if (method === 'GET' && path === '/api/poll/state') {
      let status = await env.GR_KV.get('poll_status') || 'disabled';

      if (status !== 'active') {
        return json({ success: true, status, totalQuestions: POLL_QUESTIONS.length });
      }

      const resolved = await resolveActiveState();
      status = resolved.status;

      if (status === 'complete') {
        const finalResults = await env.GR_KV.get('poll_final_results', { type: 'json' }) || [];
        return json({ success: true, status, totalQuestions: POLL_QUESTIONS.length, finalResults });
      }

      const elapsedSec = Math.floor((Date.now() - resolved.started) / 1000);
      const phase      = elapsedSec < VOTE_SEC ? 'voting' : 'results';
      const secLeft    = phase === 'voting' ? VOTE_SEC - elapsedSec : CYCLE_SEC - elapsedSec;
      const question   = POLL_QUESTIONS[resolved.index];

      const payload = {
        success: true,
        status,
        phase,
        secLeft,
        currentIndex: resolved.index,
        totalQuestions: POLL_QUESTIONS.length,
        question: question.q,
        choices: question.choices,
      };

      if (phase === 'results') {
        payload.results = await tallyFor(resolved.index);
      }

      return json(payload);
    }

    // ── POST /api/poll/vote ──────────────────────────────────
    if (method === 'POST' && path === '/api/poll/vote') {
      const deviceId = request.headers.get('X-Device-Id');
      if (!deviceId) return error('Missing device id');

      const body = await request.json().catch(() => ({}));
      const { questionIndex, choiceIndex } = body;

      const status = await env.GR_KV.get('poll_status');
      if (status !== 'active') return error('Poll is not active');

      const resolved = await resolveActiveState();
      if (resolved.status !== 'active' || resolved.index !== questionIndex) {
        return error('This question is no longer accepting votes');
      }

      const elapsedSec = Math.floor((Date.now() - resolved.started) / 1000);
      if (elapsedSec >= VOTE_SEC) return error('Voting has closed for this question');

      const question = POLL_QUESTIONS[questionIndex];
      if (!question || choiceIndex == null || !question.choices[choiceIndex]) {
        return error('Invalid choice');
      }

      const key   = `poll_votes_q${questionIndex}`;
      const votes = await env.GR_KV.get(key, { type: 'json' }) || [];
      if (votes.some(v => v.deviceId === deviceId)) {
        return json({ success: true, alreadyVoted: true });
      }
      votes.push({ deviceId, choiceIndex, at: Date.now() });
      await env.GR_KV.put(key, JSON.stringify(votes));

      return json({ success: true });
    }

    // ── GET /api/poll/final ───────────────────────────────────
    if (method === 'GET' && path === '/api/poll/final') {
      const status = await env.GR_KV.get('poll_status') || 'disabled';
      if (status !== 'complete') return json({ success: true, status, finalResults: [] });
      const finalResults = await env.GR_KV.get('poll_final_results', { type: 'json' }) || [];
      return json({ success: true, status, finalResults });
    }

    return error('Not found', 404);
  },
};
