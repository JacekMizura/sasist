import { Layers } from "lucide-react";

/** Minimal splash while auth bootstrap runs — avoids flash of protected content. */
export default function AuthBootstrapScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-4 animate-in fade-in duration-300">
        <div className="flex items-center gap-2 text-indigo-600">
          <Layers className="h-7 w-7" strokeWidth={2} />
          <span className="text-lg font-bold tracking-tight text-slate-900">Sasist</span>
        </div>
        <div className="h-1 w-24 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-indigo-500/70" />
        </div>
      </div>
    </div>
  );
}
