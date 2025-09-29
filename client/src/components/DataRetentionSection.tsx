import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { 
  Trash2, Shield, Clock, Calendar, 
  Heart, Moon, Brain, FileText, 
  AlertTriangle, Settings 
} from "lucide-react";

interface DataRetentionProps {
  isAuthenticated: boolean;
}

interface DataStats {
  symptomLogs: { count: number; oldestDate: string | null };
  vitalsLogs: { count: number; oldestDate: string | null };
  sleepLogs: { count: number; oldestDate: string | null };
  aiInteractions: { count: number; oldestDate: string | null };
  totalSize: string;
}

interface RetentionSettings {
  symptomLogsRetentionMonths: number;
  vitalsLogsRetentionMonths: number;
  sleepLogsRetentionMonths: number;
  aiInteractionsRetentionMonths: number;
}

const retentionOptions = [
  { value: 6, label: "6 months" },
  { value: 12, label: "1 year" },
  { value: 24, label: "2 years" },
  { value: 36, label: "3 years" },
  { value: 60, label: "5 years" },
  { value: -1, label: "Keep forever" },
];

const dataTypes = [
  {
    key: "symptomLogsRetentionMonths" as keyof RetentionSettings,
    label: "Symptom Logs",
    icon: Calendar,
    description: "Your daily symptom tracking data",
    dataKey: "symptomLogs" as keyof DataStats,
    default: 36
  },
  {
    key: "vitalsLogsRetentionMonths" as keyof RetentionSettings,
    label: "Vitals Data", 
    icon: Heart,
    description: "Heart rate, blood pressure, weight data",
    dataKey: "vitalsLogs" as keyof DataStats,
    default: 36
  },
  {
    key: "sleepLogsRetentionMonths" as keyof RetentionSettings,
    label: "Sleep Data",
    icon: Moon,
    description: "Sleep tracking and quality data",
    dataKey: "sleepLogs" as keyof DataStats,
    default: 36
  },
  {
    key: "aiInteractionsRetentionMonths" as keyof RetentionSettings,
    label: "AI Conversations",
    icon: Brain,
    description: "Your conversations with Zebby",
    dataKey: "aiInteractions" as keyof DataStats,
    default: 24
  }
];

export function DataRetentionSection({ isAuthenticated }: DataRetentionProps) {
  const { toast } = useToast();
  const [isUpdating, setIsUpdating] = useState(false);
  const [isCleaningUp, setIsCleaningUp] = useState(false);

  // Fetch current retention settings
  const { data: retentionSettings, isLoading: settingsLoading } = useQuery<RetentionSettings>({
    queryKey: ['/api/user/retention-settings'],
    enabled: isAuthenticated,
  });

  // Fetch data usage statistics
  const { data: dataStats, isLoading: statsLoading } = useQuery<DataStats>({
    queryKey: ['/api/user/data-stats'],
    enabled: isAuthenticated,
  });

  // Update retention settings mutation
  const updateRetentionMutation = useMutation({
    mutationFn: async (settings: RetentionSettings) => {
      return apiRequest("PUT", "/api/user/retention-settings", settings);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/user/retention-settings'] });
      toast({
        title: "Settings Updated",
        description: "Your data retention preferences have been saved.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update retention settings.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsUpdating(false);
    },
  });

  // Manual cleanup mutation
  const cleanupDataMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", "/api/user/cleanup-old-data");
    },
    onSuccess: (response: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/user/data-stats'] });
      toast({
        title: "Cleanup Complete",
        description: response?.message || "Old data has been cleaned up according to your retention settings.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Cleanup Failed",
        description: error.message || "Failed to clean up old data.",
        variant: "destructive",
      });
    },
    onSettled: () => {
      setIsCleaningUp(false);
    },
  });

  const handleRetentionChange = (type: keyof RetentionSettings, value: string) => {
    if (!retentionSettings) return;
    
    const updatedSettings = {
      ...retentionSettings,
      [type]: parseInt(value)
    };
    
    setIsUpdating(true);
    updateRetentionMutation.mutate(updatedSettings);
  };

  const handleManualCleanup = () => {
    setIsCleaningUp(true);
    cleanupDataMutation.mutate();
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "No data";
    return new Date(dateString).toLocaleDateString();
  };

  const getRetentionLabel = (months: number) => {
    const option = retentionOptions.find(opt => opt.value === months);
    return option?.label || `${months} months`;
  };

  if (!isAuthenticated) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Data Retention & Privacy
          </CardTitle>
          <CardDescription>
            Manage how long your health data is kept in Zebby
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              Sign in to manage your data retention preferences
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (settingsLoading || statsLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Data Retention & Privacy
          </CardTitle>
          <CardDescription>
            Manage how long your health data is kept in Zebby
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <div className="animate-pulse">
              <div className="h-4 bg-muted rounded w-3/4 mx-auto mb-4"></div>
              <div className="h-4 bg-muted rounded w-1/2 mx-auto"></div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Data Retention & Privacy
        </CardTitle>
        <CardDescription>
          Control how long your health data is stored and automatically clean up old records
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        
        {/* Data Usage Overview */}
        {dataStats && (
          <Card className="bg-muted/30">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Your Data Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {dataTypes.map((type) => {
                  const stats = dataStats[type.dataKey];
                  const Icon = type.icon;
                  return (
                    <div key={type.key} className="flex items-center justify-between p-3 bg-background rounded-lg">
                      <div className="flex items-center gap-3">
                        <Icon className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="font-medium text-sm">{type.label}</p>
                          <p className="text-xs text-muted-foreground">
                            Oldest: {formatDate(stats.oldestDate)}
                          </p>
                        </div>
                      </div>
                      <Badge variant="secondary" data-testid={`badge-count-${type.key}`}>
                        {stats.count.toLocaleString()} records
                      </Badge>
                    </div>
                  );
                })}
              </div>
              <div className="text-center pt-2">
                <Badge variant="outline" className="text-sm">
                  Total storage: {dataStats.totalSize}
                </Badge>
              </div>
            </CardContent>
          </Card>
        )}

        <Separator />

        {/* Retention Settings */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            <h3 className="text-lg font-semibold">Retention Settings</h3>
          </div>
          
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Data older than your retention period will be automatically deleted. 
              Export important data before setting shorter retention periods.
            </AlertDescription>
          </Alert>

          {retentionSettings && (
            <div className="space-y-4">
              {dataTypes.map((type) => {
                const Icon = type.icon;
                const currentValue = retentionSettings[type.key];
                return (
                  <div key={type.key} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <Icon className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{type.label}</p>
                        <p className="text-sm text-muted-foreground">{type.description}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline">
                        {getRetentionLabel(currentValue || type.default || 36)}
                      </Badge>
                      <Select
                        value={currentValue?.toString() || type.default?.toString() || "36"}
                        onValueChange={(value) => handleRetentionChange(type.key, value)}
                        disabled={isUpdating}
                      >
                        <SelectTrigger className="w-40" data-testid={`select-retention-${type.key}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {retentionOptions.map((option) => (
                            <SelectItem key={option.value} value={option.value.toString()}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <Separator />

        {/* Manual Cleanup */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Trash2 className="h-5 w-5" />
            <h3 className="text-lg font-semibold">Manual Data Cleanup</h3>
          </div>
          
          <div className="p-4 border rounded-lg space-y-4">
            <div>
              <p className="font-medium mb-2">Clean Up Old Data Now</p>
              <p className="text-sm text-muted-foreground mb-4">
                This will immediately delete data older than your retention settings. 
                This action cannot be undone.
              </p>
            </div>
            
            <Button
              onClick={handleManualCleanup}
              disabled={isCleaningUp}
              variant="destructive"
              data-testid="button-cleanup-data"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {isCleaningUp ? "Cleaning up..." : "Clean Up Old Data"}
            </Button>
          </div>
        </div>

        {/* Privacy Notice */}
        <div className="text-sm text-muted-foreground p-4 bg-muted rounded-lg space-y-2">
          <div className="flex items-center gap-2 font-medium">
            <Settings className="h-4 w-4" />
            Privacy & Data Control
          </div>
          <ul className="space-y-1 list-disc list-inside">
            <li>You have full control over your data retention periods</li>
            <li>Data is automatically cleaned up based on your settings</li>
            <li>All deleted data is permanently removed from our servers</li>
            <li>Export your data before adjusting retention settings if you want to keep copies</li>
            <li>Changes to retention settings take effect immediately for future cleanups</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}