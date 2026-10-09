export function BugIcon({ className = "h-12 w-12" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g className="bug-wiggle">
        <path
          d="M12 4C10.3431 4 9 5.34315 9 7V8H15V7C15 5.34315 13.6569 4 12 4Z"
          fill="currentColor"
          opacity="0.3"
        />
        <ellipse cx="12" cy="14" rx="6" ry="7" fill="currentColor" />
        <circle cx="10" cy="12" r="1" fill="white" />
        <circle cx="14" cy="12" r="1" fill="white" />
        <path d="M6 11L4 9M18 11L20 9M6 15L4 17M18 15L20 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </g>
    </svg>
  );
}

export function CheckBugIcon({ className = "h-12 w-12" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="12" cy="14" rx="6" ry="7" fill="#10b981" opacity="0.2" />
      <path
        d="M12 4C10.3431 4 9 5.34315 9 7V8H15V7C15 5.34315 13.6569 4 12 4Z"
        fill="#10b981"
        opacity="0.4"
      />
      <circle cx="12" cy="14" r="6" fill="#10b981" />
      <path d="M9 14L11 16L15 12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 11L4 9M18 11L20 9M6 15L4 17M18 15L20 17" stroke="#10b981" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function ReturnBugIcon({ className = "h-12 w-12" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="12" cy="14" rx="6" ry="7" fill="#3b82f6" opacity="0.2" />
      <path
        d="M12 4C10.3431 4 9 5.34315 9 7V8H15V7C15 5.34315 13.6569 4 12 4Z"
        fill="#3b82f6"
        opacity="0.4"
      />
      <circle cx="12" cy="14" r="6" fill="#3b82f6" />
      <path
        d="M15 14H10M10 14L12 12M10 14L12 16"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M6 11L4 9M18 11L20 9M6 15L4 17M18 15L20 17" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function WarningBugIcon({ className = "h-12 w-12" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="12" cy="14" rx="6" ry="7" fill="#ef4444" opacity="0.2" />
      <path
        d="M12 4C10.3431 4 9 5.34315 9 7V8H15V7C15 5.34315 13.6569 4 12 4Z"
        fill="#ef4444"
        opacity="0.4"
      />
      <circle cx="12" cy="14" r="6" fill="#ef4444" />
      <path d="M12 11V14M12 16.5V17" stroke="white" strokeWidth="2" strokeLinecap="round" />
      <path d="M6 11L4 9M18 11L20 9M6 15L4 17M18 15L20 17" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function ClockBugIcon({ className = "h-12 w-12" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="12" cy="14" rx="6" ry="7" fill="#6b7280" opacity="0.2" />
      <path
        d="M12 4C10.3431 4 9 5.34315 9 7V8H15V7C15 5.34315 13.6569 4 12 4Z"
        fill="#6b7280"
        opacity="0.4"
      />
      <circle cx="12" cy="14" r="6" fill="#6b7280" />
      <path d="M12 11V14L14 15" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6 11L4 9M18 11L20 9M6 15L4 17M18 15L20 17" stroke="#6b7280" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function ReportIcon({ className = "h-16 w-16" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="5" y="3" width="14" height="18" rx="2" fill="currentColor" opacity="0.1" />
      <rect x="5" y="3" width="14" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M8 8H16M8 12H16M8 16H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="19" cy="6" r="3" fill="#ef4444" className="pulse-slow" />
    </svg>
  );
}

export function VerdictIcon({ className = "h-16 w-16" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12 3L4 7V11C4 16.55 7.84 21.74 13 23C18.16 21.74 22 16.55 22 11V7L14 3H12Z"
        fill="currentColor"
        opacity="0.1"
      />
      <path
        d="M12 3L4 7V11C4 16.55 7.84 21.74 13 23C18.16 21.74 22 16.55 22 11V7L14 3H12Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M8 12L11 15L16 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function RewardIcon({ className = "h-16 w-16" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="10" r="7" fill="currentColor" opacity="0.1" />
      <circle cx="12" cy="10" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="M12 6V10L15 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M8 16V21M16 16V21M8 21H16"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="10" r="2" fill="#10b981" className="pulse-slow" />
    </svg>
  );
}

export function ConnectionLine({ className = "h-24" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 2 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M1 0V100"
        stroke="#e5e7eb"
        strokeWidth="2"
        strokeDasharray="8 8"
        strokeDashoffset="100"
        className="animate-dash"
      />
    </svg>
  );
}

export function FlowArrow({ className = "h-8 w-full" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 200 40" fill="none" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
      <path
        d="M0 20 Q 50 10, 100 20 T 200 20"
        stroke="#d1d5db"
        strokeWidth="2"
        strokeDasharray="8 8"
        fill="none"
        className="animate-dash"
      />
      <path
        d="M195 15 L200 20 L195 25"
        stroke="#9ca3af"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
