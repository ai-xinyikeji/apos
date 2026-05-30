import { Loader2 } from 'lucide-react';

export default function Loading() {
  return (
    <div className="flex items-center justify-center min-h-[400px]">
      <div className="text-center">
        <Loader2 className="h-12 w-12 text-cyan-500 animate-spin mx-auto mb-4" />
        <p className="text-slate-100 text-sm">加载中...</p>
      </div>
    </div>
  );
}
