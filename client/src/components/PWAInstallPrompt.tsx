import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Check, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const { toast } = useToast();

  const isPWAEnabled = import.meta.env.VITE_FF_PWA === "true";

  useEffect(() => {
    if (!isPWAEnabled) return;

    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(isIOSDevice);

    if ('getInstalledRelatedApps' in navigator) {
      (navigator as any).getInstalledRelatedApps().then((relatedApps: any[]) => {
        setIsInstalled(relatedApps.length > 0);
      });
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handler);
    
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      toast({
        title: "App Installed",
        description: "Zebby has been installed successfully!",
      });
    });

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service-worker.js')
        .then(() => console.log('[PWA] Service Worker registered'))
        .catch((err) => console.error('[PWA] Service Worker registration failed:', err));
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, [isPWAEnabled, toast]);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    try {
      await deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      
      if (choiceResult.outcome === 'accepted') {
        toast({
          title: "Installing...",
          description: "Zebby is being installed to your device.",
        });
      }
      
      setDeferredPrompt(null);
    } catch (error) {
      console.error('[PWA] Installation error:', error);
      toast({
        title: "Installation Failed",
        description: "There was an error installing the app. Please try again.",
        variant: "destructive"
      });
    }
  };

  if (!isPWAEnabled) {
    return null;
  }

  if (isInstalled) {
    return (
      <Card data-testid="pwa-installed-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-green-600">
            <Check className="h-5 w-5" />
            App Installed
          </CardTitle>
          <CardDescription>
            Zebby is installed on your device
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (isIOS) {
    return (
      <Card data-testid="pwa-ios-instructions">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Install Zebby
          </CardTitle>
          <CardDescription>
            Add Zebby to your home screen for quick access
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm">
            <p><strong>To install on iOS:</strong></p>
            <ol className="list-decimal list-inside space-y-2 ml-2">
              <li>Tap the Share button <span className="inline-block">□↑</span> at the bottom of Safari</li>
              <li>Scroll down and tap "Add to Home Screen"</li>
              <li>Tap "Add" in the top right corner</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!deferredPrompt) {
    return null;
  }

  return (
    <Card data-testid="pwa-install-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Download className="h-5 w-5" />
          Install Zebby
        </CardTitle>
        <CardDescription>
          Install Zebby as an app for faster access and offline support
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button 
          onClick={handleInstallClick}
          className="w-full"
          data-testid="button-install-pwa"
        >
          <Download className="h-4 w-4 mr-2" />
          Install App
        </Button>
      </CardContent>
    </Card>
  );
}
