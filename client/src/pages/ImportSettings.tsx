import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

type ImportSource = {
  id: string;
  source: 'google_fit' | 'apple_health';
  isEnabled: boolean;
  lastSync?: string;
  syncPreferences?: {
    heart_rate: boolean;
    sleep: boolean;
    steps: boolean;
  };
};

type SourceState = {
  googleFit: {
    enabled: boolean;
    status: 'idle' | 'syncing' | 'ok' | 'warn';
    lastSync?: string;
  };
  appleHealth: {
    enabled: boolean;
    status: 'idle' | 'syncing' | 'ok' | 'warn';
    lastSync?: string;
  };
};

export default function ImportSettings() {
  const [s, setS] = useState<SourceState>({
    googleFit: {
      enabled: false,
      status: 'idle'
    },
    appleHealth: {
      enabled: false,
      status: 'idle'
    }
  });
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch import sources
  const { data: sources } = useQuery({
    queryKey: ['/api/import-sources'],
    select: (data: ImportSource[]) => {
      const googleFit = data.find(s => s.source === 'google_fit');
      const appleHealth = data.find(s => s.source === 'apple_health');
      
      // Determine per-source status from backend data
      const getSourceStatus = (enabled: boolean, lastSync?: string): 'idle' | 'ok' | 'warn' => {
        if (!enabled) return 'idle';
        if (lastSync && new Date(lastSync) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)) {
          return 'ok'; // Recently synced
        }
        return 'warn'; // Enabled but no recent sync
      };
      
      setS({
        googleFit: {
          enabled: googleFit?.isEnabled || false,
          status: getSourceStatus(googleFit?.isEnabled || false, googleFit?.lastSync),
          lastSync: googleFit?.lastSync
        },
        appleHealth: {
          enabled: appleHealth?.isEnabled || false,
          status: getSourceStatus(appleHealth?.isEnabled || false, appleHealth?.lastSync),
          lastSync: appleHealth?.lastSync
        }
      });
      
      return data;
    }
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      // Set Google Fit to syncing state (only Google Fit has automated sync)
      setS(prev => ({ 
        ...prev, 
        googleFit: { ...prev.googleFit, status: 'syncing' }
      }));
      
      const enabledSources = sources?.filter(s => s.isEnabled) || [];
      const syncPromises = enabledSources.map(source => {
        // Only Google Fit has automated sync - Apple Health is upload-based
        if (source.source === 'google_fit') {
          return apiRequest(`/api/import-sources/${source.id}/sync`, {
            method: 'POST'
          });
        }
        return Promise.resolve(); // Apple Health doesn't need sync, it's upload-based
      });
      
      await Promise.all(syncPromises);
    },
    onSuccess: () => {
      toast({ title: 'Sync complete', description: 'Health data has been updated' });
      queryClient.invalidateQueries({ queryKey: ['/api/import-sources'] });
      // Status will be updated when query refetches
    },
    onError: () => {
      toast({ title: 'Sync failed', description: 'Please try again', variant: 'destructive' });
      // Reset Google Fit to warn status on error
      setS(prev => ({ 
        ...prev, 
        googleFit: { ...prev.googleFit, status: 'warn' }
      }));
    }
  });

  const toggleSourceMutation = useMutation({
    mutationFn: async ({ sourceId, enabled }: { sourceId: string; enabled: boolean }) => {
      return await apiRequest(`/api/import-sources/${sourceId}`, {
        method: 'PATCH',
        body: JSON.stringify({ isEnabled: enabled }),
        headers: { 'Content-Type': 'application/json' }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/import-sources'] });
    }
  });

  const appleHealthUploadMutation = useMutation({
    mutationFn: async (file: File) => {
      // Set Apple Health to syncing state during upload
      setS(prev => ({ 
        ...prev, 
        appleHealth: { ...prev.appleHealth, status: 'syncing' }
      }));
      
      const formData = new FormData();
      formData.append('healthExport', file);
      
      const response = await fetch('/api/import-sources/apple-health/upload', {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Upload failed' }));
        throw new Error(errorData.message || `HTTP ${response.status}`);
      }
      
      return await response.json();
    },
    onSuccess: () => {
      toast({ title: 'Upload complete', description: 'Apple Health data has been imported' });
      queryClient.invalidateQueries({ queryKey: ['/api/import-sources'] });
      // Status will be updated when query refetches
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Upload failed', 
        description: error.message || 'Please check your file and try again', 
        variant: 'destructive' 
      });
      // Reset Apple Health to warn status on error
      setS(prev => ({ 
        ...prev, 
        appleHealth: { ...prev.appleHealth, status: 'warn' }
      }));
    }
  });

  async function syncNow() {
    syncMutation.mutate();
  }

  async function connectGoogleFit() {
    try {
      const response = await fetch('/api/import-sources/google-fit/authorize');
      const data = await response.json();
      
      if (data.authUrl) {
        const popup = window.open(data.authUrl, 'google-fit-auth', 'width=500,height=600');
        
        // Handle popup blocked case
        if (!popup) {
          setS(prev => ({ 
            ...prev, 
            googleFit: { ...prev.googleFit, status: 'warn' }
          }));
          toast({ 
            title: 'Popup blocked', 
            description: 'Please allow popups for this site and try again', 
            variant: 'destructive' 
          });
          return;
        }
        
        let isHandled = false; // Flag to prevent multiple handlers
        
        const messageHandler = (event: MessageEvent) => {
          // Security: Validate source and origin
          if (!popup || event.source !== popup || isHandled) {
            return; // Ignore messages not from our popup or already handled
          }
          
          // Security: Validate origin - only accept from our own domain or known auth domains
          const allowedOrigins = [
            window.location.origin, // Our own domain
            'https://accounts.google.com',
            'https://oauth.google.com'
          ];
          if (!allowedOrigins.includes(event.origin)) {
            console.warn('Rejected postMessage from unauthorized origin:', event.origin);
            return;
          }
          
          // Only handle definitive success/error messages for google_fit, ignore handshake
          if (event.data && typeof event.data === 'object' && event.data.source === 'google_fit') {
            if (event.data.success) {
              isHandled = true;
              popup.close();
              clearTimeout(timeout);
              clearInterval(checkClosed);
              setS(prev => ({ 
                ...prev, 
                googleFit: { ...prev.googleFit, enabled: true, status: 'ok' }
              }));
              toast({ title: 'Connected!', description: 'Google Fit is now connected' });
              queryClient.invalidateQueries({ queryKey: ['/api/import-sources'] });
              // Clean up listener only after definitive success
              window.removeEventListener('message', messageHandler);
            } else if (event.data.error) {
              isHandled = true;
              popup.close();
              clearTimeout(timeout);
              clearInterval(checkClosed);
              setS(prev => ({ 
                ...prev, 
                googleFit: { ...prev.googleFit, status: 'warn' }
              }));
              toast({ title: 'Connection failed', description: 'Google Fit connection was denied', variant: 'destructive' });
              // Clean up listener only after definitive error
              window.removeEventListener('message', messageHandler);
            }
            // Ignore other google_fit messages (handshake, etc.) - keep listener active
          }
          // Ignore non-google_fit messages entirely
        };
        
        // Set up timeout to clean up listener and handle popup close
        const timeout = setTimeout(() => {
          if (isHandled) return; // Don't override handled success/error
          isHandled = true;
          if (popup && !popup.closed) {
            popup.close();
          }
          clearInterval(checkClosed);
          setS(prev => ({ 
            ...prev, 
            googleFit: { ...prev.googleFit, status: 'warn' }
          }));
          toast({ title: 'Connection timed out', description: 'Please try connecting again', variant: 'destructive' });
          window.removeEventListener('message', messageHandler);
        }, 60000); // 1 minute timeout
        
        // Monitor popup close
        const checkClosed = setInterval(() => {
          // Guard against null popup
          if (!popup) {
            isHandled = true;
            clearInterval(checkClosed);
            clearTimeout(timeout);
            setS(prev => ({ 
              ...prev, 
              googleFit: { ...prev.googleFit, status: 'warn' }
            }));
            window.removeEventListener('message', messageHandler);
            return;
          }
          
          if (popup.closed && !isHandled) {
            isHandled = true;
            clearInterval(checkClosed);
            clearTimeout(timeout);
            setS(prev => ({ 
              ...prev, 
              googleFit: { ...prev.googleFit, status: 'warn' }
            }));
            window.removeEventListener('message', messageHandler);
          }
        }, 1000);
        
        window.addEventListener('message', messageHandler);
      }
    } catch (error) {
      toast({ title: 'Connection failed', description: 'Could not connect to Google Fit', variant: 'destructive' });
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 pb-12">
      <div className="appbar">
        <div className="appbar-inner">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full grid place-items-center bg-zebby-amber text-zebby-slate">🦓</div>
            <div className="font-display text-xl">Zebby — Health Data Import</div>
          </div>
          <button 
            onClick={syncNow} 
            className="btn btn-primary disabled:opacity-60" 
            disabled={syncMutation.isPending}
            data-testid="button-sync"
          >
            {syncMutation.isPending ? 'Syncing…' : 'Sync now'}
          </button>
        </div>
      </div>

      {/* Backdrop banner */}
      <div className="mt-6 rounded-2xl skyback p-1">
        <div className="tile bg-white/80 dark:bg-white/10">
          <div className="section-h">
            <div className="section-t">Sources</div>
            <div className="flex gap-2">
              <span className={`badge ${(() => {
                const hasAnyOk = s.googleFit.status === 'ok' || s.appleHealth.status === 'ok';
                const hasAnySyncing = s.googleFit.status === 'syncing' || s.appleHealth.status === 'syncing';
                const hasAnyWarn = s.googleFit.status === 'warn' || s.appleHealth.status === 'warn';
                const allIdle = s.googleFit.status === 'idle' && s.appleHealth.status === 'idle';
                
                if (hasAnySyncing) return 'badge-info';
                if (hasAnyOk && !hasAnyWarn) return 'badge-ok';
                if (hasAnyWarn) return 'badge-warn';
                return 'badge-info';
              })()}`} data-testid="status-badge">
                {(() => {
                  const hasAnySyncing = s.googleFit.status === 'syncing' || s.appleHealth.status === 'syncing';
                  const hasAnyOk = s.googleFit.status === 'ok' || s.appleHealth.status === 'ok';
                  const hasAnyWarn = s.googleFit.status === 'warn' || s.appleHealth.status === 'warn';
                  const allIdle = s.googleFit.status === 'idle' && s.appleHealth.status === 'idle';
                  
                  if (hasAnySyncing) return 'Syncing...';
                  if (hasAnyOk && !hasAnyWarn) return 'Up to date';
                  if (hasAnyWarn) return 'Needs attention';
                  return 'Idle';
                })()}
              </span>
            </div>
          </div>

          {/* Sources grid */}
          <div className="grid md:grid-cols-2 gap-4">
            <SourceCard
              icon="🟢" 
              title="Google Fit"
              enabled={s.googleFit.enabled}
              lastSync={s.googleFit.lastSync}
              onToggle={(enabled) => {
                if (enabled && !s.googleFit.enabled) {
                  connectGoogleFit();
                } else {
                  const googleFitSource = sources?.find(s => s.source === 'google_fit');
                  if (googleFitSource) {
                    toggleSourceMutation.mutate({ sourceId: googleFitSource.id, enabled });
                  }
                }
              }}
              description="Import heart rate, steps & sleep. Toggle on to include in Zebby."
              testId="source-google-fit"
            />
            <AppleHealthCard
              enabled={s.appleHealth.enabled}
              lastSync={s.appleHealth.lastSync}
              onToggle={(enabled) => {
                const appleHealthSource = sources?.find(s => s.source === 'apple_health');
                if (appleHealthSource) {
                  toggleSourceMutation.mutate({ sourceId: appleHealthSource.id, enabled });
                }
              }}
              onFileUpload={(file) => appleHealthUploadMutation.mutate(file)}
              uploading={appleHealthUploadMutation.isPending}
              testId="source-apple-health"
            />
          </div>
        </div>
      </div>

      {/* Privacy & scope */}
      <div className="mt-6 grid md:grid-cols-3 gap-4">
        <div className="tile">
          <div className="section-t text-lg">Privacy-first</div>
          <p className="opacity-80 text-sm">You control sources. Imports run locally on your account; Zebby doesn't share data.</p>
        </div>
        <div className="tile">
          <div className="section-t text-lg">Conflict rules</div>
          <p className="opacity-80 text-sm">We avoid duplicates, and newer records win unless you approve otherwise.</p>
        </div>
        <div className="tile">
          <div className="section-t text-lg">Manual review</div>
          <p className="opacity-80 text-sm">Potential conflicts go to a queue for your approval (see below).</p>
        </div>
      </div>

      <ReviewQueuePreview />
    </div>
  );
}

function SourceCard({
  icon, title, description, enabled, lastSync, onToggle, testId
}: { 
  icon: string; 
  title: string; 
  description: string; 
  enabled: boolean; 
  lastSync?: string;
  onToggle: (v: boolean) => void;
  testId?: string;
}) {
  return (
    <div className="tile" data-testid={testId}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl grid place-items-center bg-white/80 dark:bg-white/10 text-2xl">
            {icon}
          </div>
          <div>
            <div className="font-display text-xl" data-testid={`text-${testId}-title`}>{title}</div>
            <div className="text-sm opacity-80" data-testid={`text-${testId}-description`}>{description}</div>
            {lastSync && (
              <div className="text-xs opacity-60 mt-1" data-testid={`text-${testId}-lastsync`}>
                Last sync: {new Date(lastSync).toLocaleDateString()}
              </div>
            )}
          </div>
        </div>
        <button
          onClick={() => onToggle(!enabled)}
          className={`switch ${enabled ? '' : 'switch-off'}`}
          aria-pressed={enabled}
          data-testid={`toggle-${testId}`}
        >
          <span className={`knob ${enabled ? 'knob-on' : ''}`} />
        </button>
      </div>
    </div>
  );
}

function AppleHealthCard({
  enabled, lastSync, onToggle, onFileUpload, uploading, testId
}: { 
  enabled: boolean; 
  lastSync?: string;
  onToggle: (v: boolean) => void;
  onFileUpload: (file: File) => void;
  uploading: boolean;
  testId?: string;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.name.endsWith('.zip')) {
        onFileUpload(file);
      } else {
        alert('Please select a ZIP file from your Apple Health export');
      }
    }
  };

  return (
    <div className="tile" data-testid={testId}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-2xl grid place-items-center bg-white/80 dark:bg-white/10 text-2xl">
            🟣
          </div>
          <div>
            <div className="font-display text-xl" data-testid={`text-${testId}-title`}>Apple Health</div>
            <div className="text-sm opacity-80" data-testid={`text-${testId}-description`}>
              Import HR, sleep, and activity summaries (via your device export).
            </div>
            {lastSync && (
              <div className="text-xs opacity-60 mt-1" data-testid={`text-${testId}-lastsync`}>
                Last upload: {new Date(lastSync).toLocaleDateString()}
              </div>
            )}
          </div>
        </div>
        <button
          onClick={() => onToggle(!enabled)}
          className={`switch ${enabled ? '' : 'switch-off'}`}
          aria-pressed={enabled}
          data-testid={`toggle-${testId}`}
        >
          <span className={`knob ${enabled ? 'knob-on' : ''}`} />
        </button>
      </div>
      
      {/* File upload section */}
      <div className="border-t border-zebby-sky/20 dark:border-white/10 pt-3">
        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            onChange={handleFileChange}
            className="hidden"
            data-testid={`input-${testId}-file`}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="btn btn-ghost text-sm disabled:opacity-60"
            data-testid={`button-${testId}-upload`}
          >
            {uploading ? 'Uploading...' : 'Upload Health Data'}
          </button>
          <div className="text-xs opacity-70">
            Export from Apple Health app as ZIP
          </div>
        </div>
      </div>
    </div>
  );
}

function ReviewQueuePreview() {
  const { data: conflicts = [] } = useQuery({
    queryKey: ['/api/import-conflicts']
  });

  const pending = Array.isArray(conflicts) ? conflicts.length : 0;

  return (
    <div className="mt-8">
      <div className="section-h">
        <div className="section-t">Review queue</div>
        <a href="/import/review" className="btn btn-ghost" data-testid="link-review-queue">
          Open queue
        </a>
      </div>
      <div className="tile">
        {pending === 0 ? (
          <div className="text-center py-12" data-testid="no-conflicts">
            <div className="text-5xl mb-3">🎉</div>
            <div className="font-semibold">No pending items</div>
            <div className="opacity-70 text-sm">You're all caught up.</div>
          </div>
        ) : (
          <div className="space-y-3">
            {Array.isArray(conflicts) && conflicts.slice(0, 2).map((conflict: any) => (
              <div key={conflict.id} className="row" data-testid={`conflict-preview-${conflict.id}`}>
                <div className="col-span-2">
                  <span className={`badge ${conflict.conflictReason === 'similar_time' ? 'badge-warn' : 'badge-info'}`}>
                    {conflict.conflictReason === 'similar_time' ? 'Conflict' : 'Duplicate?'}
                  </span>
                </div>
                <div className="col-span-5">
                  <div className="font-semibold">{conflict.dataType} data</div>
                  <div className="text-xs opacity-70">
                    {conflict.source} vs Existing data
                  </div>
                </div>
                <div className="col-span-5 flex justify-end gap-2">
                  <button className="btn btn-ghost">Keep existing</button>
                  <button className="btn btn-primary">Replace</button>
                </div>
              </div>
            ))}
            <div className="mt-3 text-sm opacity-70" data-testid="pending-count">
              {pending} items pending review
            </div>
          </div>
        )}
      </div>
    </div>
  );
}