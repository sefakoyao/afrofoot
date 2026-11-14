import Image from 'next/image';

export const Logo = ({ size = 40 }: { size?: number }) => (
  <Image src="/afc-logo.png" alt="Afro Foot Club" width={size} height={size} priority className="shrink-0" />
);
