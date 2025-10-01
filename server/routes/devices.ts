import { Router } from 'express';
import { storage } from '../storage';
import { insertDeviceSchema, type InsertDevice } from '@shared/schema';
import { z } from 'zod';

const router = Router();

router.post('/', async (req: any, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const deviceData = insertDeviceSchema.parse({
      userId,
      deviceToken: req.body.deviceToken,
      platform: req.body.platform,
      deviceInfo: req.body.deviceInfo,
    });

    const existingDevice = await storage.getDeviceByToken(deviceData.deviceToken);
    
    if (existingDevice) {
      if (existingDevice.userId === userId) {
        await storage.updateDevice(existingDevice.id, {
          platform: deviceData.platform,
          deviceInfo: deviceData.deviceInfo,
        });
        console.log(`[PUSH] Device token updated for user ${userId.substring(0, 8)}...`);
        return res.json({ success: true, updated: true });
      } else {
        await storage.deleteDevice(existingDevice.id);
      }
    }

    const device = await storage.createDevice(deviceData);
    
    console.log(`[PUSH] Device registered: platform=${device.platform}, user=${userId.substring(0, 8)}..., token=${device.deviceToken.substring(0, 16)}...`);
    
    res.json({ success: true, deviceId: device.id });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid device data', details: error.errors });
    }
    console.error('[PUSH] Error registering device:', error);
    res.status(500).json({ error: 'Failed to register device' });
  }
});

export default router;
