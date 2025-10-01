import { Router } from 'express';
import { db } from '../db';
import { users, symptomLogs, symptomEntries, sleepLogs, aiInteractions } from '@shared/schema';
import { eq, and, lt, isNotNull } from 'drizzle-orm';
import { randomBytes, createCipheriv, createDecipheriv, scrypt } from 'crypto';
import { promisify } from 'util';
import AdmZip from 'adm-zip';

const router = Router();
const scryptAsync = promisify(scrypt);

const FF_DELETE_ACCOUNT = (process.env.FF_DELETE_ACCOUNT || "").toLowerCase() === "true";
const FF_BACKUP_RESTORE = (process.env.FF_BACKUP_RESTORE || "").toLowerCase() === "true";

router.post('/delete', async (req: any, res) => {
  if (!FF_DELETE_ACCOUNT) {
    return res.status(403).json({ error: 'Feature not available' });
  }

  if (!req.user?.id) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  res.setHeader('Cache-Control', 'no-store');

  try {
    const userId = req.user.id;
    const reason = req.body.reason || null;
    const deleteToken = randomBytes(16).toString('hex');

    await db.update(users)
      .set({
        deletedAt: new Date(),
        deleteToken,
        deletionReason: reason
      })
      .where(eq(users.id, userId));

    return res.json({
      ok: true,
      message: 'Account scheduled for deletion in 7 days',
      deleteToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });
  } catch (error) {
    console.error('Account deletion error:', error);
    return res.status(500).json({ error: 'Deletion failed' });
  }
});

router.post('/undo-delete', async (req: any, res) => {
  if (!FF_DELETE_ACCOUNT) {
    return res.status(403).json({ error: 'Feature not available' });
  }

  res.setHeader('Cache-Control', 'no-store');

  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ error: 'Token required' });
    }

    const [user] = await db.select()
      .from(users)
      .where(and(
        eq(users.deleteToken, token),
        isNotNull(users.deletedAt)
      ));

    if (!user) {
      return res.status(404).json({ error: 'Invalid or expired token' });
    }

    const deletedAt = user.deletedAt ? new Date(user.deletedAt) : null;
    if (!deletedAt) {
      return res.status(400).json({ error: 'Account not scheduled for deletion' });
    }

    const daysSinceDeletion = (Date.now() - deletedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceDeletion > 7) {
      return res.status(410).json({ error: 'Recovery window expired' });
    }

    await db.update(users)
      .set({
        deletedAt: null,
        deleteToken: null,
        deletionReason: null
      })
      .where(eq(users.id, user.id));

    return res.json({
      ok: true,
      message: 'Account restored successfully'
    });
  } catch (error) {
    console.error('Account undo deletion error:', error);
    return res.status(500).json({ error: 'Restoration failed' });
  }
});

router.post('/backup', async (req: any, res) => {
  if (!FF_BACKUP_RESTORE) {
    return res.status(403).json({ error: 'Feature not available' });
  }

  if (!req.user?.id) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  res.setHeader('Cache-Control', 'no-store');

  try {
    const userId = req.user.id;
    const passphrase = req.body.passphrase as string;

    if (!passphrase || passphrase.length < 8) {
      return res.status(400).json({ error: 'Passphrase must be at least 8 characters' });
    }

    const [user] = await db.select().from(users).where(eq(users.id, userId));
    const symptoms = await db.select().from(symptomLogs).where(eq(symptomLogs.userId, userId));
    const entries = await db.select().from(symptomEntries).where(eq(symptomEntries.userId, userId));
    const sleep = await db.select().from(sleepLogs).where(eq(sleepLogs.userId, userId));
    const interactions = await db.select().from(aiInteractions).where(eq(aiInteractions.userId, userId));

    const backupData = {
      exportedAt: new Date().toISOString(),
      user,
      symptomLogs: symptoms,
      symptomEntries: entries,
      sleepLogs: sleep,
      aiInteractions: interactions
    };

    const jsonData = JSON.stringify(backupData, null, 2);
    const encrypted = await encryptData(jsonData, passphrase);

    const zip = new AdmZip();
    zip.addFile('backup_encrypted.json', Buffer.from(encrypted, 'utf8'));

    const zipBuffer = zip.toBuffer();

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename=zebby_backup_${new Date().toISOString().split('T')[0]}.zip`);
    res.send(zipBuffer);
  } catch (error) {
    console.error('Backup creation error:', error);
    return res.status(500).json({ error: 'Backup failed' });
  }
});

router.post('/restore', async (req: any, res) => {
  if (!FF_BACKUP_RESTORE) {
    return res.status(403).json({ error: 'Feature not available' });
  }

  if (!req.user?.id) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  res.setHeader('Cache-Control', 'no-store');

  try {
    const userId = req.user.id;
    const passphrase = req.body.passphrase as string;
    const fileBase64 = req.body.file as string;

    if (!passphrase || !fileBase64) {
      return res.status(400).json({ error: 'Passphrase and file required' });
    }

    const zipBuffer = Buffer.from(fileBase64, 'base64');
    const zip = new AdmZip(zipBuffer);
    const entries = zip.getEntries();

    const encryptedEntry = entries.find(e => e.entryName === 'backup_encrypted.json');
    if (!encryptedEntry) {
      return res.status(400).json({ error: 'Invalid backup file' });
    }

    const encryptedData = encryptedEntry.getData().toString('utf8');
    const decryptedJson = await decryptData(encryptedData, passphrase);
    const backupData = JSON.parse(decryptedJson);

    return res.json({
      ok: true,
      message: 'Restore would import data',
      stats: {
        symptomLogs: backupData.symptomLogs?.length || 0,
        symptomEntries: backupData.symptomEntries?.length || 0,
        sleepLogs: backupData.sleepLogs?.length || 0,
        aiInteractions: backupData.aiInteractions?.length || 0
      }
    });
  } catch (error) {
    console.error('Restore error:', error);
    if (error instanceof Error && error.message.includes('decrypt')) {
      return res.status(400).json({ error: 'Invalid passphrase or corrupted backup' });
    }
    return res.status(500).json({ error: 'Restore failed' });
  }
});

async function encryptData(text: string, passphrase: string): Promise<string> {
  const salt = randomBytes(16);
  const iv = randomBytes(16);
  const key = (await scryptAsync(passphrase, salt, 32)) as Buffer;
  
  const cipher = createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  return JSON.stringify({
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    data: encrypted
  });
}

async function decryptData(encryptedJson: string, passphrase: string): Promise<string> {
  const { salt, iv, data } = JSON.parse(encryptedJson);
  
  const key = (await scryptAsync(passphrase, Buffer.from(salt, 'hex'), 32)) as Buffer;
  const decipher = createDecipheriv('aes-256-cbc', key, Buffer.from(iv, 'hex'));
  
  let decrypted = decipher.update(data, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

export async function purgeDeletedAccounts() {
  if (!FF_DELETE_ACCOUNT) return;

  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const usersToDelete = await db.select()
      .from(users)
      .where(and(
        isNotNull(users.deletedAt),
        lt(users.deletedAt, sevenDaysAgo)
      ));

    for (const user of usersToDelete) {
      await db.delete(symptomLogs).where(eq(symptomLogs.userId, user.id));
      await db.delete(symptomEntries).where(eq(symptomEntries.userId, user.id));
      await db.delete(sleepLogs).where(eq(sleepLogs.userId, user.id));
      await db.delete(aiInteractions).where(eq(aiInteractions.userId, user.id));
      
      await db.delete(users).where(eq(users.id, user.id));
      
      console.log(`[PURGE] Permanently deleted user ${user.id} and all associated data`);
    }

    if (usersToDelete.length > 0) {
      console.log(`[PURGE] Completed: ${usersToDelete.length} accounts permanently deleted`);
    }
  } catch (error) {
    console.error('[PURGE] Error during account purge:', error);
  }
}

export default router;
