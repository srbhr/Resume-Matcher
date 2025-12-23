import { Plus } from 'lucide-react';

interface ResumeCardProps {
  type: 'new' | 'existing';
  title?: string;
  lastEdited?: string;
  onClick?: () => void;
}

export const ResumeCard = ({ type, title, lastEdited, onClick }: ResumeCardProps) => {
  const baseClasses =
    'aspect-[3/4] w-full border-2 border-black transition-all duration-200 hover:-translate-y-1 hover:shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] cursor-pointer flex flex-col p-6 bg-white';

  if (type === 'new') {
    return (
      <button onClick={onClick} className={`${baseClasses} items-center justify-center group`}>
        <div className="rounded-full border-2 border-black p-4">
          <Plus size={32} />
        </div>
        <span className="mt-4 font-bold uppercase tracking-wider text-sm">Create New</span>
      </button>
    );
  }

  return (
    <div onClick={onClick} className={baseClasses}>
      <div className="flex-1 bg-gray-100 border border-gray-200 mb-4 overflow-hidden relative">
        {/* Placeholder for resume preview */}
        <div className="absolute inset-0 flex items-center justify-center text-gray-300 font-mono text-xs">
          PREVIEW
        </div>
      </div>
      <h3 className="font-bold text-lg leading-tight truncate">{title}</h3>
      <p className="text-xs text-gray-500 mt-1 uppercase tracking-wide">Edited {lastEdited}</p>
    </div>
  );
};
