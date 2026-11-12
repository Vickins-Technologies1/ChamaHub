import Image from "next/image";

type BrandLogoProps = {
  size: number;
  className?: string;
  priority?: boolean;
};

export default function BrandLogo({ size, className, priority = false }: BrandLogoProps) {
  return (
    <Image
      src="/chamahub-logo.png"
      alt="ChamaHub"
      width={size}
      height={size}
      priority={priority}
      className={className}
    />
  );
}
