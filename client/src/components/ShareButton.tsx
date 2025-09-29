import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Share2 } from "lucide-react";
import ShareDialog from "./ShareDialog";

interface ShareButtonProps {
  contentType: "symptom_trends" | "health_summary" | "ai_insights" | "product_review" | "achievement" | "custom";
  contentData: Record<string, any>;
  contentSnapshot: Record<string, any>;
  dateRangeStart?: Date;
  dateRangeEnd?: Date;
  variant?: "default" | "outline" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  children?: React.ReactNode;
}

export default function ShareButton({
  contentType,
  contentData,
  contentSnapshot,
  dateRangeStart,
  dateRangeEnd,
  variant = "outline",
  size = "sm",
  className = "",
  children
}: ShareButtonProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={() => setDialogOpen(true)}
        className={`gap-2 ${className}`}
        data-testid="button-share-trigger"
      >
        <Share2 className="h-4 w-4" />
        {children || "Share"}
      </Button>

      <ShareDialog
        contentType={contentType}
        contentData={contentData}
        contentSnapshot={contentSnapshot}
        dateRangeStart={dateRangeStart}
        dateRangeEnd={dateRangeEnd}
        isOpen={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </>
  );
}