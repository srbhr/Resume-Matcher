'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchLlmApiKey, updateLlmApiKey } from '@/lib/api/config';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Save, Key, Shield, User, Loader2, ArrowLeft } from 'lucide-react';

type Status = 'idle' | 'loading' | 'saving' | 'saved' | 'error';

export default function SettingsPage() {
  const [status, setStatus] = useState<Status>('loading');
  const [apiKey, setApiKey] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const value = await fetchLlmApiKey();
        if (cancelled) return;
        setApiKey(value || '');
        setStatus('idle');
      } catch (err) {
        console.error('Failed to load LLM API key', err);
        if (!cancelled) {
          setError('Unable to load API key');
          setStatus('error');
        }
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    setStatus('saving');
    setError(null);
    try {
      const trimmed = apiKey.trim();
      const saved = await updateLlmApiKey(trimmed);
      setApiKey(saved);
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2000);
    } catch (err) {
      console.error('Failed to update LLM API key', err);
      setError((err as Error).message || 'Unable to update API key');
      setStatus('error');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-6 md:p-12 min-h-[calc(100vh-60px)]"
      style={{
        backgroundImage: 'linear-gradient(rgba(29, 78, 216, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(29, 78, 216, 0.05) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }}
    >
      <div className="w-full max-w-3xl border border-black bg-[#F0F0E8] shadow-[8px_8px_0px_0px_rgba(0,0,0,0.1)]">
        {/* Header */}
        <div className="border-b border-black p-8 bg-white flex justify-between items-start">
          <div>
            <h1 className="font-serif text-3xl font-bold tracking-tight">SETTINGS</h1>
            <p className="font-mono text-xs text-gray-500 mt-2 uppercase tracking-wider">// SYSTEM CONFIGURATION</p>
          </div>
          <Link href="/dashboard">
            <Button variant="outline" size="sm" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              BACK
            </Button>
          </Link>
        </div>

        <div className="p-8 space-y-12">
          
          {/* Section: LLM Configuration */}
          <section className="space-y-6">
            <div className="flex items-center gap-2 border-b border-black/10 pb-2">
              <Key className="w-4 h-4" />
              <h2 className="font-mono text-sm font-bold uppercase tracking-wider">LLM Configuration</h2>
            </div>
            
            <div className="grid gap-6">
              <div className="space-y-2">
                <Label htmlFor="apiKey">OpenAI API Key</Label>
                <div className="flex gap-4">
                  <Input
                    id="apiKey"
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-..."
                    className="font-mono"
                  />
                  <Button 
                    onClick={handleSave} 
                    disabled={status === 'saving' || status === 'loading'}
                    className="w-32"
                  >
                    {status === 'saving' ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : status === 'saved' ? (
                      "SAVED"
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        SAVE
                      </>
                    )}
                  </Button>
                </div>
                <p className="text-xs text-gray-500 font-mono">
                  REQUIRED FOR AI RESUME GENERATION. KEY IS STORED LOCALLY.
                </p>
                {error && (
                  <p className="text-xs text-red-600 font-bold font-mono mt-2">
                    ERROR: {error}
                  </p>
                )}
              </div>
            </div>
          </section>

          {/* Section: Appearance (Placeholder) */}
          <section className="space-y-6 opacity-60 pointer-events-none grayscale">
            <div className="flex items-center gap-2 border-b border-black/10 pb-2">
              <Shield className="w-4 h-4" />
              <h2 className="font-mono text-sm font-bold uppercase tracking-wider">Appearance</h2>
            </div>
            
            <div className="grid gap-6">
               <div className="space-y-2">
                <Label>Theme Mode</Label>
                <div className="flex gap-2">
                  <Button variant="outline" className="bg-black text-white border-black">DARK</Button>
                  <Button variant="outline" className="bg-white text-black">LIGHT</Button>
                  <Button variant="default">SYSTEM</Button>
                </div>
               </div>
            </div>
          </section>

          {/* Section: Account (Placeholder) */}
          <section className="space-y-6 opacity-60 pointer-events-none grayscale">
             <div className="flex items-center gap-2 border-b border-black/10 pb-2">
              <User className="w-4 h-4" />
              <h2 className="font-mono text-sm font-bold uppercase tracking-wider">Account</h2>
            </div>
            <div className="p-4 border border-dashed border-black bg-gray-50">
               <p className="font-mono text-xs text-center text-gray-500">USER AUTHENTICATION NOT CONFIGURED</p>
            </div>
          </section>

        </div>
        
        {/* Footer */}
        <div className="bg-[#E5E5E0] p-4 border-t border-black flex justify-between items-center">
            <span className="font-mono text-xs text-gray-500">RESUME MATCHER v1.0.0</span>
            <span className="font-mono text-xs text-gray-500">BUILD: STABLE</span>
        </div>
      </div>
    </div>
  );
}
