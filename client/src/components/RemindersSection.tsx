import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Bell, Clock, Pill, Droplets, AlertCircle, Edit, Trash2, Play, Pause, MoreHorizontal } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

// Zod schema for form validation
const reminderFormSchema = z.object({
  type: z.enum(["medication", "hydration", "posture", "custom"]),
  label: z.string().min(1, "Label is required"),
  description: z.string().optional(),
  timeOfDay: z.string().min(1, "Time is required"),
  frequency: z.enum(["daily", "weekly", "custom"]).default("daily"),
  weekDays: z.array(z.string()).optional(),
  channelEmail: z.boolean().default(true),
  channelInApp: z.boolean().default(true),
  medicationName: z.string().optional(),
  dosage: z.string().optional(),
  instructions: z.string().optional(),
});

type ReminderFormData = z.infer<typeof reminderFormSchema>;

interface Reminder {
  id: string;
  type: string;
  label: string;
  description?: string;
  timeOfDay?: string;
  frequency: string;
  weekDays?: string[];
  channelEmail: boolean;
  channelInApp: boolean;
  isEnabled: boolean;
  isSnoozing: boolean;
  snoozeUntil?: string;
  nextScheduledAt?: string;
  lastSentAt?: string;
  medicationName?: string;
  dosage?: string;
  instructions?: string;
  createdAt: string;
  updatedAt: string;
}

export default function RemindersSection() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
  const { toast } = useToast();

  // Fetch reminders
  const { data: reminders = [], isLoading, error } = useQuery<Reminder[]>({
    queryKey: ['/api/reminders'],
    retry: false,
  });

  // Create reminder mutation
  const createReminderMutation = useMutation({
    mutationFn: async (data: ReminderFormData) => {
      const response = await fetch('/api/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to create reminder');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/reminders'] });
      setIsCreateDialogOpen(false);
      toast({ title: "Success", description: "Reminder created successfully" });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to create reminder",
        variant: "destructive" 
      });
    },
  });

  // Update reminder mutation
  const updateReminderMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<ReminderFormData> }) => {
      const response = await fetch(`/api/reminders/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error('Failed to update reminder');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/reminders'] });
      setEditingReminder(null);
      toast({ title: "Success", description: "Reminder updated successfully" });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to update reminder",
        variant: "destructive" 
      });
    },
  });

  // Delete reminder mutation
  const deleteReminderMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/reminders/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to delete reminder');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/reminders'] });
      toast({ title: "Success", description: "Reminder deleted successfully" });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Error", 
        description: error.message || "Failed to delete reminder",
        variant: "destructive" 
      });
    },
  });

  // Toggle reminder mutation
  const toggleReminderMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const response = await fetch(`/api/reminders/${id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ enabled }),
      });
      if (!response.ok) throw new Error('Failed to toggle reminder');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/reminders'] });
    },
  });

  // Snooze reminder mutation
  const snoozeReminderMutation = useMutation({
    mutationFn: async ({ id, snoozeUntil }: { id: string; snoozeUntil: Date }) => {
      const response = await fetch(`/api/reminders/${id}/snooze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ snoozeUntil: snoozeUntil.toISOString() }),
      });
      if (!response.ok) throw new Error('Failed to snooze reminder');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/reminders'] });
      toast({ title: "Success", description: "Reminder snoozed" });
    },
  });

  const form = useForm<ReminderFormData>({
    resolver: zodResolver(reminderFormSchema),
    defaultValues: {
      type: "medication",
      frequency: "daily",
      channelEmail: true,
      channelInApp: true,
    },
  });

  const editForm = useForm<ReminderFormData>({
    resolver: zodResolver(reminderFormSchema),
  });

  // Set form values when editing
  useEffect(() => {
    if (editingReminder) {
      editForm.reset({
        type: editingReminder.type as any,
        label: editingReminder.label,
        description: editingReminder.description || "",
        timeOfDay: editingReminder.timeOfDay || "",
        frequency: editingReminder.frequency as any,
        weekDays: editingReminder.weekDays || [],
        channelEmail: editingReminder.channelEmail,
        channelInApp: editingReminder.channelInApp,
        medicationName: editingReminder.medicationName || "",
        dosage: editingReminder.dosage || "",
        instructions: editingReminder.instructions || "",
      });
    }
  }, [editingReminder, editForm]);

  const onSubmit = (data: ReminderFormData) => {
    createReminderMutation.mutate(data);
  };

  const onEditSubmit = (data: ReminderFormData) => {
    if (editingReminder) {
      updateReminderMutation.mutate({ id: editingReminder.id, data });
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'medication': return <Pill className="w-4 h-4" />;
      case 'hydration': return <Droplets className="w-4 h-4" />;
      case 'posture': return <AlertCircle className="w-4 h-4" />;
      default: return <Bell className="w-4 h-4" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'medication': return 'bg-blue-500/10 text-blue-600 dark:text-blue-400';
      case 'hydration': return 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400';
      case 'posture': return 'bg-orange-500/10 text-orange-600 dark:text-orange-400';
      default: return 'bg-primary/10 text-primary';
    }
  };

  const formatTime = (timeString?: string) => {
    if (!timeString) return "";
    const [hours, minutes] = timeString.split(':');
    const date = new Date();
    date.setHours(parseInt(hours), parseInt(minutes));
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const snoozeFor = (reminder: Reminder, hours: number) => {
    const snoozeUntil = new Date();
    snoozeUntil.setHours(snoozeUntil.getHours() + hours);
    snoozeReminderMutation.mutate({ id: reminder.id, snoozeUntil });
  };

  if (isLoading) {
    return (
      <Card className="reminder-section">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Health Reminders
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-muted rounded animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="reminder-section border-destructive/20">
        <CardContent className="p-6 text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h3 className="font-semibold text-destructive mb-2">Unable to Load Reminders</h3>
          <p className="text-sm text-muted-foreground">
            Please try refreshing the page or contact support if the issue persists.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="reminder-section" data-testid="reminders-section">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Health Reminders
          </CardTitle>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" data-testid="button-create-reminder">
                <Plus className="h-4 w-4 mr-2" />
                Add Reminder
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Create New Reminder</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid="select-reminder-type">
                              <SelectValue placeholder="Select reminder type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="medication">💊 Medication</SelectItem>
                            <SelectItem value="hydration">💧 Hydration</SelectItem>
                            <SelectItem value="posture">🧘 Posture Check</SelectItem>
                            <SelectItem value="custom">⚡ Custom</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="label"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Label</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="e.g., Take morning vitamins" data-testid="input-reminder-label" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="timeOfDay"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Time</FormLabel>
                        <FormControl>
                          <Input {...field} type="time" data-testid="input-reminder-time" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {form.watch("type") === "medication" && (
                    <>
                      <FormField
                        control={form.control}
                        name="medicationName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Medication Name</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="e.g., Vitamin D" data-testid="input-medication-name" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="dosage"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Dosage</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="e.g., 2 tablets, 1000mg" data-testid="input-medication-dosage" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </>
                  )}

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Notes (Optional)</FormLabel>
                        <FormControl>
                          <Textarea {...field} placeholder="Additional instructions or notes" rows={2} data-testid="textarea-reminder-notes" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex items-center space-x-4">
                    <FormField
                      control={form.control}
                      name="channelEmail"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                          <FormControl>
                            <Checkbox 
                              checked={field.value} 
                              onCheckedChange={field.onChange}
                              data-testid="checkbox-email-notifications"
                            />
                          </FormControl>
                          <FormLabel className="text-sm">Email</FormLabel>
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="channelInApp"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-center space-x-2 space-y-0">
                          <FormControl>
                            <Checkbox 
                              checked={field.value} 
                              onCheckedChange={field.onChange}
                              data-testid="checkbox-inapp-notifications"
                            />
                          </FormControl>
                          <FormLabel className="text-sm">In-App</FormLabel>
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createReminderMutation.isPending} data-testid="button-save-reminder">
                      {createReminderMutation.isPending ? "Creating..." : "Create Reminder"}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>

      <CardContent>
        {reminders.length === 0 ? (
          <div className="text-center py-8">
            <Bell className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="font-semibold text-foreground mb-2">No Reminders Set</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Set up health reminders to stay on top of your EDS management routine.
            </p>
            <Button onClick={() => setIsCreateDialogOpen(true)} data-testid="button-first-reminder">
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Reminder
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {reminders.map((reminder) => (
              <div 
                key={reminder.id} 
                className={`flex items-center justify-between p-4 rounded-lg border transition-colors ${
                  reminder.isEnabled 
                    ? 'bg-card border-border' 
                    : 'bg-muted/50 border-muted-foreground/20'
                }`}
                data-testid={`reminder-card-${reminder.id}`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${getTypeColor(reminder.type)}`}>
                    {getTypeIcon(reminder.type)}
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium text-foreground">{reminder.label}</h4>
                      {reminder.isSnoozing && (
                        <Badge variant="secondary" className="text-xs">
                          <Clock className="w-3 h-3 mr-1" />
                          Snoozed
                        </Badge>
                      )}
                      {!reminder.isEnabled && (
                        <Badge variant="outline" className="text-xs">
                          Paused
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>{formatTime(reminder.timeOfDay)} • {reminder.frequency}</span>
                      {reminder.medicationName && (
                        <span>{reminder.medicationName} {reminder.dosage && `• ${reminder.dosage}`}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Switch
                    checked={reminder.isEnabled}
                    onCheckedChange={(enabled) => 
                      toggleReminderMutation.mutate({ id: reminder.id, enabled })
                    }
                    disabled={toggleReminderMutation.isPending}
                    data-testid={`switch-reminder-${reminder.id}`}
                  />
                  
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" data-testid={`menu-reminder-${reminder.id}`}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditingReminder(reminder)}>
                        <Edit className="h-4 w-4 mr-2" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => snoozeFor(reminder, 1)}>
                        <Clock className="h-4 w-4 mr-2" />
                        Snooze 1h
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => snoozeFor(reminder, 8)}>
                        <Clock className="h-4 w-4 mr-2" />
                        Snooze 8h
                      </DropdownMenuItem>
                      <DropdownMenuItem 
                        onClick={() => deleteReminderMutation.mutate(reminder.id)}
                        className="text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Edit Reminder Dialog */}
      <Dialog open={!!editingReminder} onOpenChange={(open) => !open && setEditingReminder(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Reminder</DialogTitle>
          </DialogHeader>
          {editingReminder && (
            <Form {...editForm}>
              <form onSubmit={editForm.handleSubmit(onEditSubmit)} className="space-y-4">
                <FormField
                  control={editForm.control}
                  name="label"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Label</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g., Take morning vitamins" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={editForm.control}
                  name="timeOfDay"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Time</FormLabel>
                      <FormControl>
                        <Input {...field} type="time" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setEditingReminder(null)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={updateReminderMutation.isPending}>
                    {updateReminderMutation.isPending ? "Updating..." : "Update Reminder"}
                  </Button>
                </div>
              </form>
            </Form>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}