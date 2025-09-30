import { db } from '../db.js';
import { users } from '@shared/schema';
import { sql, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export async function e2eSeed() {
  const refEmail = 'referrer+e2e@zebby.local';
  const newEmail = 'referee+e2e@zebby.local';
  const now = new Date();

  const refCode = nanoid(6).toUpperCase();

  const [refUser] = await db
    .insert(users)
    .values({
      email: refEmail,
      birthYear: 1995,
      gender: 'woman',
      identity: ['women'],
      referralCode: refCode,
      onboardingCompleted: true,
      edsType: 'hEDS',
      diagnosisYear: 2018,
      primarySymptoms: ['joint_pain', 'fatigue'],
      experienceLevel: 'experienced',
      dailyGoals: ['Track symptoms', 'Connect with community'],
    })
    .onConflictDoUpdate({
      target: users.email,
      set: {
        referralCode: refCode,
        birthYear: 1995,
        gender: 'woman',
        identity: ['women'],
        onboardingCompleted: true,
      }
    })
    .returning();

  const [referee] = await db
    .insert(users)
    .values({
      email: newEmail,
      birthYear: 1998,
      gender: 'woman',
      identity: ['women'],
      onboardingCompleted: true,
      edsType: 'hEDS',
      diagnosisYear: 2020,
      primarySymptoms: ['joint_pain', 'pots'],
      experienceLevel: 'newly_diagnosed',
      dailyGoals: ['Find support', 'Learn about EDS'],
    })
    .onConflictDoUpdate({
      target: users.email,
      set: {
        birthYear: 1998,
        gender: 'woman',
        identity: ['women'],
        onboardingCompleted: true,
      }
    })
    .returning();

  return { refUser, referee };
}
