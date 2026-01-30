'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Settings, Key, Link, CheckCircle, AlertCircle } from 'lucide-react';
import { cloudFunctions } from '@/lib/firebase';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';

export default function SettingsPage() {
  const [accessToken, setAccessToken] = useState('');
  const [pageId, setPageId] = useState('');
  const [instagramAccountId, setInstagramAccountId] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const saveMutation = useMutation({
    mutationFn: async () => {
      return cloudFunctions.saveInstagramConfig({
        accessToken,
        pageId,
        instagramAccountId,
      });
    },
    onSuccess: () => {
      setSaveStatus('success');
      setAccessToken('');
      setTimeout(() => setSaveStatus('idle'), 3000);
    },
    onError: () => {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    },
  });

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate();
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-500">Configure your Instagram connection</p>
      </div>

      {/* Instagram Connection */}
      <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-100">
        <div className="flex items-center gap-3 mb-6">
          <div className="rounded-lg bg-gradient-to-br from-instagram-pink to-instagram-purple p-2">
            <Settings className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="font-semibold text-gray-900">Instagram Connection</h2>
            <p className="text-sm text-gray-500">Connect your Instagram Business account</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <Input
            label="Page Access Token"
            type="password"
            value={accessToken}
            onChange={(e) => setAccessToken(e.target.value)}
            placeholder="Enter your long-lived page access token"
          />

          <Input
            label="Facebook Page ID"
            value={pageId}
            onChange={(e) => setPageId(e.target.value)}
            placeholder="e.g., 123456789012345"
          />

          <Input
            label="Instagram Business Account ID"
            value={instagramAccountId}
            onChange={(e) => setInstagramAccountId(e.target.value)}
            placeholder="e.g., 17841234567890123"
          />

          <div className="pt-4">
            <Button
              type="submit"
              loading={saveMutation.isPending}
              disabled={!accessToken || !pageId || !instagramAccountId}
            >
              Save Configuration
            </Button>
          </div>

          {saveStatus === 'success' && (
            <div className="flex items-center gap-2 text-green-600 text-sm">
              <CheckCircle className="h-4 w-4" />
              Configuration saved successfully
            </div>
          )}

          {saveStatus === 'error' && (
            <div className="flex items-center gap-2 text-red-600 text-sm">
              <AlertCircle className="h-4 w-4" />
              Failed to save configuration
            </div>
          )}
        </form>
      </div>

      {/* Setup Instructions */}
      <div className="mt-8 rounded-xl bg-gray-50 p-6 border border-gray-200">
        <h3 className="font-semibold text-gray-900 mb-4">Setup Instructions</h3>
        <ol className="space-y-3 text-sm text-gray-600">
          <li className="flex gap-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-instagram-pink text-white text-xs font-medium">
              1
            </span>
            <span>
              Go to{' '}
              <a
                href="https://developers.facebook.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-instagram-pink hover:underline"
              >
                Meta Developer Portal
              </a>{' '}
              and create a new app
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-instagram-pink text-white text-xs font-medium">
              2
            </span>
            <span>Add Instagram Graph API and Webhooks products</span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-instagram-pink text-white text-xs font-medium">
              3
            </span>
            <span>Generate a Page Access Token with instagram_basic and instagram_manage_messages permissions</span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-instagram-pink text-white text-xs font-medium">
              4
            </span>
            <span>
              Exchange for a long-lived token (60 days) using the token exchange endpoint
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-instagram-pink text-white text-xs font-medium">
              5
            </span>
            <span>
              Configure webhook URL:{' '}
              <code className="bg-gray-200 px-1 rounded">
                https://[region]-[project].cloudfunctions.net/instagramWebhook
              </code>
            </span>
          </li>
        </ol>
      </div>

      {/* Webhook Fields */}
      <div className="mt-6 rounded-xl bg-white p-6 shadow-sm border border-gray-100">
        <h3 className="font-semibold text-gray-900 mb-4">Required Webhook Subscriptions</h3>
        <div className="grid grid-cols-2 gap-3">
          {[
            { field: 'messages', desc: 'Receive DMs' },
            { field: 'messaging_postbacks', desc: 'Quick reply clicks' },
            { field: 'comments', desc: 'Post comments' },
            { field: 'mentions', desc: 'Story mentions' },
          ].map((item) => (
            <div
              key={item.field}
              className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2"
            >
              <Key className="h-4 w-4 text-gray-400" />
              <div>
                <code className="text-sm font-medium">{item.field}</code>
                <p className="text-xs text-gray-500">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
