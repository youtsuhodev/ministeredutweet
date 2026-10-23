import { useState } from 'react';

interface LazyImageProps {
  src: string;
  alt: string;
  className?: string;
}

export default function LazyImage({ src, alt, className = '' }: LazyImageProps) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div className="relative">
      {!loaded && (
        <div className="absolute inset-0 bg-[var(--bg-tertiary)] animate-pulse" aria-hidden="true" />
      )}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        className={`w-full transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'} ${className}`}
      />
    </div>
  );
}
