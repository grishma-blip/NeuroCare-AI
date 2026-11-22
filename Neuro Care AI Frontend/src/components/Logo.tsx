interface LogoProps {
  className?: string;
  showText?: boolean;
  variant?: 'light' | 'dark';
  size?: 'sm' | 'md' | 'lg';
}

export function BrainIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      {/* Left hemisphere */}
      <path
        d="M22 10c-2.5-1.5-5.5-1.8-8-0.5-2 1-3.2 2.8-3.5 4.8-2 0.3-3.8 1.5-4.5 3.5-0.8 2.2-0.2 4.5 1.3 6.1-0.8 1.8-0.7 3.9 0.4 5.6 1 1.5 2.6 2.4 4.3 2.5 0.2 2.2 1.6 4.1 3.7 4.9 2.2 0.8 4.6 0.2 6.3-1.5V10z"
        fill="currentColor"
        opacity="0.9"
      />
      {/* Right hemisphere */}
      <path
        d="M26 10c2.5-1.5 5.5-1.8 8-0.5 2 1 3.2 2.8 3.5 4.8 2 0.3 3.8 1.5 4.5 3.5 0.8 2.2 0.2 4.5-1.3 6.1 0.8 1.8 0.7 3.9-0.4 5.6-1 1.5-2.6 2.4-4.3 2.5-0.2 2.2-1.6 4.1-3.7 4.9-2.2 0.8-4.6 0.2-6.3-1.5V10z"
        fill="currentColor"
        opacity="0.7"
      />
      {/* Neural connections - left */}
      <path d="M12 18c2 1 3 3 5 3.5M10 24c3 0.5 5 2 7 3.5M14 30c2-1 4-2 6-2.5" stroke="white" strokeWidth="0.8" strokeLinecap="round" opacity="0.5" />
      {/* Neural connections - right */}
      <path d="M36 18c-2 1-3 3-5 3.5M38 24c-3 0.5-5 2-7 3.5M34 30c-2-1-4-2-6-2.5" stroke="white" strokeWidth="0.8" strokeLinecap="round" opacity="0.5" />
      {/* Center division */}
      <line x1="24" y1="10" x2="24" y2="38" stroke="white" strokeWidth="0.6" opacity="0.3" />
      {/* Synapse dots */}
      <circle cx="17" cy="20" r="1" fill="white" opacity="0.6" />
      <circle cx="31" cy="20" r="1" fill="white" opacity="0.6" />
      <circle cx="15" cy="26" r="0.8" fill="white" opacity="0.5" />
      <circle cx="33" cy="26" r="0.8" fill="white" opacity="0.5" />
    </svg>
  );
}

export default function Logo({ className = '', showText = true, variant = 'dark', size = 'md' }: LogoProps) {
  const iconSize = size === 'sm' ? 'h-7 w-7' : size === 'lg' ? 'h-12 w-12' : 'h-9 w-9';
  const textSize = size === 'sm' ? 'text-base' : size === 'lg' ? 'text-2xl' : 'text-lg';
  const taglineSize = size === 'sm' ? 'text-2xs' : size === 'lg' ? 'text-xs' : 'text-2xs';

  const textColor = variant === 'dark' ? 'text-navy' : 'text-white';
  const subColor = variant === 'dark' ? 'text-navy-300' : 'text-white/60';

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div className={`${iconSize} text-powder flex-shrink-0`}>
        <BrainIcon className="h-full w-full" />
      </div>
      {showText && (
        <div className="leading-tight">
          <div className={`font-semibold tracking-tight ${textSize} ${textColor}`}>
            NeuroCare
          </div>
          <div className={`${taglineSize} ${subColor} font-medium tracking-wide`}>
            EEG Cognitive Monitoring
          </div>
        </div>
      )}
    </div>
  );
}
