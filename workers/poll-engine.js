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
 *   GET  /api/poll/state   → current status/question/phase/tally (guests + host poll this).
 *                             Always includes `finaleLocked` — true when admin has LOCKed the
 *                             party (finale) and hasn't individually re-opened 'bigguess' via
 *                             finale_unlocked_groups (see workers/party-state.js). Guest pages
 *                             (guess.html, play.html's tile) treat this as "can't play right
 *                             now"; it does not pause the question cycle's own timer.
 *   POST /api/poll/vote    → cast a vote for the active question (1 per device per question).
 *                             Rejected while finale-locked.
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
 *   poll_results_history      → JSON array of past completed runs, most recent
 *                               first, capped at 20 entries:
 *                               { version, runId, completedAt, totalQuestions, results }.
 *                               Survives poll/start + poll/reset (which only
 *                               clear poll_final_results/votes/index) so admin
 *                               can review earlier runs after resetting and
 *                               replaying the poll — see GET /api/admin/poll/history.
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

    // Big Guess is treated like a 5th "group" alongside toddler/kid/teen/adult
    // (see finale_unlocked_groups in workers/party-state.js) — LOCK closes it
    // by default same as everyone else, admin can re-open it independently.
    // This only gates guest access (voting/tile state); it does not pause the
    // question cycle's own elapsed-time clock.
    const isFinaleLocked = async () => {
      const partyState = await env.GR_KV.get('party_state');
      if (partyState !== 'finale') return false;
      const unlocked = await env.GR_KV.get('finale_unlocked_groups', { type: 'json' }) || [];
      return !unlocked.includes('bigguess');
    };

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

    // Archives a completed run into poll_results_history so admin can still
    // see it after a poll/reset (which only wipes poll_final_results/votes).
    // Guarded by runId (the run's poll_question_started_at) so concurrent
    // guest polls that all land on the completion branch at once don't each
    // append their own duplicate entry.
    const archiveResults = async (runId, finalResults) => {
      const history = await env.GR_KV.get('poll_results_history', { type: 'json' }) || [];
      if (history[0]?.runId === runId) return;
      history.unshift({
        version: (history[0]?.version || 0) + 1,
        runId,
        completedAt: Date.now(),
        totalQuestions: POLL_QUESTIONS.length,
        results: finalResults,
      });
      await env.GR_KV.put('poll_results_history', JSON.stringify(history.slice(0, 20)));
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
        await archiveResults(started, finalResults);
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
      const finaleLocked = await isFinaleLocked();

      if (status !== 'active') {
        return json({ success: true, status, totalQuestions: POLL_QUESTIONS.length, finaleLocked });
      }

      const resolved = await resolveActiveState();
      status = resolved.status;

      if (status === 'complete') {
        const finalResults = await env.GR_KV.get('poll_final_results', { type: 'json' }) || [];
        return json({ success: true, status, totalQuestions: POLL_QUESTIONS.length, finalResults, finaleLocked });
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
        finaleLocked,
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

      if (await isFinaleLocked()) {
        return error("The Big Guess is paused right now — check back after the couple's finale!");
      }

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
