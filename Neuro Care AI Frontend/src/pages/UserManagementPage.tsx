import { useState, useMemo, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Shield,
  UserPlus,
  Lock,
  Mail,
  User,
  CheckCircle2,
  XCircle,
  AlertCircle,
  KeyRound,
  ShieldCheck,
  Search,
  Filter,
} from 'lucide-react';
import {
  Card,
  Button,
  Badge,
  DisclaimerBar,
  SectionHeader,
  EmptyState,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui';
import { DataTable } from '@/components/ui/DataTable';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { formatDate } from '@/lib/format';
import type { User as UserType, UserRole } from '@/types';

// Zod Schema for User Registration
const userSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
  role: z.enum(['doctor', 'clinician']),
});

type UserFormData = z.infer<typeof userSchema>;

export default function UserManagementPage() {
  const { user: currentUser, isDoctor } = useAuth();
  const [users, setUsers] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState<'all' | 'doctor' | 'clinician'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UserFormData>({
    resolver: zodResolver(userSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      role: 'clinician',
    },
  });

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const list = await api.getUsers();
      setUsers(list);
    } catch {
      // Demo fallback if backend offline
      setUsers([
        { id: 'u_doctor', email: 'dr.patel@neurocare.ai', name: 'Dr. Patel', role: 'doctor', active: true, createdAt: '2024-01-10' },
        { id: 'u_clinician', email: 'clinician@neurocare.ai', name: 'Sarah Chen', role: 'clinician', active: true, createdAt: '2024-02-01' },
        { id: 'u_operator', email: 'operator@neurocare.ai', name: 'Marcus Brody', role: 'clinician', active: true, createdAt: '2024-02-15' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const onSubmitUser = async (_data: UserFormData) => {
    setCreateError('User authentication and registration are not implemented on the primary backend. System accounts are statically configured.');
  };

  const handleToggleStatus = async (_user: UserType) => {
    alert('User status toggle is not supported by the primary backend API.');
  };

  const filteredUsers = useMemo(() => {
    return users.filter((u) => {
      const matchesRole = roleFilter === 'all' || u.role === roleFilter;
      return matchesRole;
    });
  }, [users, roleFilter]);

  // TanStack Column Definitions
  const columns: ColumnDef<UserType>[] = [
    {
      accessorKey: 'name',
      header: 'User',
      cell: ({ row }) => {
        const u = row.original;
        return (
          <div className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-full bg-navy text-white flex items-center justify-center font-semibold text-xs">
              {u.name.charAt(0)}
            </div>
            <div>
              <div className="font-medium text-navy">{u.name}</div>
              <div className="text-[10px] text-navy-300 font-mono">{u.id}</div>
            </div>
          </div>
        );
      },
    },
    {
      accessorKey: 'email',
      header: 'Email',
      cell: ({ row }) => <span className="font-mono text-navy-400">{row.original.email}</span>,
    },
    {
      accessorKey: 'role',
      header: 'Role',
      cell: ({ row }) => {
        const isDoc = row.original.role === 'doctor';
        return (
          <Badge
            className={
              isDoc ? 'bg-peach-100 text-peach-700 font-medium' : 'bg-powder-100 text-navy-600 font-medium'
            }
          >
            {isDoc ? 'Doctor' : 'Clinician'}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'active',
      header: 'Status',
      cell: ({ row }) => {
        const isActive = row.original.active !== false;
        return (
          <Badge className={isActive ? 'bg-success/10 text-success' : 'bg-error/10 text-error'}>
            {isActive ? 'Active' : 'Disabled'}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'createdAt',
      header: 'Created Date',
      cell: ({ row }) => (
        <span className="font-mono text-navy-300 text-[11px]">{formatDate(row.original.createdAt)}</span>
      ),
    },
    {
      id: 'actions',
      header: () => <div className="text-right">Actions</div>,
      cell: ({ row }) => {
        const u = row.original;
        return (
          <div className="text-right">
            {u.id !== currentUser?.id ? (
              <Button size="sm" variant="secondary" onClick={() => handleToggleStatus(u)} className="text-xs">
                {u.active !== false ? 'Disable' : 'Enable'}
              </Button>
            ) : (
              <span className="text-2xs text-navy-300 italic">Current Session</span>
            )}
          </div>
        );
      },
    },
  ];

  if (!isDoctor) {
    return (
      <div className="max-w-[800px] mx-auto py-16 text-center animate-fade-in">
        <div className="h-12 w-12 rounded-full bg-error/10 text-error flex items-center justify-center mx-auto mb-4">
          <Lock className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold text-navy">Doctor Access Required</h2>
        <p className="text-sm text-navy-300 mt-2 max-w-md mx-auto">
          User Management is restricted to Doctor accounts. You are currently logged in as a Clinician.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto animate-fade-in">

      {/* Header with quick stats */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-navy">User Management &amp; Role-Based Access</h2>
          <p className="text-xs text-navy-300 mt-0.5">
            Manage operator credentials, assign researcher roles, and audit access permissions.
          </p>
        </div>

        <Button
          onClick={() => {
            reset();
            setShowCreateModal(true);
          }}
        >
          <UserPlus className="h-3.5 w-3.5" />
          Create New Account
        </Button>
      </div>

      {/* Role Filter Toolbar */}
      <Card className="p-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-navy-300">Filter Role:</span>
          <div className="flex rounded-lg border border-navy-100 p-0.5 bg-navy-50/50">
            <button
              onClick={() => setRoleFilter('all')}
              className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                roleFilter === 'all' ? 'bg-white text-navy shadow-soft' : 'text-navy-300 hover:text-navy'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setRoleFilter('doctor')}
              className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                roleFilter === 'doctor' ? 'bg-white text-navy shadow-soft' : 'text-navy-300 hover:text-navy'
              }`}
            >
              Doctor
            </button>
            <button
              onClick={() => setRoleFilter('clinician')}
              className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                roleFilter === 'clinician' ? 'bg-white text-navy shadow-soft' : 'text-navy-300 hover:text-navy'
              }`}
            >
              Clinician
            </button>
          </div>
        </div>
      </Card>

      {/* Users DataTable */}
      <DataTable
        columns={columns}
        data={filteredUsers}
        searchPlaceholder="Search users by name, email, or ID..."
        pageSize={10}
      />

      {/* Create User Dialog with React Hook Form + Zod */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-powder-600" />
              <DialogTitle>Create New Account</DialogTitle>
            </div>
            <DialogDescription>
              Provision a new operator or researcher credential with role-specific access permissions.
            </DialogDescription>
          </DialogHeader>

          {createError && (
            <div className="mb-4 p-2.5 rounded-lg bg-error/10 border border-error/20 text-xs text-error flex items-center gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{createError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmitUser)} className="space-y-3.5 text-xs">
            <div>
              <label className="block text-xs font-medium text-navy mb-1">Full Name</label>
              <input
                type="text"
                placeholder="e.g. Dr. Jane Smith"
                {...register('name')}
                className="w-full px-3 py-2 text-xs rounded-lg border border-navy-100 text-navy focus:outline-none focus:border-powder-400"
              />
              {errors.name && <p className="text-2xs text-error mt-1">{errors.name.message}</p>}
            </div>

            <div>
              <label className="block text-xs font-medium text-navy mb-1">Email Address</label>
              <input
                type="email"
                placeholder="name@neurocare.ai"
                {...register('email')}
                className="w-full px-3 py-2 text-xs rounded-lg border border-navy-100 text-navy focus:outline-none focus:border-powder-400"
              />
              {errors.email && <p className="text-2xs text-error mt-1">{errors.email.message}</p>}
            </div>

            <div>
              <label className="block text-xs font-medium text-navy mb-1">Initial Password</label>
              <input
                type="password"
                placeholder="Min. 6 characters"
                {...register('password')}
                className="w-full px-3 py-2 text-xs rounded-lg border border-navy-100 text-navy focus:outline-none focus:border-powder-400"
              />
              {errors.password && <p className="text-2xs text-error mt-1">{errors.password.message}</p>}
            </div>

            <div>
              <label className="block text-xs font-medium text-navy mb-1">Role &amp; Permissions</label>
              <select
                {...register('role')}
                className="w-full px-3 py-2 text-xs rounded-lg border border-navy-100 text-navy bg-white focus:outline-none focus:border-powder-400"
              >
                <option value="clinician">Clinician (Session recording, live monitoring)</option>
                <option value="doctor">
                  Doctor (Research supervision, diagnostic testing)
                </option>
              </select>
              {errors.role && <p className="text-2xs text-error mt-1">{errors.role.message}</p>}
            </div>

            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setShowCreateModal(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? 'Creating...' : 'Create Account'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
