import * as React from "react";
import { cn } from "@/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", asChild = false, ...props }, ref) => {
    // Swiss Design / Brutalist Styles
    const baseStyles = "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0";
    
    // Variant Styles
    const variants = {
      default: "bg-blue-700 text-white hover:bg-blue-800 border border-black shadow-[2px_2px_0px_0px_#000000] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none",
      destructive: "bg-red-600 text-white hover:bg-red-700 border border-black shadow-[2px_2px_0px_0px_#000000] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none",
      outline: "bg-transparent text-black border border-black hover:bg-gray-100 shadow-[2px_2px_0px_0px_#000000] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none",
      secondary: "bg-gray-200 text-black border border-black hover:bg-gray-300",
      ghost: "hover:bg-gray-100 text-black",
      link: "text-blue-700 underline-offset-4 hover:underline",
    };

    // Size Styles
    const sizes = {
      default: "h-10 px-6 py-2",
      sm: "h-8 px-3 text-xs",
      lg: "h-12 px-8",
      icon: "h-9 w-9",
    };

    const variantClass = variants[variant];
    const sizeClass = sizes[size];

    return (
      <button
        ref={ref}
        className={cn(baseStyles, variantClass, sizeClass, className)}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };
