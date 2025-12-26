'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Linkedin, Mail } from 'lucide-react';

export interface OutreachPreviewProps {
  /** Outreach message content */
  content: string;
  /** Additional class names */
  className?: string;
}

export function OutreachPreview({
  content,
  className,
}: OutreachPreviewProps) {
  return (
    <div
      className={cn(
        'bg-white border-2 border-black',
        'shadow-[4px_4px_0px_0px_#000000]',
        'overflow-hidden',
        className
      )}
    >
      {/* Preview Header */}
      <div className="p-4 border-b-2 border-black bg-[#F5F5F0]">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Linkedin className="w-4 h-4 text-[#0077B5]" />
            <span className="font-mono text-xs uppercase">LinkedIn</span>
          </div>
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-gray-600" />
            <span className="font-mono text-xs uppercase">Email</span>
          </div>
        </div>
      </div>

      {/* Message Preview */}
      <div className="p-6 md:p-8">
        {content ? (
          <div className="space-y-4">
            {/* Message Bubble Style */}
            <div className="bg-[#F5F5F0] border-2 border-black p-4 shadow-[2px_2px_0px_0px_#000000]">
              <p className="font-sans text-sm leading-relaxed whitespace-pre-wrap">
                {content}
              </p>
            </div>

            {/* Usage Tips */}
            <div className="pt-4 border-t border-gray-200">
              <p className="font-mono text-xs text-gray-500 uppercase mb-2">
                How to use:
              </p>
              <ul className="font-mono text-xs text-gray-500 space-y-1">
                <li>1. Copy the message using the button above</li>
                <li>2. Open LinkedIn or your email client</li>
                <li>3. Paste and personalize as needed</li>
                <li>4. Send to recruiters or hiring managers</li>
              </ul>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 text-gray-400">
            <p className="font-mono text-sm">
              No outreach message yet.
            </p>
            <p className="font-mono text-xs mt-2">
              Enable outreach message generation in Settings, then tailor a resume.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
