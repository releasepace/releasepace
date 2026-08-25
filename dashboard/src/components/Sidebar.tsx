import { NavLink, useNavigate } from 'react-router-dom'
import { Flag, Globe, Key, ScrollText, Settings, LogOut, Zap, Users, Search, UserPlus } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const nav = [
  { to: '/flags',        icon: Flag,       label: 'Flags'        },
  { to: '/segments',     icon: Users,       label: 'Segments'     },
  { to: '/team',         icon: UserPlus,    label: 'Team'         },
  { to: '/lookup',       icon: Search,      label: 'Lookup'       },
  { to: '/environments', icon: Globe,       label: 'Environments' },
  { to: '/keys',         icon: Key,         label: 'API Keys'     },
  { to: '/audit',        icon: ScrollText,  label: 'Audit Log'    },
  { to: '/settings',     icon: Settings,    label: 'Settings'     },
]

export function Sidebar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login')
  }

  return (
    <aside className="w-56 flex-shrink-0 bg-slate-950 border-r border-slate-800/60 flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-800/60">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center">
            <Zap size={14} className="text-white" />
          </div>
          <div>
            <div className="text-sm font-semibold text-white tracking-tight">ReleasePace</div>
            <div className="text-[10px] text-slate-500 uppercase tracking-widest">Admin</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-3 space-y-0.5">
        {nav.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all ${
                isActive
                  ? 'bg-violet-600/15 text-violet-300 font-medium'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
              }`
            }
          >
            <Icon size={15} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-4 py-4 border-t border-slate-800/60">
        <div className="text-xs text-slate-500 truncate mb-2">{user?.email}</div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 text-xs text-slate-500 hover:text-red-400 transition-colors mb-4"
        >
          <LogOut size={13} />
          Sign out
        </button>
        <div className="pt-3 border-t border-slate-800/40">
          <div className="text-[10px] text-slate-600 mb-1">Built by</div>
          <a
            href="https://github.com/AryaaTiwari"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-slate-500 hover:text-violet-400 transition-colors block truncate"
          >
            Aryaa Tiwari
          </a>
          <div className="flex gap-3 mt-1">
            <a href="https://github.com/AryaaTiwari" target="_blank" rel="noopener noreferrer"
              className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors">
              GitHub
            </a>
            <a href="https://www.linkedin.com/in/aryaa-tiwari/" target="_blank" rel="noopener noreferrer"
              className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors">
              LinkedIn
            </a>
          </div>
        </div>
      </div>
    </aside>
  )
}
