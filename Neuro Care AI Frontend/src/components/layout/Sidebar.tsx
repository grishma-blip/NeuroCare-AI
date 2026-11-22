import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Activity,
  CircleDot,
  Clock,
  BarChart3,
  Users,
  Database,
  Cpu,
  Settings,
  Smile,
  Brain,
  Shield,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  History,
} from 'lucide-react';
import Logo from '@/components/Logo';
import { useAuth } from '@/context/AuthContext';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

interface NavSection {
  title: string;
  items: Array<{
    to: string;
    label: string;
    icon: any;
    badge?: string;
  }>;
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { user, isDoctor } = useAuth();

  // Clinician / Nurse Navigation Menu: Operational, simple, guided
  const nurseSections: NavSection[] = [
    {
      title: 'Clinical Workspace',
      items: [
        { to: '/overview', label: 'Nurse Overview', icon: LayoutDashboard },
        { to: '/recording-assist', label: 'Recording Assistant', icon: ClipboardList, badge: 'Workflow' },
      ],
    },
    {
      title: 'Participant Care',
      items: [
        { to: '/participants', label: 'Participants & Consent', icon: Users },
        { to: '/sessions', label: 'Session History', icon: History },
      ],
    },
    {
      title: 'System & Hardware',
      items: [
        { to: '/device', label: 'Hardware Status', icon: Cpu },
        { to: '/settings', label: 'Profile & Settings', icon: Settings },
      ],
    },
  ];

  // Doctor / Neurologist Navigation Menu: Grouped by research context
  const doctorSections: NavSection[] = [
    {
      title: 'Acquisition & Monitoring',
      items: [
        { to: '/overview', label: 'Research Overview', icon: LayoutDashboard },
        { to: '/live', label: 'Live Monitoring', icon: Activity, badge: 'Live' },
        { to: '/sessions', label: 'Recording Sessions', icon: CircleDot },
        { to: '/timeline', label: 'Task Timeline', icon: Clock },
      ],
    },
    {
      title: 'Signal & AI Analysis',
      items: [
        { to: '/analysis', label: 'Signal Analysis (DSP)', icon: BarChart3 },
        { to: '/emotion', label: 'Emotion Recognition', icon: Smile, badge: 'ML' },
        { to: '/motor-imagery', label: 'Motor Imagery Detection', icon: Brain, badge: 'BCI' },
      ],
    },
    {
      title: 'Cohort & Management',
      items: [
        { to: '/participants', label: 'Participant Management', icon: Users },
        { to: '/reports', label: 'Reports & Export', icon: Database },
        { to: '/device', label: 'Device Management', icon: Cpu },
        { to: '/settings', label: 'System Settings', icon: Settings },
      ],
    },
  ];

  const currentSections = isDoctor ? doctorSections : nurseSections;

  return (
    <aside
      className={`fixed left-0 top-0 z-30 h-screen bg-navy transition-all duration-300 ease-out flex flex-col ${collapsed ? 'w-[72px]' : 'w-[240px]'
        }`}
    >
      {/* Logo area */}
      <div className="flex items-center h-16 px-4 border-b border-white/8 flex-shrink-0">
        <div className={`${collapsed ? 'hidden' : 'block'} flex-1`}>
          <Logo variant="light" size="sm" />
        </div>
        {collapsed && (
          <div className="flex items-center justify-center w-full">
            <div className="h-8 w-8 text-powder">
              <svg viewBox="0 0 48 48" fill="none" className="h-full w-full">
                <path
                  d="M22 10c-2.5-1.5-5.5-1.8-8-0.5-2 1-3.2 2.8-3.5 4.8-2 0.3-3.8 1.5-4.5 3.5-0.8 2.2-0.2 4.5 1.3 6.1-0.8 1.8-0.7 3.9 0.4 5.6 1 1.5 2.6 2.4 4.3 2.5 0.2 2.2 1.6 4.1 3.7 4.9 2.2 0.8 4.6 0.2 6.3-1.5V10z"
                  fill="currentColor"
                  opacity="0.9"
                />
                <path
                  d="M26 10c2.5-1.5 5.5-1.8 8-0.5 2 1 3.2 2.8 3.5 4.8 2 0.3 3.8 1.5 4.5 3.5 0.8 2.2 0.2 4.5-1.3 6.1 0.8 1.8 0.7 3.9-0.4 5.6-1 1.5-2.6 2.4-4.3 2.5-0.2 2.2-1.6 4.1-3.7 4.9-2.2 0.8-4.6 0.2-6.3-1.5V10z"
                  fill="currentColor"
                  opacity="0.7"
                />
              </svg>
            </div>
          </div>
        )}
      </div>

      {/* Role Indicator Banner */}
      {!collapsed && (
        <div className="px-4 py-2 border-b border-white/5 bg-white/[0.02]">
          <div className="flex items-center justify-between text-2xs text-white/50">
            <span className="tracking-wider">PORTAL</span>
            <span
              className={`px-2 py-0.5 rounded font-medium uppercase tracking-wider text-[10px] ${isDoctor ? 'bg-powder-500/20 text-powder-300' : 'bg-lavender-500/20 text-lavender-300'
                }`}
            >
              {isDoctor ? 'Doctor Portal' : 'Clinician Portal'}
            </span>
          </div>
        </div>
      )}

      {/* Grouped Navigation Links */}
      <nav className="flex-1 overflow-y-auto scrollbar-thin py-3 px-2 space-y-4">
        {currentSections.map((section, idx) => (
          <div key={section.title} className="space-y-1">
            {!collapsed && (
              <div className="px-3 py-1 text-[10px] font-semibold text-white/40 uppercase tracking-wider">
                {section.title}
              </div>
            )}
            {collapsed && idx > 0 && <div className="h-px bg-white/10 my-2 mx-1" />}

            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      className={({ isActive }) =>
                        `flex items-center gap-3 rounded-lg px-3 py-2 text-xs transition-all duration-150 relative group ${isActive
                          ? 'bg-powder text-navy font-semibold shadow-soft'
                          : 'text-white/70 hover:text-white hover:bg-white/5'
                        }`
                      }
                      title={collapsed ? item.label : undefined}
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      {!collapsed && (
                        <div className="flex items-center justify-between flex-1 min-w-0">
                          <span className="truncate">{item.label}</span>
                          {item.badge && (
                            <span className="text-[10px] font-mono font-medium px-1.5 py-0.2 rounded bg-white/10 text-white/80">
                              {item.badge}
                            </span>
                          )}
                        </div>
                      )}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Collapse toggle */}
      <div className="border-t border-white/8 p-2 flex-shrink-0">
        <button
          onClick={onToggle}
          className="flex items-center justify-center w-full gap-2 rounded-lg px-3 py-2 text-xs text-white/50 hover:text-white hover:bg-white/5 transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4" />
              <span>Collapse Sidebar</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
