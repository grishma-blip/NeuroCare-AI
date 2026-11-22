import React, { createContext, useContext, useState, useRef, useEffect, type ReactNode } from 'react';

// ============================================================================
// BADGE
// ============================================================================
interface BadgeProps {
  children: ReactNode;
  className?: string;
  dot?: string;
}

export function Badge({ children, className = '', dot }: BadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}>
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
      {children}
    </span>
  );
}

// ============================================================================
// CARD
// ============================================================================
interface CardProps {
  children: ReactNode;
  className?: string;
  onClick?: () => void;
}

export function Card({ children, className = '', onClick }: CardProps) {
  return (
    <div
      onClick={onClick}
      className={`rounded-xl bg-white border border-navy-100/60 shadow-card ${className}`}
    >
      {children}
    </div>
  );
}

// ============================================================================
// BUTTON
// ============================================================================
interface ButtonProps {
  children: ReactNode;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
  title?: string;
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  disabled = false,
  className = '',
  type = 'button',
  title,
}: ButtonProps) {
  const variants = {
    primary: 'bg-powder text-navy hover:bg-powder-300 font-medium shadow-soft',
    secondary: 'bg-white border border-navy-100 text-navy hover:bg-lavender-100 font-medium',
    ghost: 'text-navy-500 hover:bg-lavender-100 hover:text-navy font-medium',
    accent: 'bg-peach text-navy hover:bg-peach-400 font-medium shadow-soft',
    danger: 'bg-error/10 text-error hover:bg-error/20 font-medium border border-error/20',
  };
  const sizes = {
    sm: 'px-3 py-1.5 text-xs rounded-lg gap-1.5',
    md: 'px-4 py-2 text-sm rounded-lg gap-2',
    lg: 'px-5 py-2.5 text-sm rounded-xl gap-2',
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`inline-flex items-center justify-center transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {children}
    </button>
  );
}

// ============================================================================
// STAT CARD
// ============================================================================
interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  icon: ReactNode;
  trend?: { value: string; positive: boolean };
  accent?: boolean;
}

export function StatCard({ label, value, sub, icon, trend, accent }: StatCardProps) {
  return (
    <Card className={`p-5 animate-fade-in-up ${accent ? 'border-peach-200 bg-peach-50/30' : ''}`}>
      <div className="flex items-start justify-between">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${accent ? 'bg-peach-100 text-peach-600' : 'bg-lavender-200/60 text-powder-600'}`}>
          {icon}
        </div>
        {trend && (
          <span className={`text-xs font-medium ${trend.positive ? 'text-success' : 'text-error'}`}>
            {trend.positive ? '↑' : '↓'} {trend.value}
          </span>
        )}
      </div>
      <div className="mt-4">
        <div className="text-2xl font-semibold text-navy tracking-tight">{value}</div>
        <div className="text-sm text-navy-300 mt-0.5">{label}</div>
        {sub && <div className="text-xs text-navy-300/70 mt-1">{sub}</div>}
      </div>
    </Card>
  );
}

// ============================================================================
// EMPTY STATE
// ============================================================================
export function EmptyState({ icon, title, message, action }: { icon: ReactNode; title: string; message: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center animate-fade-in">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-lavender-200/50 text-navy-300 mb-4">
        {icon}
      </div>
      <h3 className="text-sm font-semibold text-navy">{title}</h3>
      <p className="text-sm text-navy-300 mt-1 max-w-sm">{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ============================================================================
// DISCLAIMER BAR
// ============================================================================
export function DisclaimerBar() {
  return null;
}

// ============================================================================
// SECTION HEADER
// ============================================================================
export function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-4">
      <div>
        <h2 className="text-base font-semibold text-navy tracking-tight">{title}</h2>
        {subtitle && <p className="text-sm text-navy-300 mt-0.5">{subtitle}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}

// ============================================================================
// SHADCN/UI PRIMITIVE: DIALOG / MODAL
// ============================================================================
interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

const DialogContext = createContext<{ open: boolean; onOpenChange: (open: boolean) => void } | null>(null);

export function Dialog({ open, onOpenChange, children }: DialogProps) {
  return (
    <DialogContext.Provider value={{ open, onOpenChange }}>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 backdrop-blur-sm p-4 animate-fade-in">
          {children}
        </div>
      )}
    </DialogContext.Provider>
  );
}

export function DialogContent({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ctx = useContext(DialogContext);
  return (
    <Card className={`w-full max-w-lg p-6 bg-white shadow-float animate-fade-in-up relative ${className}`}>
      {ctx && (
        <button
          onClick={() => ctx.onOpenChange(false)}
          className="absolute right-4 top-4 text-navy-300 hover:text-navy text-sm font-semibold p-1"
        >
          ✕
        </button>
      )}
      {children}
    </Card>
  );
}

export function DialogHeader({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mb-4 pb-3 border-b border-navy-100 ${className}`}>{children}</div>;
}

export function DialogTitle({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <h3 className={`text-base font-semibold text-navy tracking-tight ${className}`}>{children}</h3>;
}

export function DialogDescription({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`text-xs text-navy-300 mt-1 leading-relaxed ${className}`}>{children}</p>;
}

export function DialogFooter({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`pt-4 border-t border-navy-100 flex items-center justify-end gap-2.5 ${className}`}>{children}</div>;
}

// ============================================================================
// SHADCN/UI PRIMITIVE: TABS
// ============================================================================
interface TabsContextValue {
  value: string;
  onValueChange: (val: string) => void;
}
const TabsContext = createContext<TabsContextValue | null>(null);

export function Tabs({
  value,
  onValueChange,
  children,
  className = '',
}: {
  value: string;
  onValueChange: (val: string) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <TabsContext.Provider value={{ value, onValueChange }}>
      <div className={`space-y-4 ${className}`}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`flex rounded-xl border border-navy-100 p-1 bg-navy-50/50 gap-1 ${className}`}>
      {children}
    </div>
  );
}

export function TabsTrigger({
  value,
  children,
  className = '',
}: {
  value: string;
  children: ReactNode;
  className?: string;
}) {
  const ctx = useContext(TabsContext);
  const isActive = ctx?.value === value;
  return (
    <button
      type="button"
      onClick={() => ctx?.onValueChange(value)}
      className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all ${isActive
        ? 'bg-powder text-navy font-semibold shadow-soft'
        : 'text-navy-400 hover:text-navy hover:bg-white/60'
        } ${className}`}
    >
      {children}
    </button>
  );
}

export function TabsContent({
  value,
  children,
  className = '',
}: {
  value: string;
  children: ReactNode;
  className?: string;
}) {
  const ctx = useContext(TabsContext);
  if (ctx?.value !== value) return null;
  return <div className={`animate-fade-in ${className}`}>{children}</div>;
}

// ============================================================================
// SHADCN/UI PRIMITIVE: TOOLTIP
// ============================================================================
export function TooltipProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function Tooltip({
  content,
  children,
  className = '',
}: {
  content: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div
      className="relative inline-flex items-center"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div
          className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 px-2.5 py-1.5 text-2xs font-medium text-white bg-navy rounded-lg shadow-float whitespace-nowrap animate-fade-in pointer-events-none ${className}`}
        >
          {content}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-navy" />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// SHADCN/UI PRIMITIVE: DROPDOWN MENU
// ============================================================================
export function DropdownMenu({
  trigger,
  children,
  className = '',
}: {
  trigger: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative inline-block">
      <div onClick={() => setOpen((prev) => !prev)} className="cursor-pointer">
        {trigger}
      </div>
      {open && (
        <div
          onClick={() => setOpen(false)}
          className={`absolute right-0 top-full mt-1.5 z-50 w-56 rounded-xl bg-white shadow-float border border-navy-100/60 py-1.5 animate-fade-in-up ${className}`}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export function DropdownMenuItem({
  onClick,
  children,
  className = '',
  disabled = false,
}: {
  onClick?: () => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`w-full text-left px-3.5 py-2 text-xs flex items-center gap-2 text-navy hover:bg-lavender-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
    >
      {children}
    </button>
  );
}
