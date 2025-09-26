import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

type Conflict = {
  id: string;
  userId: string;
  source: string;
  dataType: 'vitals' | 'sleep';
  existingDataId: string;
  importData: any;
  conflictReason: 'duplicate' | 'similar_time' | 'different_values';
  status: 'pending' | 'resolved';
  createdAt: string;
};

export default function ImportReviewQueue() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: conflicts = [], isLoading } = useQuery({
    queryKey: ['/api/import-conflicts'],
    select: (data: Conflict[]) => data.filter(c => c.status === 'pending')
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: string }) => {
      return await apiRequest(`/api/import-conflicts/${id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ resolution: action }),
        headers: {
          'Content-Type': 'application/json'
        }
      });
    },
    onSuccess: () => {
      toast({ title: 'Conflict resolved', description: 'The data conflict has been handled' });
      queryClient.invalidateQueries({ queryKey: ['/api/import-conflicts'] });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to resolve conflict', variant: 'destructive' });
    }
  });

  async function resolve(id: string, action: 'keep_existing' | 'replace' | 'merge' | 'drop') {
    resolveMutation.mutate({ id, action });
  }

  function getDisplayName(conflict: Conflict) {
    if (conflict.dataType === 'vitals') {
      const data = conflict.importData;
      if (data.type) {
        return `${data.type.replace('_', ' ')} (${data.value} ${data.unit})`;
      }
      return 'Vitals data';
    } else if (conflict.dataType === 'sleep') {
      const data = conflict.importData;
      if (data.totalMinutes) {
        const hours = Math.floor(data.totalMinutes / 60);
        const minutes = data.totalMinutes % 60;
        return `Sleep (${hours}h ${minutes}m)`;
      }
      return 'Sleep data';
    }
    return 'Health data';
  }

  function getSourceDisplayName(source: string) {
    switch (source) {
      case 'google_fit': return 'Google Fit';
      case 'apple_health': return 'Apple Health';
      default: return source;
    }
  }

  function getConflictType(reason: string) {
    switch (reason) {
      case 'similar_time': return { type: 'conflict', label: 'Time Conflict' };
      case 'duplicate': return { type: 'duplicate', label: 'Duplicate' };
      case 'different_values': return { type: 'conflict', label: 'Value Conflict' };
      default: return { type: 'conflict', label: 'Conflict' };
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-6xl mx-auto px-4 pb-14">
        <div className="appbar">
          <div className="appbar-inner">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-full grid place-items-center bg-zebby-amber text-zebby-slate">🦓</div>
              <div className="font-display text-xl">Zebby — Review queue</div>
            </div>
          </div>
        </div>
        <div className="mt-6 text-center">Loading conflicts...</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 pb-14">
      <div className="appbar">
        <div className="appbar-inner">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full grid place-items-center bg-zebby-amber text-zebby-slate">🦓</div>
            <div className="font-display text-xl">Zebby — Review queue</div>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl skyback p-1">
        <div className="tile bg-white/85 dark:bg-white/10">
          {conflicts.length === 0 ? (
            <div className="text-center py-12" data-testid="no-conflicts">
              <div className="text-5xl mb-3">🎉</div>
              <div className="font-semibold">No pending items</div>
              <div className="opacity-70 text-sm">You're all caught up.</div>
            </div>
          ) : (
            <div className="space-y-3">
              {conflicts.map((conflict) => {
                const displayName = getDisplayName(conflict);
                const sourceDisplay = getSourceDisplayName(conflict.source);
                const conflictInfo = getConflictType(conflict.conflictReason);
                
                return (
                  <div key={conflict.id} className="row" data-testid={`conflict-${conflict.id}`}>
                    <div className="col-span-2">
                      <span className={`badge ${conflictInfo.type === 'conflict' ? 'badge-warn' : 'badge-info'}`}>
                        {conflictInfo.label}
                      </span>
                    </div>
                    <div className="col-span-6">
                      <div className="font-semibold" data-testid={`conflict-title-${conflict.id}`}>
                        {displayName}
                      </div>
                      <div className="text-xs opacity-70" data-testid={`conflict-details-${conflict.id}`}>
                        Incoming ({sourceDisplay}) • {new Date(conflict.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="col-span-4 flex justify-end gap-2">
                      {conflictInfo.type === 'conflict' ? (
                        <>
                          <button 
                            onClick={() => resolve(conflict.id, 'keep_existing')} 
                            className="btn btn-ghost"
                            disabled={resolveMutation.isPending}
                            data-testid={`button-keep-${conflict.id}`}
                          >
                            Keep existing
                          </button>
                          <button 
                            onClick={() => resolve(conflict.id, 'replace')} 
                            className="btn btn-primary"
                            disabled={resolveMutation.isPending}
                            data-testid={`button-replace-${conflict.id}`}
                          >
                            Replace
                          </button>
                        </>
                      ) : (
                        <>
                          <button 
                            onClick={() => resolve(conflict.id, 'merge')} 
                            className="btn btn-ghost"
                            disabled={resolveMutation.isPending}
                            data-testid={`button-merge-${conflict.id}`}
                          >
                            Merge
                          </button>
                          <button 
                            onClick={() => resolve(conflict.id, 'drop')} 
                            className="btn btn-primary"
                            disabled={resolveMutation.isPending}
                            data-testid={`button-drop-${conflict.id}`}
                          >
                            Keep one
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
              <div className="text-sm opacity-70" data-testid="total-conflicts">
                Total: {conflicts.length} items
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Back to settings */}
      <div className="mt-6 text-center">
        <a href="/settings" className="btn btn-ghost" data-testid="link-back-settings">
          ← Back to Import Settings
        </a>
      </div>
    </div>
  );
}