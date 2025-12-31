import React from 'react';
import Link from 'next/link';

export const SwissGrid = ({ children }: { children: React.ReactNode }) => {
  return (
    // 1. Outer Wrapper: Matches your Layout background #F0F0E8
    <div
      className="min-h-screen w-full bg-[#F0F0E8] flex justify-center items-start py-12 px-4 md:px-8"
      style={{
        backgroundImage:
          'linear-gradient(rgba(29, 78, 216, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(29, 78, 216, 0.1) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }}
    >
      {/* 2. The Main Container: Sharp black borders, creating the "Canvas" */}
      <div className="w-full max-w-[86rem] border border-black bg-[#F0F0E8] shadow-[8px_8px_0px_0px_rgba(0,0,0,0.1)]">
        {/* Header Section */}
        <div className="border-b border-black p-8 md:p-12">
          <h1 className="font-serif text-5xl md:text-7xl text-black tracking-tight leading-[0.95]">
            DASHBOARD
          </h1>
          <p className="mt-6 text-sm font-mono text-blue-700 uppercase tracking-wide max-w-md font-bold">
            {'// SELECT MODULE'}
          </p>
        </div>

        {/* Content Grid - Background set to black to create lines between cells */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 bg-black gap-[1px] border-b border-black">
          {children}
        </div>

        {/* Footer */}
        <div className="p-4 bg-[#F0F0E8] flex justify-between items-center font-mono text-xs text-blue-700 border-t border-black">
          <div className="flex items-center gap-2">
            <img src="/logo.svg" alt="Resume Matcher" className="w-5 h-5" />
            <span className="uppercase font-bold">Resume Matcher</span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/settings"
              className="bg-[#F97316] text-black border border-black px-6 py-2 uppercase font-bold tracking-wide shadow-[2px_2px_0px_0px_#000000] hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all min-w-[140px] text-center"
            >
              Settings
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
