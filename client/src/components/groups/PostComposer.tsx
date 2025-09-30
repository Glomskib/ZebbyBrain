import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

const MAX_CHARS = 1000;
const WARN_AT = 900;

interface PostComposerProps {
  groupId: string;
  onPosted: () => void;
}

export default function PostComposer({ groupId, onPosted }: PostComposerProps) {
  const draftKey = useMemo(() => `zebby_draft_g:${groupId}`, [groupId]);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const { toast } = useToast();

  // Restore draft on mount
  useEffect(() => {
    const savedDraft = localStorage.getItem(draftKey);
    if (savedDraft) {
      setValue(savedDraft);
    }
  }, [draftKey]);

  // Autosave draft with debounce
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (value.trim().length > 0) {
        localStorage.setItem(draftKey, value);
      } else {
        localStorage.removeItem(draftKey);
      }
    }, 300);
    return () => clearTimeout(timeoutId);
  }, [draftKey, value]);

  const createPostMutation = useMutation({
    mutationFn: async (body: string) => {
      return await apiRequest("POST", `/api/posts`, {
        groupId,
        body,
      });
    },
    onSuccess: () => {
      setValue("");
      setError(null);
      localStorage.removeItem(draftKey);
      toast({
        title: "Post created",
        description: "Your post has been shared with the group.",
      });
      onPosted();
      // Return focus to textarea for quick follow-up posts
      requestAnimationFrame(() => textareaRef.current?.focus());
    },
    onError: (err: any) => {
      // Handle 429 rate limit
      if (err?.statusCode === 429 || err?.status === 429 || err?.message?.includes("429")) {
        const rateLimitMessage = "You've hit the posting limit. Please try again later.";
        setError(rateLimitMessage);
        toast({
          title: "Posting limit reached",
          description: "You've posted too many times recently. Please try again later.",
          variant: "destructive",
        });
      } else {
        const errorMessage = err?.message || "Could not create post. Please try again.";
        setError(errorMessage);
        toast({
          title: "Failed to create post",
          description: errorMessage,
          variant: "destructive",
        });
      }
    },
  });

  function handleSubmit() {
    if (createPostMutation.isPending) return;
    
    setError(null);
    const trimmedBody = value.trim();
    
    if (!trimmedBody) {
      return;
    }
    
    if (trimmedBody.length > MAX_CHARS) {
      setError(`Too long by ${trimmedBody.length - MAX_CHARS} characters.`);
      return;
    }
    
    createPostMutation.mutate(trimmedBody);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Ctrl/Cmd+Enter → submit
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
      return;
    }
    
    // Esc → clear & blur
    if (e.key === "Escape") {
      e.preventDefault();
      setValue("");
      setError(null);
      textareaRef.current?.blur();
      return;
    }
    
    // Shift+Enter is handled by browser as newline, so nothing to do
  }

  function handleClear() {
    setValue("");
    setError(null);
  }

  const charCount = value.length;
  const isOverLimit = charCount > MAX_CHARS;
  const isNearLimit = charCount >= WARN_AT && !isOverLimit;
  const canSubmit = !createPostMutation.isPending && value.trim().length > 0 && !isOverLimit;

  return (
    <div className="border rounded-lg p-4 bg-card" data-testid="post-composer">
      <Label htmlFor="post-body" className="text-base font-semibold mb-2 block">
        Share something with your herd
      </Label>
      
      <Textarea
        id="post-body"
        ref={textareaRef}
        className="min-h-[96px] resize-y"
        placeholder="Share a win, ask a question, or offer a tip…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        aria-describedby="composer-help composer-count composer-status"
        disabled={createPostMutation.isPending}
        data-testid="textarea-post-body"
      />
      
      <div 
        id="composer-help" 
        className="text-xs text-muted-foreground mt-2"
        data-testid="text-composer-help"
      >
        Be kind. No medical advice or diagnoses. Avoid sharing personal identifiers.
      </div>
      
      <div className="mt-3 flex items-center justify-between gap-4">
        <div
          id="composer-count"
          className={`text-sm ${
            isNearLimit ? "text-amber-600 dark:text-amber-500" : ""
          } ${
            isOverLimit ? "text-destructive font-semibold" : ""
          }`}
          aria-live="polite"
          data-testid="text-char-count"
        >
          {charCount}/{MAX_CHARS}
          {isOverLimit && ` (over by ${charCount - MAX_CHARS})`}
          {isNearLimit && " (nearing limit)"}
        </div>
        
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleClear}
            disabled={createPostMutation.isPending || !value}
            data-testid="button-clear-post"
          >
            Clear (Esc)
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            data-testid="button-submit-post"
          >
            {createPostMutation.isPending ? "Posting…" : "Post (Ctrl/⌘+Enter)"}
          </Button>
        </div>
      </div>
      
      {error && (
        <div 
          id="composer-status" 
          className="text-sm text-destructive mt-2" 
          aria-live="polite"
          data-testid="text-composer-error"
        >
          {error}
        </div>
      )}
    </div>
  );
}
