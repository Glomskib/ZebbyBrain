import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Trash2, Download, Upload, AlertTriangle, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

export function AccountManagement() {
  const [backupPassphrase, setBackupPassphrase] = useState("");
  const [restorePassphrase, setRestorePassphrase] = useState("");
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [deleteToken, setDeleteToken] = useState<string | null>(null);
  const [undoToken, setUndoToken] = useState("");
  const { toast } = useToast();

  const isDeleteEnabled = import.meta.env.VITE_FF_DELETE_ACCOUNT === "true";
  const isBackupEnabled = import.meta.env.VITE_FF_BACKUP_RESTORE === "true";

  const deleteAccountMutation = useMutation({
    mutationFn: async (reason?: string) => {
      const response = await apiRequest("POST", "/api/account/delete", {
        reason
      });
      return response.json();
    },
    onSuccess: (data) => {
      setDeleteToken(data.deleteToken);
      toast({
        title: "Account Scheduled for Deletion",
        description: `Your account will be permanently deleted in 7 days. Save your recovery token: ${data.deleteToken}`,
        duration: 10000
      });
    },
    onError: (error: any) => {
      toast({
        title: "Deletion Failed",
        description: error.message || "Could not schedule account deletion",
        variant: "destructive"
      });
    }
  });

  const undoDeleteMutation = useMutation({
    mutationFn: async (token: string) => {
      const response = await apiRequest("POST", "/api/account/undo-delete", {
        token
      });
      return response.json();
    },
    onSuccess: () => {
      setDeleteToken(null);
      setUndoToken("");
      toast({
        title: "Account Restored",
        description: "Your account has been successfully restored.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Restoration Failed",
        description: error.message || "Invalid or expired token",
        variant: "destructive"
      });
    }
  });

  const downloadBackupMutation = useMutation({
    mutationFn: async (passphrase: string) => {
      const response = await apiRequest("POST", "/api/account/backup", {
        passphrase
      });
      
      if (!response.ok) {
        throw new Error('Backup failed');
      }
      
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `zebby_backup_${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(downloadUrl);
      
      return { ok: true };
    },
    onSuccess: () => {
      setBackupPassphrase("");
      toast({
        title: "Backup Downloaded",
        description: "Your encrypted backup has been downloaded successfully. Keep it and your passphrase safe!",
      });
    },
    onError: () => {
      toast({
        title: "Backup Failed",
        description: "Could not create backup. Please try again.",
        variant: "destructive"
      });
    }
  });

  const restoreBackupMutation = useMutation({
    mutationFn: async ({ file, passphrase }: { file: File; passphrase: string }) => {
      const reader = new FileReader();
      const fileBase64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      
      const response = await apiRequest("POST", "/api/account/restore", {
        file: fileBase64,
        passphrase
      });
      return response.json();
    },
    onSuccess: (data) => {
      setRestorePassphrase("");
      setRestoreFile(null);
      toast({
        title: "Restore Preview",
        description: `This backup contains: ${data.stats.symptomLogs} symptom logs, ${data.stats.symptomEntries} entries, ${data.stats.sleepLogs} sleep logs, ${data.stats.aiInteractions} AI interactions.`,
      });
    },
    onError: () => {
      toast({
        title: "Restore Failed",
        description: "Invalid passphrase or corrupted backup file.",
        variant: "destructive"
      });
    }
  });

  if (!isDeleteEnabled && !isBackupEnabled) {
    return null;
  }

  return (
    <div className="space-y-6">
      {isBackupEnabled && (
        <>
          <Card data-testid="backup-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="h-5 w-5" />
                Backup Your Data
              </CardTitle>
              <CardDescription>
                Download an encrypted backup of all your health data
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="backup-passphrase">Passphrase (min 8 characters)</Label>
                <Input
                  id="backup-passphrase"
                  type="password"
                  value={backupPassphrase}
                  onChange={(e) => setBackupPassphrase(e.target.value)}
                  placeholder="Choose a strong passphrase"
                  data-testid="input-backup-passphrase"
                />
                <p className="text-sm text-muted-foreground">
                  Remember this passphrase - you'll need it to restore your backup
                </p>
              </div>
              <Button
                onClick={() => downloadBackupMutation.mutate(backupPassphrase)}
                disabled={backupPassphrase.length < 8 || downloadBackupMutation.isPending}
                className="w-full"
                data-testid="button-download-backup"
              >
                <Download className="h-4 w-4 mr-2" />
                {downloadBackupMutation.isPending ? "Creating Backup..." : "Download Encrypted Backup"}
              </Button>
            </CardContent>
          </Card>

          <Card data-testid="restore-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Restore from Backup
              </CardTitle>
              <CardDescription>
                Upload and decrypt a previous backup
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="restore-file">Backup File</Label>
                <Input
                  id="restore-file"
                  type="file"
                  accept=".zip"
                  onChange={(e) => setRestoreFile(e.target.files?.[0] || null)}
                  data-testid="input-restore-file"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="restore-passphrase">Passphrase</Label>
                <Input
                  id="restore-passphrase"
                  type="password"
                  value={restorePassphrase}
                  onChange={(e) => setRestorePassphrase(e.target.value)}
                  placeholder="Enter your backup passphrase"
                  data-testid="input-restore-passphrase"
                />
              </div>
              <Button
                onClick={() => restoreFile && restoreBackupMutation.mutate({ file: restoreFile, passphrase: restorePassphrase })}
                disabled={!restoreFile || restorePassphrase.length < 8 || restoreBackupMutation.isPending}
                className="w-full"
                variant="outline"
                data-testid="button-restore-backup"
              >
                <Upload className="h-4 w-4 mr-2" />
                {restoreBackupMutation.isPending ? "Restoring..." : "Preview Restore"}
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      {isDeleteEnabled && (
        <Card data-testid="delete-account-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Delete Account
            </CardTitle>
            <CardDescription>
              Permanently delete your account and all data (7-day recovery window)
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {deleteToken ? (
              <Alert data-testid="alert-delete-pending">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-2">
                    <p><strong>Your account is scheduled for deletion</strong></p>
                    <p className="text-sm">Recovery token: <code className="bg-muted px-2 py-1 rounded">{deleteToken}</code></p>
                    <p className="text-sm">Save this token! You have 7 days to undo this action.</p>
                  </div>
                </AlertDescription>
              </Alert>
            ) : null}
            
            {!deleteToken ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button 
                    variant="destructive" 
                    className="w-full"
                    data-testid="button-delete-account"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete My Account
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will schedule your account for permanent deletion in 7 days. You'll receive a recovery token to undo this action within that time. After 7 days, all your data will be permanently deleted and cannot be recovered.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deleteAccountMutation.mutate(undefined)}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      data-testid="button-confirm-delete"
                    >
                      Yes, Delete My Account
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="undo-token">Recovery Token</Label>
                <Input
                  id="undo-token"
                  type="text"
                  value={undoToken}
                  onChange={(e) => setUndoToken(e.target.value)}
                  placeholder="Enter your recovery token"
                  data-testid="input-undo-token"
                />
                <Button
                  onClick={() => undoDeleteMutation.mutate(undoToken)}
                  disabled={!undoToken || undoDeleteMutation.isPending}
                  className="w-full"
                  variant="outline"
                  data-testid="button-undo-delete"
                >
                  <Check className="h-4 w-4 mr-2" />
                  {undoDeleteMutation.isPending ? "Restoring..." : "Undo Deletion"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
