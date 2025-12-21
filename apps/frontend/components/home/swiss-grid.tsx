import React from 'react';

export const SwissGrid = ({ children }: { children: React.ReactNode }) => {
    return (
        // 1. Outer Wrapper: Matches your Layout background #F0F0E8
        <div className="min-h-screen w-full bg-[#F0F0E8] flex justify-center items-start py-12 px-4 md:px-8">

            {/* 2. The Main Container: Sharp black borders, creating the "Canvas" */}
            <div className="w-full max-w-6xl border border-black bg-[#F0F0E8] shadow-[8px_8px_0px_0px_rgba(0,0,0,0.1)]">

                {/* Header Section */}
                <div className="grid grid-cols-1 md:grid-cols-4 border-b border-black">
                    <div className="col-span-1 md:col-span-3 p-8 md:p-12 border-r border-black">
                        {/* Font matches the rougher, bolder Swiss style */}
                        <h1 className="font-serif text-5xl md:text-7xl text-black tracking-tight leading-[0.95]">
                            DASHBOARD
                        </h1>
                        <p className="mt-6 text-sm font-mono text-blue-700 uppercase tracking-wide max-w-md font-bold">
              // SELECT MODULE
                        </p>
                    </div>

                    {/* Status Corner */}
                    <div className="col-span-1 p-6 flex flex-col justify-between border-black bg-blue-700 text-[#F0F0E8]">
                        <div className="w-4 h-4 bg-[#F0F0E8] rounded-full animate-pulse"></div>
                        <div className="text-right">
                            <span className="block font-mono text-xs opacity-80 uppercase">User</span>
                            <span className="block font-mono text-sm font-bold">Saurabh</span>
                        </div>
                    </div>
                </div>

                {/* Content Grid - Background set to black to create lines between cells */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 bg-black gap-[1px] border-b border-black">
                    {children}
                </div>

                {/* Footer */}
                <div className="p-4 bg-[#F0F0E8] flex justify-between items-center font-mono text-xs text-blue-700 border-t border-black">
                    <span className="uppercase font-bold">Resume Matcher System</span>
                    <span>v4.0.1</span>
                </div>
            </div>
        </div>
    );
};