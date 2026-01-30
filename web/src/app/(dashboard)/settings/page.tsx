'use client';

import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Settings, Link2, Unlink, Bot, Brain, Plus, Trash2, Globe, MessageSquare, CheckCircle, AlertCircle, RefreshCw, Sparkles, X, Loader2 } from 'lucide-react';
import { cloudFunctions, InstagramAccount, AIPersonality, AccountSettings, KnowledgeBase, KnowledgeFAQ } from '@/lib/firebase';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Textarea } from '@/components/Textarea';
import { Select } from '@/components/Select';
import { Toggle } from '@/components/Toggle';
import { useAccount, AccountCard, NoAccountPrompt } from '@/components/AccountSelector';
import { styles } from '@/lib/styles';
import { cn } from '@/lib/utils';

type SettingsTab = 'accounts' | 'ai' | 'knowledge' | 'notifications';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<SettingsTab>('accounts');
  const { accounts, selectedAccount, refetchAccounts, isLoading: accountsLoading } = useAccount();
  const queryClient = useQueryClient();

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'accounts', label: 'Accounts', icon: <Link2 className="h-4 w-4" /> },
    { id: 'ai', label: 'AI Personality', icon: <Bot className="h-4 w-4" /> },
    { id: 'knowledge', label: 'Knowledge Base', icon: <Brain className="h-4 w-4" /> },
    { id: 'notifications', label: 'Settings', icon: <Settings className="h-4 w-4" /> },
  ];

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-ink">Settings</h1>
        <p className="text-ink-muted text-sm">Manage your Instagram accounts and AI configuration</p>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-surface-border mb-5">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-2 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors',
              activeTab === tab.id
                ? 'border-ink text-ink'
                : 'border-transparent text-ink-muted hover:text-ink'
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'accounts' && <AccountsTab />}
      {activeTab === 'ai' && <AIPersonalityTab />}
      {activeTab === 'knowledge' && <KnowledgeBaseTab />}
      {activeTab === 'notifications' && <NotificationSettingsTab />}
    </div>
  );
}

// ============================================
// ACCOUNTS TAB
// ============================================

function AccountsTab() {
  const { accounts, refetchAccounts, isLoading } = useAccount();
  const [connectingAccount, setConnectingAccount] = useState(false);

  const connectMutation = useMutation({
    mutationFn: async () => {
      const result = await cloudFunctions.getInstagramOAuthUrl({
        redirectUrl: window.location.origin + '/settings',
      });
      return result.data;
    },
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: (error) => {
      console.error('Failed to get OAuth URL:', error);
      setConnectingAccount(false);
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async (accountId: string) => {
      return cloudFunctions.disconnectInstagramAccount({ accountId });
    },
    onSuccess: () => {
      refetchAccounts();
    },
  });

  const handleConnect = () => {
    setConnectingAccount(true);
    connectMutation.mutate();
  };

  if (isLoading) {
    return <LoadingState />;
  }

  return (
    <div className="space-y-5">
      {/* Connected Accounts */}
      <div className="rounded-md border border-surface-border bg-surface p-5">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <Link2 className="h-5 w-5 text-ink-muted" />
            <div>
              <h2 className="font-medium text-ink">Connected Accounts</h2>
              <p className="text-sm text-ink-muted">Manage your Instagram Business accounts</p>
            </div>
          </div>
          <Button onClick={handleConnect} loading={connectMutation.isPending || connectingAccount}>
            <Plus className="h-4 w-4 mr-1.5" />
            Connect Account
          </Button>
        </div>

        {accounts.length === 0 ? (
          <NoAccountPrompt onConnectClick={handleConnect} />
        ) : (
          <div className="space-y-2">
            {accounts.map((account) => (
              <div
                key={account.id}
                className="flex items-center justify-between p-3 rounded-md border border-surface-border"
              >
                <div className="flex items-center gap-3">
                  <div className={cn(styles.avatar.base, styles.avatar.sizes.md)}>
                    {account.username.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-ink">@{account.username}</p>
                    <div className="flex items-center gap-2 text-sm text-ink-muted">
                      {account.pageName && <span>{account.pageName}</span>}
                      <StatusBadge status={account.connectionStatus} />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {account.connectionStatus === 'expired' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleConnect()}
                    >
                      <RefreshCw className="h-3.5 w-3.5 mr-1" />
                      Reconnect
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => disconnectMutation.mutate(account.id)}
                    loading={disconnectMutation.isPending}
                  >
                    <Unlink className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Requirements Info */}
      <div className="rounded-md border-l-2 border-status-info bg-status-info/5 p-4">
        <h3 className="font-medium text-ink text-sm mb-2">Requirements for Connecting</h3>
        <ul className="space-y-1.5 text-sm text-ink-muted">
          <li className="flex items-start gap-2">
            <CheckCircle className="h-4 w-4 mt-0.5 text-status-info flex-shrink-0" />
            <span>Instagram Business or Creator account</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="h-4 w-4 mt-0.5 text-status-info flex-shrink-0" />
            <span>Connected to a Facebook Page</span>
          </li>
          <li className="flex items-start gap-2">
            <CheckCircle className="h-4 w-4 mt-0.5 text-status-info flex-shrink-0" />
            <span>Admin access to the Facebook Page</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

// ============================================
// AI PERSONALITY TAB
// ============================================

function AIPersonalityTab() {
  const { selectedAccount, refetchAccounts } = useAccount();
  const [personality, setPersonality] = useState<Partial<AIPersonality>>({});
  const [hasChanges, setHasChanges] = useState(false);
  const [showGenerateModal, setShowGenerateModal] = useState(false);

  // Fetch knowledge base to get website URL if available
  const { data: knowledgeBase } = useQuery({
    queryKey: ['knowledgeBase', selectedAccount?.id],
    queryFn: async () => {
      if (!selectedAccount) return null;
      const result = await cloudFunctions.getKnowledgeBase({ accountId: selectedAccount.id });
      return result.data;
    },
    enabled: !!selectedAccount,
  });

  useEffect(() => {
    if (selectedAccount?.aiPersonality) {
      setPersonality(selectedAccount.aiPersonality);
      setHasChanges(false);
    }
  }, [selectedAccount]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAccount) throw new Error('No account selected');
      return cloudFunctions.updateAccountSettings({
        accountId: selectedAccount.id,
        aiPersonality: personality,
      });
    },
    onSuccess: () => {
      refetchAccounts();
      setHasChanges(false);
    },
  });

  const updatePersonality = (updates: Partial<AIPersonality>) => {
    setPersonality((prev) => ({ ...prev, ...updates }));
    setHasChanges(true);
  };

  const handleGeneratedPersonality = (generated: {
    name: string;
    description: string;
    systemPrompt: string;
    goals: string[];
    customInstructions: string;
    tone: 'friendly' | 'professional' | 'casual' | 'enthusiastic';
  }) => {
    setPersonality((prev) => ({
      ...prev,
      ...generated,
    }));
    setHasChanges(true);
    setShowGenerateModal(false);
  };

  if (!selectedAccount) {
    return (
      <div className="rounded-md border border-surface-border bg-surface p-5">
        <NoAccountPrompt />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Generate from Website Banner */}
      <div className="rounded-md border-l-2 border-accent bg-accent/5 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-start gap-3">
            <Sparkles className="h-5 w-5 text-accent mt-0.5" />
            <div>
              <h3 className="font-medium text-ink text-sm">Auto-Generate Personality</h3>
              <p className="text-sm text-ink-muted">
                Let AI analyze your website and auto-fill all personality settings
              </p>
            </div>
          </div>
          <Button
            variant="secondary"
            onClick={() => setShowGenerateModal(true)}
          >
            <Sparkles className="h-4 w-4 mr-1.5" />
            Generate from Website
          </Button>
        </div>
      </div>

      {/* Generate Modal */}
      {showGenerateModal && (
        <GenerateFromWebsiteModal
          onClose={() => setShowGenerateModal(false)}
          onGenerate={handleGeneratedPersonality}
          defaultUrl={knowledgeBase?.websites?.[0]?.url}
        />
      )}

      {/* AI Name & Description */}
      <div className="rounded-md border border-surface-border bg-surface p-5">
        <div className="flex items-center gap-3 mb-5">
          <Bot className="h-5 w-5 text-ink-muted" />
          <div>
            <h2 className="font-medium text-ink">AI Assistant Identity</h2>
            <p className="text-sm text-ink-muted">Configure how your AI assistant presents itself</p>
          </div>
        </div>

        <div className="space-y-4">
          <Input
            label="Assistant Name"
            value={personality.name || ''}
            onChange={(e) => updatePersonality({ name: e.target.value })}
            placeholder="e.g., Alex, Support Bot, Your Name's Assistant"
          />

          <Textarea
            label="Description"
            value={personality.description || ''}
            onChange={(e) => updatePersonality({ description: e.target.value })}
            placeholder="Brief description of who the assistant represents"
            rows={2}
          />

          <Select
            label="Tone"
            value={personality.tone || 'friendly'}
            onChange={(e) => updatePersonality({ tone: e.target.value as AIPersonality['tone'] })}
            options={[
              { value: 'friendly', label: 'Friendly' },
              { value: 'professional', label: 'Professional' },
              { value: 'casual', label: 'Casual' },
              { value: 'enthusiastic', label: 'Enthusiastic' },
            ]}
          />
        </div>
      </div>

      {/* System Prompt */}
      <div className="rounded-md border border-surface-border bg-surface p-5">
        <div className="flex items-center gap-3 mb-5">
          <MessageSquare className="h-5 w-5 text-ink-muted" />
          <div>
            <h2 className="font-medium text-ink">System Instructions</h2>
            <p className="text-sm text-ink-muted">Detailed instructions for how the AI should behave</p>
          </div>
        </div>

        <Textarea
          label="System Prompt"
          value={personality.systemPrompt || ''}
          onChange={(e) => updatePersonality({ systemPrompt: e.target.value })}
          placeholder="You are a helpful assistant for [brand name]. Your role is to..."
          rows={6}
        />

        <div className="mt-4">
          <label className="block text-sm font-medium text-ink-muted mb-2">Goals</label>
          <GoalsList
            goals={personality.goals || []}
            onChange={(goals) => updatePersonality({ goals })}
          />
        </div>
      </div>

      {/* Custom Instructions */}
      <div className="rounded-md border border-surface-border bg-surface p-5">
        <h3 className="font-medium text-ink mb-4">Additional Settings</h3>

        <div className="space-y-4">
          <Textarea
            label="Custom Instructions"
            value={personality.customInstructions || ''}
            onChange={(e) => updatePersonality({ customInstructions: e.target.value })}
            placeholder="Any additional instructions or context for the AI..."
            rows={4}
          />

          <div>
            <label className="block text-sm font-medium text-ink-muted mb-2">Forbidden Topics (AI will avoid these)</label>
            <TagInput
              tags={personality.forbiddenTopics || []}
              onChange={(forbiddenTopics) => updatePersonality({ forbiddenTopics })}
              placeholder="Add topic and press Enter"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-ink-muted mb-2">Handoff Keywords (triggers human notification)</label>
            <TagInput
              tags={personality.handoffKeywords || []}
              onChange={(handoffKeywords) => updatePersonality({ handoffKeywords })}
              placeholder="e.g., speak to human, urgent, complaint"
            />
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          onClick={() => saveMutation.mutate()}
          loading={saveMutation.isPending}
          disabled={!hasChanges}
        >
          {saveMutation.isSuccess ? (
            <>
              <CheckCircle className="h-4 w-4 mr-1.5" />
              Saved
            </>
          ) : (
            'Save Changes'
          )}
        </Button>
      </div>
    </div>
  );
}

// ============================================
// KNOWLEDGE BASE TAB
// ============================================

function KnowledgeBaseTab() {
  const { selectedAccount } = useAccount();
  const [newFaq, setNewFaq] = useState({ question: '', answer: '' });

  const { data: knowledgeBase, isLoading, refetch } = useQuery({
    queryKey: ['knowledgeBase', selectedAccount?.id],
    queryFn: async () => {
      if (!selectedAccount) return null;
      const result = await cloudFunctions.getKnowledgeBase({ accountId: selectedAccount.id });
      return result.data;
    },
    enabled: !!selectedAccount,
  });

  const addFaqMutation = useMutation({
    mutationFn: async () => {
      if (!knowledgeBase) throw new Error('No knowledge base');
      return cloudFunctions.addFAQ({
        knowledgeBaseId: knowledgeBase.id,
        question: newFaq.question,
        answer: newFaq.answer,
      });
    },
    onSuccess: () => {
      setNewFaq({ question: '', answer: '' });
      refetch();
    },
  });

  const removeFaqMutation = useMutation({
    mutationFn: async (faqId: string) => {
      if (!knowledgeBase) throw new Error('No knowledge base');
      return cloudFunctions.removeFAQ({
        knowledgeBaseId: knowledgeBase.id,
        faqId,
      });
    },
    onSuccess: () => refetch(),
  });

  const addWebsiteMutation = useMutation({
    mutationFn: async (url: string) => {
      if (!knowledgeBase) throw new Error('No knowledge base');
      return cloudFunctions.addWebsite({
        knowledgeBaseId: knowledgeBase.id,
        url,
      });
    },
    onSuccess: () => refetch(),
  });

  const removeWebsiteMutation = useMutation({
    mutationFn: async (websiteId: string) => {
      if (!knowledgeBase) throw new Error('No knowledge base');
      return cloudFunctions.removeWebsite({
        knowledgeBaseId: knowledgeBase.id,
        websiteId,
      });
    },
    onSuccess: () => refetch(),
  });

  if (!selectedAccount) {
    return (
      <div className="rounded-md border border-surface-border bg-surface p-5">
        <NoAccountPrompt />
      </div>
    );
  }

  if (isLoading) {
    return <LoadingState />;
  }

  return (
    <div className="space-y-5">
      {/* Info Banner */}
      <div className="rounded-md border-l-2 border-accent bg-accent/5 p-4">
        <div className="flex items-start gap-3">
          <Brain className="h-5 w-5 text-accent mt-0.5" />
          <div>
            <h3 className="font-medium text-ink text-sm">Knowledge Base</h3>
            <p className="text-sm text-ink-muted">
              Add FAQs and website content to help your AI provide accurate, contextual responses.
            </p>
          </div>
        </div>
      </div>

      {/* FAQs Section */}
      <div className="rounded-md border border-surface-border bg-surface p-5">
        <h3 className="font-medium text-ink mb-4">Frequently Asked Questions</h3>

        {/* Existing FAQs */}
        <div className="space-y-2 mb-5">
          {knowledgeBase?.faqs?.map((faq) => (
            <div key={faq.id} className="p-3 rounded-md bg-surface-sunken border border-surface-border">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <p className="font-medium text-ink text-sm">{faq.question}</p>
                  <p className="text-sm text-ink-muted mt-1">{faq.answer}</p>
                </div>
                <button
                  onClick={() => removeFaqMutation.mutate(faq.id)}
                  className="text-ink-subtle hover:text-status-error ml-2"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
          {(!knowledgeBase?.faqs || knowledgeBase.faqs.length === 0) && (
            <p className="text-sm text-ink-subtle text-center py-4">No FAQs added yet</p>
          )}
        </div>

        {/* Add New FAQ */}
        <div className="border-t border-surface-border pt-4">
          <h4 className="text-sm font-medium text-ink-muted mb-3">Add New FAQ</h4>
          <div className="space-y-3">
            <Input
              placeholder="Question"
              value={newFaq.question}
              onChange={(e) => setNewFaq((prev) => ({ ...prev, question: e.target.value }))}
            />
            <Textarea
              placeholder="Answer"
              value={newFaq.answer}
              onChange={(e) => setNewFaq((prev) => ({ ...prev, answer: e.target.value }))}
              rows={3}
            />
            <Button
              size="sm"
              onClick={() => addFaqMutation.mutate()}
              loading={addFaqMutation.isPending}
              disabled={!newFaq.question || !newFaq.answer}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add FAQ
            </Button>
          </div>
        </div>
      </div>

      {/* Websites Section */}
      <div className="rounded-md border border-surface-border bg-surface p-5">
        <h3 className="font-medium text-ink mb-3">Website Content</h3>
        <p className="text-sm text-ink-muted mb-4">
          Add your website URLs. Content will be scraped to help the AI answer questions.
        </p>

        {/* Existing Websites */}
        <div className="space-y-2 mb-4">
          {knowledgeBase?.websites?.map((website) => (
            <div
              key={website.id}
              className="flex items-center justify-between p-2.5 rounded-md bg-surface-sunken border border-surface-border"
            >
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-ink-subtle" />
                <a
                  href={website.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-accent hover:underline"
                >
                  {website.title || website.url}
                </a>
              </div>
              <button
                onClick={() => removeWebsiteMutation.mutate(website.id)}
                className="text-ink-subtle hover:text-status-error"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          {(!knowledgeBase?.websites || knowledgeBase.websites.length === 0) && (
            <p className="text-sm text-ink-subtle text-center py-4">No websites added yet</p>
          )}
        </div>

        {/* Add Website */}
        <WebsiteInput onAdd={(url) => addWebsiteMutation.mutate(url)} loading={addWebsiteMutation.isPending} />
      </div>
    </div>
  );
}

// ============================================
// NOTIFICATION SETTINGS TAB
// ============================================

function NotificationSettingsTab() {
  const { selectedAccount, refetchAccounts } = useAccount();
  const [settings, setSettings] = useState<Partial<AccountSettings>>({});
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (selectedAccount?.settings) {
      setSettings(selectedAccount.settings);
      setHasChanges(false);
    }
  }, [selectedAccount]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAccount) throw new Error('No account selected');
      return cloudFunctions.updateAccountSettings({
        accountId: selectedAccount.id,
        settings,
      });
    },
    onSuccess: () => {
      refetchAccounts();
      setHasChanges(false);
    },
  });

  const updateSettings = (updates: Partial<AccountSettings>) => {
    setSettings((prev) => ({ ...prev, ...updates }));
    setHasChanges(true);
  };

  if (!selectedAccount) {
    return (
      <div className="rounded-md border border-surface-border bg-surface p-5">
        <NoAccountPrompt />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Collection Settings */}
      <div className="rounded-md border border-surface-border bg-surface p-5">
        <h3 className="font-medium text-ink mb-4">Data Collection</h3>
        <div className="space-y-4">
          <Toggle
            label="Collect Email Addresses"
            enabled={settings.collectEmail ?? true}
            onChange={(enabled) => updateSettings({ collectEmail: enabled })}
          />
          <Toggle
            label="Collect Phone Numbers"
            enabled={settings.collectPhone ?? false}
            onChange={(enabled) => updateSettings({ collectPhone: enabled })}
          />
          <Toggle
            label="Auto-Welcome New Followers"
            enabled={settings.autoWelcomeNewFollowers ?? true}
            onChange={(enabled) => updateSettings({ autoWelcomeNewFollowers: enabled })}
          />

          {settings.autoWelcomeNewFollowers && (
            <Textarea
              label="Welcome Message"
              value={settings.welcomeMessage || ''}
              onChange={(e) => updateSettings({ welcomeMessage: e.target.value })}
              placeholder="Hey! Thanks for following..."
              rows={3}
            />
          )}
        </div>
      </div>

      {/* Message Prompts */}
      <div className="rounded-md border border-surface-border bg-surface p-5">
        <h3 className="font-medium text-ink mb-4">Message Templates</h3>
        <div className="space-y-4">
          <Textarea
            label="Email Collection Prompt"
            value={settings.emailPrompt || ''}
            onChange={(e) => updateSettings({ emailPrompt: e.target.value })}
            placeholder="I'd love to send you exclusive content! What's your email?"
            rows={2}
          />
          <Textarea
            label="Phone Collection Prompt"
            value={settings.phonePrompt || ''}
            onChange={(e) => updateSettings({ phonePrompt: e.target.value })}
            placeholder="For fastest updates, can I get your phone number?"
            rows={2}
          />
          <Textarea
            label="Thank You Message"
            value={settings.thankYouMessage || ''}
            onChange={(e) => updateSettings({ thankYouMessage: e.target.value })}
            placeholder="Thanks! You'll hear from us soon!"
            rows={2}
          />
        </div>
      </div>

      {/* Business Hours */}
      <div className="rounded-md border border-surface-border bg-surface p-5">
        <h3 className="font-medium text-ink mb-4">Business Hours</h3>
        <div className="space-y-4">
          <Toggle
            label="Only respond during business hours"
            enabled={settings.businessHoursOnly ?? false}
            onChange={(enabled) => updateSettings({ businessHoursOnly: enabled })}
          />

          {settings.businessHoursOnly && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Start Time"
                  type="time"
                  value={settings.businessHours?.start || '09:00'}
                  onChange={(e) =>
                    updateSettings({
                      businessHours: { ...settings.businessHours!, start: e.target.value },
                    })
                  }
                />
                <Input
                  label="End Time"
                  type="time"
                  value={settings.businessHours?.end || '17:00'}
                  onChange={(e) =>
                    updateSettings({
                      businessHours: { ...settings.businessHours!, end: e.target.value },
                    })
                  }
                />
              </div>
              <Textarea
                label="Out of Hours Message"
                value={settings.outOfHoursMessage || ''}
                onChange={(e) => updateSettings({ outOfHoursMessage: e.target.value })}
                placeholder="Thanks for reaching out! We'll get back to you during business hours."
                rows={2}
              />
            </>
          )}
        </div>
      </div>

      {/* Notifications */}
      <div className="rounded-md border border-surface-border bg-surface p-5">
        <h3 className="font-medium text-ink mb-4">Email Notifications</h3>
        <div className="space-y-4">
          <Toggle
            label="Notify on new lead"
            enabled={settings.notifyOnNewLead ?? false}
            onChange={(enabled) => updateSettings({ notifyOnNewLead: enabled })}
          />
          <Toggle
            label="Notify on handoff request"
            enabled={settings.notifyOnHandoff ?? true}
            onChange={(enabled) => updateSettings({ notifyOnHandoff: enabled })}
          />

          {(settings.notifyOnNewLead || settings.notifyOnHandoff) && (
            <Input
              label="Notification Email"
              type="email"
              value={settings.notificationEmail || ''}
              onChange={(e) => updateSettings({ notificationEmail: e.target.value })}
              placeholder="your@email.com"
            />
          )}
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          onClick={() => saveMutation.mutate()}
          loading={saveMutation.isPending}
          disabled={!hasChanges}
        >
          {saveMutation.isSuccess ? (
            <>
              <CheckCircle className="h-4 w-4 mr-1.5" />
              Saved
            </>
          ) : (
            'Save Changes'
          )}
        </Button>
      </div>
    </div>
  );
}

// ============================================
// GENERATE FROM WEBSITE MODAL
// ============================================

function GenerateFromWebsiteModal({
  onClose,
  onGenerate,
  defaultUrl,
}: {
  onClose: () => void;
  onGenerate: (personality: {
    name: string;
    description: string;
    systemPrompt: string;
    goals: string[];
    customInstructions: string;
    tone: 'friendly' | 'professional' | 'casual' | 'enthusiastic';
  }) => void;
  defaultUrl?: string;
}) {
  const [url, setUrl] = useState(defaultUrl || '');
  const [error, setError] = useState<string | null>(null);

  const generateMutation = useMutation({
    mutationFn: async () => {
      setError(null);
      const result = await cloudFunctions.generateAIPersonalityFromWebsite({ url });
      return result.data;
    },
    onSuccess: (data) => {
      onGenerate(data);
    },
    onError: (error: any) => {
      const message = error?.message || 'Failed to generate personality';
      setError(message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) {
      setError('Please enter a URL');
      return;
    }
    generateMutation.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-surface rounded-lg border border-surface-border max-w-lg w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-surface-border">
          <div className="flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-accent" />
            <div>
              <h2 className="font-medium text-ink">Generate from Website</h2>
              <p className="text-sm text-ink-muted">AI will analyze your website content</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-ink-muted hover:text-ink transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-ink-muted mb-2">
              Website URL
            </label>
            <Input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://your-website.com"
              disabled={generateMutation.isPending}
            />
            <p className="mt-2 text-xs text-ink-subtle">
              Enter the URL of your website, landing page, or about page
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-status-error/5 border border-status-error/20">
              <AlertCircle className="h-4 w-4 text-status-error mt-0.5 flex-shrink-0" />
              <p className="text-sm text-status-error">{error}</p>
            </div>
          )}

          {generateMutation.isPending && (
            <div className="flex items-center gap-3 p-4 rounded-md bg-accent/5 border border-accent/20">
              <span className={cn(styles.spinner, 'text-accent')} />
              <div>
                <p className="text-sm font-medium text-ink">Analyzing website...</p>
                <p className="text-xs text-ink-muted">This may take a few seconds</p>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={generateMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              loading={generateMutation.isPending}
              disabled={!url.trim()}
            >
              <Sparkles className="h-4 w-4 mr-1.5" />
              Generate
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================
// HELPER COMPONENTS
// ============================================

function StatusBadge({ status }: { status: string }) {
  const colors = {
    connected: styles.badge.success,
    expired: styles.badge.warning,
    error: styles.badge.error,
  };

  return (
    <span className={cn(styles.badge.base, colors[status as keyof typeof colors] || colors.error)}>
      {status}
    </span>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-12">
      <span className={styles.spinner} />
    </div>
  );
}

function GoalsList({ goals, onChange }: { goals: string[]; onChange: (goals: string[]) => void }) {
  const [newGoal, setNewGoal] = useState('');

  const addGoal = () => {
    if (newGoal.trim()) {
      onChange([...goals, newGoal.trim()]);
      setNewGoal('');
    }
  };

  const removeGoal = (index: number) => {
    onChange(goals.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-2">
      {goals.map((goal, index) => (
        <div key={index} className="flex items-center gap-2 p-2 rounded-md bg-surface-sunken">
          <span className="flex-1 text-sm text-ink">{goal}</span>
          <button onClick={() => removeGoal(index)} className="text-ink-subtle hover:text-status-error">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <div className="flex gap-2">
        <Input
          placeholder="Add a goal..."
          value={newGoal}
          onChange={(e) => setNewGoal(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addGoal())}
        />
        <Button variant="secondary" size="sm" onClick={addGoal}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function TagInput({
  tags,
  onChange,
  placeholder,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder: string;
}) {
  const [input, setInput] = useState('');

  const addTag = () => {
    if (input.trim() && !tags.includes(input.trim())) {
      onChange([...tags, input.trim()]);
      setInput('');
    }
  };

  const removeTag = (tag: string) => {
    onChange(tags.filter((t) => t !== tag));
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <span
            key={tag}
            className={cn(styles.badge.base, styles.badge.neutral, 'inline-flex items-center gap-1')}
          >
            {tag}
            <button onClick={() => removeTag(tag)} className="text-ink-subtle hover:text-status-error">
              &times;
            </button>
          </span>
        ))}
      </div>
      <Input
        placeholder={placeholder}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
      />
    </div>
  );
}

function WebsiteInput({ onAdd, loading }: { onAdd: (url: string) => void; loading: boolean }) {
  const [url, setUrl] = useState('');

  const handleAdd = () => {
    if (url.trim()) {
      onAdd(url.trim());
      setUrl('');
    }
  };

  return (
    <div className="flex gap-2">
      <Input
        placeholder="https://your-website.com"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAdd())}
      />
      <Button variant="secondary" onClick={handleAdd} loading={loading}>
        <Plus className="h-4 w-4 mr-1" />
        Add
      </Button>
    </div>
  );
}
