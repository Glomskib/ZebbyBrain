import zebbyAvatarImage from "@/assets/zebby-avatar.png";

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

  return (
    <div 
      className={`${sizeClasses[size]} bg-white rounded-full flex items-center justify-center shadow-lg border-2 border-white ${
        size === "large" ? "floating-animation" : ""
      } ${className}`}
      data-testid={`zebby-avatar-${size}`}
    >
      <img 
        src={zebbyAvatarImage} 
        alt="Zebby the friendly zebra"
        className={`${sizeClasses[size]} object-contain rounded-full`}
      />
    </div>
  );
}
