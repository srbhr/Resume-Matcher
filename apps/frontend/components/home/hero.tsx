import React from 'react';
import Link from 'next/link';

export default function Hero() {
  const buttonClass =
    'group relative border border-black bg-transparent px-8 py-3 font-mono text-sm font-bold uppercase text-blue-700 transition-all duration-200 ease-in-out hover:bg-blue-700 hover:text-[#F0F0E8] hover:-translate-y-1 hover:-translate-x-1 hover:shadow-[4px_4px_0px_0px_#000000] active:translate-x-0 active:translate-y-0 active:shadow-none cursor-pointer';

  return (
    <section
      className="h-screen w-full p-4 md:p-12 lg:p-24 bg-[#F0F0E8]"
      style={{
        backgroundImage:
          'linear-gradient(rgba(29, 78, 216, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(29, 78, 216, 0.1) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }}
    >
      <div className="flex h-full w-full flex-col items-center justify-center border border-black text-blue-700 bg-[#F0F0E8] shadow-[12px_12px_0px_0px_rgba(0,0,0,0.1)]">
        <h1 className="mb-12 text-center font-mono text-6xl font-bold uppercase leading-none tracking-tighter md:text-8xl lg:text-9xl selection:bg-blue-700 selection:text-white">
          Resume
          <br />
          Matcher
        </h1>

        <div className="flex flex-col gap-4 md:flex-row md:gap-12">
          <a
            href="https://github.com/srbhr/Resume-Matcher"
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClass}
          >
            GitHub
          </a>
          <a
            href="https://resumematcher.fyi"
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClass}
          >
            Docs
          </a>
          <Link href="/dashboard" className={buttonClass}>
            Launch App
          </Link>
        </div>
      </div>
    </section>
  );
}
