import type { ButtonHTMLAttributes, ComponentPropsWithoutRef, ElementType, InputHTMLAttributes, ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "link";
};

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  return <button className={`ui-button ui-button-${variant} ${className}`.trim()} {...props} />;
}

type CardProps<T extends ElementType = "section"> = {
  as?: T;
  children: ReactNode;
  className?: string;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "children" | "className">;

export function Card<T extends ElementType = "section">({ as, children, className = "", ...props }: CardProps<T>) {
  const Component = (as ?? "section") as ElementType;
  return <Component className={`ui-card ${className}`.trim()} {...props}>{children}</Component>;
}

export function Input({ className = "", ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`ui-input ${className}`.trim()} {...props} />;
}

export function PageContainer({ className = "", ...props }: ComponentPropsWithoutRef<"main">) {
  return <main className={`ui-page ${className}`.trim()} {...props} />;
}
