import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface ReactionsResponse {
  reactions: { emoji: string; count: number }[];
  userReactions: string[];
}

interface ReactionBarProps {
  postId: string;
  groupId: string;
}

const EMOJIS = ["❤️", "👍", "🙏"] as const;

export function ReactionBar({ postId, groupId }: ReactionBarProps) {
  const { toast } = useToast();
  const [optimisticReaction, setOptimisticReaction] = useState<string | null>(null);

  // Fetch reactions for this post
  const { data: reactionsData, isLoading } = useQuery<ReactionsResponse>({
    queryKey: ["/api/comments", postId, "reactions"],
    queryFn: async () => {
      const response = await fetch(`/api/comments/${postId}/reactions`);
      if (!response.ok) {
        if (response.status === 404) return { reactions: [], userReactions: [] };
        throw new Error("Failed to fetch reactions");
      }
      return response.json();
    },
  });

  // Toggle reaction mutation
  const toggleReaction = useMutation({
    mutationFn: async (emoji: string) => {
      return apiRequest("POST", `/api/comments/${postId}/reactions`, { emoji });
    },
    onMutate: async (emoji: string) => {
      setOptimisticReaction(emoji);
      await queryClient.cancelQueries({ queryKey: ["/api/comments", postId, "reactions"] });
    },
    onSuccess: () => {
      // Invalidate reactions and posts queries
      queryClient.invalidateQueries({ queryKey: ["/api/comments", postId, "reactions"] });
      queryClient.invalidateQueries({ queryKey: [`/api/posts?groupId=${groupId}`] });
    },
    onError: (error: any) => {
      if (error.statusCode === 429) {
        toast({
          title: "Rate limit reached",
          description: "You've reacted too many times. Please try again later.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: error.message || "Failed to toggle reaction",
          variant: "destructive",
        });
      }
    },
    onSettled: () => {
      setOptimisticReaction(null);
    },
  });

  const handleReactionClick = (emoji: string) => {
    toggleReaction.mutate(emoji);
  };

  // Helper functions
  const getCount = (emoji: string) => {
    const reaction = reactionsData?.reactions.find((r) => r.emoji === emoji);
    return reaction?.count || 0;
  };

  const hasUserReacted = (emoji: string) => {
    return reactionsData?.userReactions.includes(emoji) || false;
  };

  if (isLoading) {
    return (
      <div className="flex gap-1 items-center" data-testid={`reaction-bar-loading-${postId}`}>
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex gap-1.5 items-center flex-wrap" data-testid={`reaction-bar-${postId}`}>
      {EMOJIS.map((emoji) => {
        const isUserReacted = hasUserReacted(emoji);
        const count = getCount(emoji);
        const isOptimistic = optimisticReaction === emoji;

        return (
          <Button
            key={emoji}
            variant={isUserReacted ? "default" : "outline"}
            size="sm"
            className={`h-8 px-3 gap-1.5 transition-all ${
              isUserReacted ? "bg-primary text-primary-foreground" : ""
            }`}
            onClick={() => handleReactionClick(emoji)}
            disabled={toggleReaction.isPending && isOptimistic}
            data-testid={`button-react-${emoji}-${postId}`}
          >
            {isOptimistic && toggleReaction.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <span className="text-base leading-none">{emoji}</span>
            )}
            {count > 0 && (
              <span 
                className="text-xs font-medium"
                data-testid={`text-react-count-${emoji}-${postId}`}
              >
                {count}
              </span>
            )}
          </Button>
        );
      })}
    </div>
  );
}
