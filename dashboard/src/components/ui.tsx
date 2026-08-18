import { ReactNode, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { Loader2 } from 'lucide-react'

// ── Spinner ───────────────────────────────────────────────────
export function Spinner({ size = 16 }: { size?: number }) {
  return <Loader2 size={size} className="animate-spin" />
}

// ── Button ────────────────────────────────────────────────────
type BtnVariant = 'primary' | 'ghost' | 'danger' | 'outline'
interface BtnProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant
  size?: 'sm' | 'md'
  loading?: boolean
  icon?: ReactNode
}
export function Button({ variant = 'primary', size = 'md', loading, icon, children, className = '', disabled, ...props }: BtnProps) {
  const base = 'inline-flex items-center gap-2 font-medium rounded-lg transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-50 disabled:cursor-not-allowed'
  const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm' }
  const variants: Record<BtnVariant, string> = {
    primary: 'bg-violet-600 text-white hover:bg-violet-500 active:bg-violet-700',
    ghost:   'bg-transparent text-slate-400 hover:text-slate-200 hover:bg-white/5',
    danger:  'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20',
    outline: 'border border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white',
  }
  return (
    <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} disabled={disabled || loading} {...props}>
      {loading ? <Spinner size={14} /> : icon}
      {children}
    </button>
  )
}

// ── Badge ─────────────────────────────────────────────────────
type BadgeVariant = 'violet' | 'green' | 'amber' | 'red' | 'slate' | 'blue'
export function Badge({ children, variant = 'slate' }: { children: ReactNode; variant?: BadgeVariant }) {
  const variants: Record<BadgeVariant, string> = {
    violet: 'bg-violet-500/10 text-violet-300 ring-violet-500/20',
    green:  'bg-emerald-500/10 text-emerald-300 ring-emerald-500/20',
    amber:  'bg-amber-500/10 text-amber-300 ring-amber-500/20',
    red:    'bg-red-500/10 text-red-300 ring-red-500/20',
    slate:  'bg-slate-500/10 text-slate-400 ring-slate-500/20',
    blue:   'bg-blue-500/10 text-blue-300 ring-blue-500/20',
  }
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${variants[variant]}`}>
      {children}
    </span>
  )
}

// ── Toggle ────────────────────────────────────────────────────
export function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-40 disabled:cursor-not-allowed ${checked ? 'bg-violet-600' : 'bg-slate-700'}`}
    >
      <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
    </button>
  )
}

// ── Input ─────────────────────────────────────────────────────
export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none transition focus:border-violet-500 focus:ring-1 focus:ring-violet-500 disabled:opacity-50 ${className}`}
      {...props}
    />
  )
}

// ── Select ────────────────────────────────────────────────────
export function Select({ className = '', children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <select
      className={`w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-violet-500 focus:ring-1 focus:ring-violet-500 disabled:opacity-50 ${className}`}
      {...props}
    >
      {children}
    </select>
  )
}

// ── Textarea ──────────────────────────────────────────────────
export function Textarea({ className = '', ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 outline-none transition focus:border-violet-500 focus:ring-1 focus:ring-violet-500 resize-none ${className}`}
      {...props}
    />
  )
}

// ── Label ─────────────────────────────────────────────────────
export function Label({ children, required }: { children: ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-medium text-slate-400 mb-1.5">
      {children}{required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
  )
}

// ── FormGroup ─────────────────────────────────────────────────
export function FormGroup({ children }: { children: ReactNode }) {
  return <div className="space-y-1.5">{children}</div>
}

// ── Modal ─────────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, width = 'max-w-lg' }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; width?: string
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full ${width} bg-slate-900 border border-slate-700/50 rounded-2xl shadow-2xl`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-lg leading-none">✕</button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────
export function Empty({ icon, title, description, action }: {
  icon: ReactNode; title: string; description?: string; action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="text-slate-600 mb-4">{icon}</div>
      <p className="text-sm font-medium text-slate-300">{title}</p>
      {description && <p className="text-xs text-slate-500 mt-1 max-w-xs">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

// ── Card ──────────────────────────────────────────────────────
export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`bg-slate-900 border border-slate-800 rounded-xl ${className}`}>
      {children}
    </div>
  )
}

// ── Error message ─────────────────────────────────────────────
export function ErrorMsg({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-xs text-red-400">
      {message}
    </div>
  )
}

// ── Color dot ─────────────────────────────────────────────────
export function ColorDot({ color }: { color: string }) {
  return <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />
}

// ── Type badge ────────────────────────────────────────────────
const typeVariant: Record<string, BadgeVariant> = {
  boolean: 'violet', string: 'green', number: 'amber', json: 'blue',
}
export function TypeBadge({ type }: { type: string }) {
  return <Badge variant={typeVariant[type] || 'slate'}>{type}</Badge>
}
