import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { apiRequest } from '@/lib/queryClient';

export function usePushNotifications(isAuthenticated: boolean) {
  const [permissionStatus, setPermissionStatus] = useState<string>('prompt');

  useEffect(() => {
    if (!isAuthenticated) return;
    if (!Capacitor.isNativePlatform()) return;

    const initPushNotifications = async () => {
      try {
        const permResult = await PushNotifications.checkPermissions();
        
        if (permResult.receive === 'prompt') {
          const requested = await PushNotifications.requestPermissions();
          setPermissionStatus(requested.receive);
          
          if (requested.receive !== 'granted') {
            console.log('[PUSH] Permission denied');
            return;
          }
        } else if (permResult.receive === 'granted') {
          setPermissionStatus('granted');
        } else {
          console.log('[PUSH] Permission denied');
          setPermissionStatus(permResult.receive);
          return;
        }

        await PushNotifications.register();

        PushNotifications.addListener('registration', async (token) => {
          console.log('[PUSH] Registration success');
          
          try {
            await apiRequest('/api/devices', {
              method: 'POST',
              body: JSON.stringify({
                deviceToken: token.value,
                platform: Capacitor.getPlatform(),
                deviceInfo: JSON.stringify({
                  platform: Capacitor.getPlatform(),
                  timestamp: new Date().toISOString(),
                }),
              }),
            });
            console.log('[PUSH] Device registered with server');
          } catch (error) {
            console.error('[PUSH] Failed to register device with server:', error);
          }
        });

        PushNotifications.addListener('registrationError', (error) => {
          console.error('[PUSH] Registration error:', error);
        });

        PushNotifications.addListener('pushNotificationReceived', (notification) => {
          console.log('[PUSH] Notification received:', notification);
        });

        PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
          console.log('[PUSH] Notification action performed:', notification);
        });

      } catch (error) {
        console.error('[PUSH] Error initializing push notifications:', error);
      }
    };

    initPushNotifications();

    return () => {
      PushNotifications.removeAllListeners();
    };
  }, [isAuthenticated]);

  return { permissionStatus };
}
