import Image from "next/image";

type BrandLogoProps = {
  size: number;
  className?: string;
  priority?: boolean;
};

export default function BrandLogo({ size, className, priority = false }: BrandLogoProps) {
  return (
    <Image
      src="/chamapulse-logo.png"
      alt="ChamaPulse logo"
      width={size}
      height={size}
      priority={priority}
      className={className}
    />
  );
}
