import { Router } from 'express';

export function e2eMocks() {
  const r = Router();
  
  r.post('/ai/insights', (_req, res) => {
    res.set('Cache-Control', 'no-store').json({
      range: '30d',
      analysis: 'Mocked insights for E2E testing.',
      trendBullets: ['Trend A: Stable patterns', 'Trend B: Improving sleep', 'Trend C: Active week'],
      actionIdeas: ['Idea 1: Keep up the good work', 'Idea 2: Track hydration', 'Idea 3: Rest when needed'],
      disclaimer: 'Mock data for testing'
    });
  });
  
  r.post('/ai/chat', (_req, res) => {
    res.set('Cache-Control', 'no-store').json({ 
      reply: 'Mocked Zebby reply for E2E testing. I hear you and I\'m here for you!' 
    });
  });
  
  return r;
}
