import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Send, X, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ZebbyAvatarProps {
  className?: string;
}

export default function ZebbyAvatar({ className = "" }: ZebbyAvatarProps) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [reply, setReply] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  async function send(entryContext?: any) {
    if (!msg.trim()) {
      toast({
        title: "Message Required",
        description: "Please enter a message to send to Zebby.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: msg, entryContext }),
      });

      if (!response.ok) {
        if (response.status === 404) {
          toast({
            title: "Feature Disabled",
            description: "Zebby Avatar is currently disabled.",
            variant: "destructive",
          });
          return;
        }
        throw new Error("Failed to send message");
      }

      const data = await response.json();
      setReply(data.reply || "");
      setMsg("");
    } catch (error) {
      console.error("Error sending message to Zebby:", error);
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        className={`fixed bottom-4 right-4 h-14 w-14 rounded-full text-2xl shadow-lg hover:shadow-xl transition-all ${className}`}
        onClick={() => setOpen(true)}
        data-testid="button-zebby-avatar"
        size="icon"
      >
        🦓
      </Button>

      {open && (
        <Card
          className="fixed bottom-20 right-4 w-96 max-w-[92vw] shadow-xl z-50"
          data-testid="card-zebby-chat"
        >
          <CardHeader className="pb-3">
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="text-xl">Ask Zebby</CardTitle>
                <CardDescription className="text-xs">
                  Your empathetic EDS companion
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setOpen(false);
                  setReply(null);
                }}
                data-testid="button-close-zebby"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              className="min-h-[100px] resize-none"
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              placeholder="Ask about your logs, trends, or ideas…"
              data-testid="textarea-zebby-message"
              disabled={loading}
            />
            <div className="flex justify-end">
              <Button
                onClick={() => send()}
                disabled={loading || !msg.trim()}
                data-testid="button-send-zebby"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Thinking...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Send
                  </>
                )}
              </Button>
            </div>

            {reply && (
              <div
                className="mt-3 p-3 bg-muted rounded-lg text-sm"
                data-testid="text-zebby-reply"
              >
                {reply}
              </div>
            )}

            <p className="text-xs text-muted-foreground mt-2">
              Informational only — not medical advice.
            </p>
          </CardContent>
        </Card>
      )}
    </>
  );
}
