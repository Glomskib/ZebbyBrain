interface ZebbyAvatarProps {
  size?: "small" | "medium" | "large";
  className?: string;
}

export default function ZebbyAvatar({ size = "medium", className = "" }: ZebbyAvatarProps) {
  const sizeClasses = {
    small: "w-8 h-8",
    medium: "w-16 h-16",
    large: "w-32 h-32"
  };

  const emojiSizes = {
    small: "text-lg",
    medium: "text-4xl", 
    large: "text-8xl"
  };

  return (
    <div 
      className={`${sizeClasses[size]} bg-primary rounded-full flex items-center justify-center shadow-lg ${
        size === "large" ? "floating-animation" : ""
      } ${className}`}
      data-testid={`zebby-avatar-${size}`}
    >
      <span className={emojiSizes[size]}>🦓</span>
    </div>
  );
}
