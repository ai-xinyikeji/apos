'use client';

import * as React from 'react';
import { X, CheckCircle2, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Toast {
  id: string;
  title?: string;
  description?: string;
  type?: 'success' | 'error' | 'warning' | 'info';
  duration?: number;
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const addToast = React.useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast: Toast = { id, ...toast };
    
    setToasts((prev) => [...prev, newToast]);

    // Auto remove after duration
    const duration = toast.duration ?? 5000;
    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  }, []);

  const removeToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
}

function ToastContainer({ toasts, removeToast }: { toasts: Toast[]; removeToast: (id: string) => void }) {
  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 w-full max-w-sm pointer-events-none">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const [isExiting, setIsExiting] = React.useState(false);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(onClose, 300); // Match animation duration
  };

  const icons = {
    success: <CheckCircle2 className="h-5 w-5 text-emerald-400" />,
    error: <AlertCircle className="h-5 w-5 text-rose-400" />,
    warning: <AlertTriangle className="h-5 w-5 text-amber-400" />,
    info: <Info className="h-5 w-5 text-sky-400" />,
  };

  const colors = {
    success: 'border-emerald-500/20 bg-emerald-950/90',
    error: 'border-rose-500/20 bg-rose-950/90',
    warning: 'border-amber-500/20 bg-amber-950/90',
    info: 'border-sky-500/20 bg-sky-950/90',
  };

  const type = toast.type ?? 'info';

  return (
    <div
      className={cn(
        'pointer-events-auto rounded-xl border backdrop-blur-sm p-4 shadow-2xl transition-all duration-300',
        colors[type],
        isExiting ? 'opacity-0 translate-x-full' : 'opacity-100 translate-x-0'
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">{icons[type]}</div>
        <div className="flex-1 min-w-0">
          {toast.title && (
            <p className="text-sm font-semibold text-slate-100 mb-1">
              {toast.title}
            </p>
          )}
          {toast.description && (
            <p className="text-xs text-slate-200 leading-relaxed">
              {toast.description}
            </p>
          )}
        </div>
        <button
          onClick={handleClose}
          className="flex-shrink-0 rounded-lg p-1 text-slate-100 hover:text-slate-100 hover:bg-slate-800/50 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
