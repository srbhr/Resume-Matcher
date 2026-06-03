'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export function ChatInput({
  onSend,
  disabled,
  placeholder,
}: {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [value, setValue] = useState('');
  const send = () => {
    const t = value.trim();
    if (!t || disabled) return;
    onSend(t);
    setValue('');
  };
  return (
    <div className="flex items-end gap-2 border-t border-black bg-canvas p-3">
      <Textarea
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        className="min-h-[2.75rem] flex-1"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            e.stopPropagation();
            send();
          } else if (e.key === 'Enter') {
            e.stopPropagation();
          }
        }}
      />
      <Button onClick={send} disabled={disabled}>
        Send
      </Button>
    </div>
  );
}
