import { Router } from 'express';
import { e2eSeed } from './e2e-seed.js';
import { processWeekActiveRewards } from '../lib/week-active-rewards.js';

export function e2eDevRoutes() {
  const r = Router();
  
  r.post('/seed', async (_req, res) => {
    try {
      const data = await e2eSeed();
      res.json({ ok: true, ...data });
    } catch (error: any) {
      console.error('E2E seed error:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });
  
  r.post('/run-week-active', async (_req, res) => {
    try {
      await processWeekActiveRewards();
      res.json({ ok: true });
    } catch (error: any) {
      console.error('Week-active cron error:', error);
      res.status(500).json({ ok: false, error: error.message });
    }
  });
  
  return r;
}
