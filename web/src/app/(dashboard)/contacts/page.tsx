'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  Download,
  Tag,
  Send,
  Filter,
  Search,
  X,
  Check,
  Mail,
  Phone,
  MessageSquare,
  UserPlus,
  ChevronDown,
} from 'lucide-react';
import { cloudFunctions, Conversation, ContactSource } from '@/lib/firebase';
import { Button } from '@/components/Button';
import { Select } from '@/components/Select';
import { formatRelativeTime, downloadCSV, cn } from '@/lib/utils';
import { useAccount, NoAccountPrompt } from '@/components/AccountSelector';
import { styles } from '@/lib/styles';

const sourceOptions = [
  { value: '', label: 'All Sources' },
  { value: 'dm', label: 'Direct Message' },
  { value: 'new_follower', label: 'New Follower' },
  { value: 'comment', label: 'Comment' },
  { value: 'story_reply', label: 'Story Reply' },
  { value: 'story_mention', label: 'Story Mention' },
];

const sourceLabels: Record<string, string> = {
  dm: 'DM',
  new_follower: 'Follower',
  comment: 'Comment',
  story_reply: 'Story',
  story_mention: 'Mention',
  manual: 'Manual',
};

const sourceIcons: Record<string, React.ReactNode> = {
  dm: <MessageSquare className="h-3 w-3" />,
  new_follower: <UserPlus className="h-3 w-3" />,
  comment: <MessageSquare className="h-3 w-3" />,
  story_reply: <MessageSquare className="h-3 w-3" />,
  story_mention: <MessageSquare className="h-3 w-3" />,
};

export default function ContactsPage() {
  const queryClient = useQueryClient();
  const { selectedAccount, accounts, isLoading: accountsLoading } = useAccount();

  // Filters
  const [sourceFilter, setSourceFilter] = useState('');
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [hasEmailFilter, setHasEmailFilter] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Selection
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());

  // Modals
  const [showTagModal, setShowTagModal] = useState(false);
  const [showDMModal, setShowDMModal] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [dmMessage, setDmMessage] = useState('');

  // Fetch contacts
  const { data, isLoading } = useQuery({
    queryKey: ['contacts', selectedAccount?.id, sourceFilter, tagFilter, hasEmailFilter, searchQuery],
    queryFn: async () => {
      const result = await cloudFunctions.getContacts({
        accountId: selectedAccount?.id,
        source: sourceFilter as ContactSource || undefined,
        tags: tagFilter.length > 0 ? tagFilter : undefined,
        hasEmail: hasEmailFilter || undefined,
        search: searchQuery || undefined,
        limit: 200,
      });
      return result.data;
    },
    enabled: !!selectedAccount,
  });

  // Fetch available tags
  const { data: tagsData } = useQuery({
    queryKey: ['contactTags', selectedAccount?.id],
    queryFn: async () => {
      const result = await cloudFunctions.getContactTags({
        accountId: selectedAccount?.id,
      });
      return result.data;
    },
    enabled: !!selectedAccount,
  });

  // Bulk tag mutation
  const bulkTagMutation = useMutation({
    mutationFn: async ({ tagsToAdd, tagsToRemove }: { tagsToAdd?: string[]; tagsToRemove?: string[] }) => {
      return cloudFunctions.bulkTagContacts({
        contactIds: Array.from(selectedContacts),
        tagsToAdd,
        tagsToRemove,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['contactTags'] });
      setSelectedContacts(new Set());
      setShowTagModal(false);
      setNewTag('');
    },
  });

  // Bulk DM mutation
  const bulkDMMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAccount) throw new Error('No account selected');
      return cloudFunctions.bulkDMContacts({
        contactIds: Array.from(selectedContacts),
        message: dmMessage,
        accountId: selectedAccount.id,
      });
    },
    onSuccess: (result) => {
      alert(`Sent ${result.data.sent} messages. ${result.data.failed > 0 ? `${result.data.failed} failed.` : ''}`);
      setSelectedContacts(new Set());
      setShowDMModal(false);
      setDmMessage('');
    },
  });

  // Export mutation
  const exportMutation = useMutation({
    mutationFn: async () => {
      return cloudFunctions.exportContacts({
        accountId: selectedAccount?.id,
        contactIds: selectedContacts.size > 0 ? Array.from(selectedContacts) : undefined,
        source: sourceFilter as ContactSource || undefined,
        tags: tagFilter.length > 0 ? tagFilter : undefined,
      });
    },
    onSuccess: (result) => {
      const filename = `contacts-${new Date().toISOString().split('T')[0]}.csv`;
      downloadCSV(result.data.csv, filename);
    },
  });

  const contacts = data?.contacts || [];
  const availableTags = tagsData?.tags || [];

  // Filter contacts client-side for search (in addition to server-side)
  const filteredContacts = useMemo(() => {
    if (!searchQuery) return contacts;
    const query = searchQuery.toLowerCase();
    return contacts.filter(
      (c) =>
        c.username.toLowerCase().includes(query) ||
        c.collectedData?.name?.toLowerCase().includes(query) ||
        c.collectedData?.email?.toLowerCase().includes(query)
    );
  }, [contacts, searchQuery]);

  // Select all / none
  const handleSelectAll = () => {
    if (selectedContacts.size === filteredContacts.length) {
      setSelectedContacts(new Set());
    } else {
      setSelectedContacts(new Set(filteredContacts.map((c) => c.id)));
    }
  };

  const handleSelectContact = (id: string) => {
    const newSelected = new Set(selectedContacts);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedContacts(newSelected);
  };

  const handleAddTag = () => {
    if (newTag.trim()) {
      bulkTagMutation.mutate({ tagsToAdd: [newTag.trim()] });
    }
  };

  if (accountsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className={styles.spinner} />
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div>
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
          <p className="text-gray-500 mt-1">Manage people who have interacted with your account</p>
        </div>
        <div className="rounded-xl bg-white shadow-sm border border-gray-100">
          <NoAccountPrompt onConnectClick={() => (window.location.href = '/settings')} />
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
          <p className="text-gray-500 mt-1">
            {filteredContacts.length} contacts from interactions
          </p>
        </div>
        <div className="flex items-center gap-3">
          {selectedContacts.size > 0 && (
            <>
              <Button
                onClick={() => setShowTagModal(true)}
                variant="secondary"
                size="sm"
              >
                <Tag className="mr-1.5 h-4 w-4" />
                Tag ({selectedContacts.size})
              </Button>
              <Button
                onClick={() => setShowDMModal(true)}
                variant="secondary"
                size="sm"
              >
                <Send className="mr-1.5 h-4 w-4" />
                Send DM ({selectedContacts.size})
              </Button>
            </>
          )}
          <Button
            onClick={() => exportMutation.mutate()}
            loading={exportMutation.isPending}
            variant="secondary"
          >
            <Download className="mr-1.5 h-4 w-4" />
            Export {selectedContacts.size > 0 ? `(${selectedContacts.size})` : 'All'}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-4 p-4 bg-white rounded-xl shadow-sm border border-gray-100">
        <Filter className="h-4 w-4 text-gray-400" />

        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search username, name, email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={cn(styles.input.base, 'pl-9')}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <Select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          options={sourceOptions}
          className="w-44"
        />

        {/* Tag filter dropdown */}
        {availableTags.length > 0 && (
          <div className="relative">
            <select
              value={tagFilter[0] || ''}
              onChange={(e) => setTagFilter(e.target.value ? [e.target.value] : [])}
              className={cn(styles.input.base, 'w-36')}
            >
              <option value="">All Tags</option>
              {availableTags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </div>
        )}

        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox"
            checked={hasEmailFilter}
            onChange={(e) => setHasEmailFilter(e.target.checked)}
            className="rounded border-gray-300 text-accent focus:ring-accent"
          />
          Has Email
        </label>
      </div>

      {/* Contacts List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <span className={styles.spinner} />
        </div>
      ) : filteredContacts.length === 0 ? (
        <div className="rounded-xl bg-white shadow-sm border border-gray-100 p-12 text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-accent/10 to-accent-secondary/10 flex items-center justify-center">
            <Users className="h-8 w-8 text-accent" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-gray-900">No contacts yet</h3>
          <p className="mt-2 text-gray-500">
            Contacts appear here when users interact with your account via DMs, comments, or follows
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl bg-white shadow-sm border border-gray-100">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-4 text-left">
                  <input
                    type="checkbox"
                    checked={selectedContacts.size === filteredContacts.length && filteredContacts.length > 0}
                    onChange={handleSelectAll}
                    className="rounded border-gray-300 text-accent focus:ring-accent"
                  />
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Contact
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Info
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Source
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Tags
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Last Active
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredContacts.map((contact) => (
                <tr
                  key={contact.id}
                  className={cn(
                    'hover:bg-gray-50 transition-colors',
                    selectedContacts.has(contact.id) && 'bg-accent/5'
                  )}
                >
                  <td className="px-4 py-4 whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={selectedContacts.has(contact.id)}
                      onChange={() => handleSelectContact(contact.id)}
                      className="rounded border-gray-300 text-accent focus:ring-accent"
                    />
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      {/* Profile Picture */}
                      {contact.profilePictureUrl ? (
                        <img
                          src={contact.profilePictureUrl}
                          alt={contact.username}
                          className="h-10 w-10 rounded-full object-cover"
                          onError={(e) => {
                            // Fallback to initials on error
                            (e.target as HTMLImageElement).style.display = 'none';
                            (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                          }}
                        />
                      ) : null}
                      <div
                        className={cn(
                          styles.avatar.base,
                          styles.avatar.sizes.md,
                          contact.profilePictureUrl && 'hidden'
                        )}
                      >
                        {contact.username.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">@{contact.username}</p>
                        {contact.collectedData?.name && (
                          <p className="text-xs text-gray-500">{contact.collectedData.name}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="flex flex-col gap-1">
                      {contact.collectedData?.email && (
                        <div className="flex items-center gap-1.5 text-xs text-gray-600">
                          <Mail className="h-3 w-3" />
                          <span className="truncate max-w-[150px]">{contact.collectedData.email}</span>
                        </div>
                      )}
                      {contact.collectedData?.phone && (
                        <div className="flex items-center gap-1.5 text-xs text-gray-600">
                          <Phone className="h-3 w-3" />
                          {contact.collectedData.phone}
                        </div>
                      )}
                      {!contact.collectedData?.email && !contact.collectedData?.phone && (
                        <span className="text-xs text-gray-400">No contact info</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    {contact.source && (
                      <span
                        className={cn(
                          styles.badge.base,
                          styles.badge.neutral,
                          'inline-flex items-center gap-1'
                        )}
                      >
                        {sourceIcons[contact.source]}
                        {sourceLabels[contact.source] || contact.source}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="flex flex-wrap gap-1 max-w-[200px]">
                      {contact.tags?.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className={cn(styles.badge.base, styles.badge.info)}
                        >
                          {tag}
                        </span>
                      ))}
                      {contact.tags && contact.tags.length > 3 && (
                        <span className={cn(styles.badge.base, styles.badge.neutral)}>
                          +{contact.tags.length - 3}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatRelativeTime(contact.lastMessageAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Tag Modal */}
      {showTagModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className={styles.modal.backdrop} onClick={() => setShowTagModal(false)} />
          <div className={cn(styles.modal.container, 'max-w-md z-10')}>
            <div className={styles.modal.header}>
              <h3 className={styles.modal.title}>Add Tag to {selectedContacts.size} Contacts</h3>
              <button onClick={() => setShowTagModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className={styles.modal.content}>
              <div className="space-y-4">
                {/* Existing tags */}
                {availableTags.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Select existing tag
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {availableTags.map((tag) => (
                        <button
                          key={tag}
                          onClick={() => bulkTagMutation.mutate({ tagsToAdd: [tag] })}
                          className={cn(
                            styles.badge.base,
                            styles.badge.info,
                            'cursor-pointer hover:opacity-80 transition-opacity'
                          )}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* New tag */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Or create new tag
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      placeholder="Enter tag name..."
                      className={cn(styles.input.base, 'flex-1')}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddTag()}
                    />
                    <Button
                      onClick={handleAddTag}
                      loading={bulkTagMutation.isPending}
                      disabled={!newTag.trim()}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DM Modal */}
      {showDMModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className={styles.modal.backdrop} onClick={() => setShowDMModal(false)} />
          <div className={cn(styles.modal.container, 'max-w-lg z-10')}>
            <div className={styles.modal.header}>
              <h3 className={styles.modal.title}>Send DM to {selectedContacts.size} Contacts</h3>
              <button onClick={() => setShowDMModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className={styles.modal.content}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Message</label>
                  <textarea
                    value={dmMessage}
                    onChange={(e) => setDmMessage(e.target.value)}
                    placeholder="Type your message..."
                    rows={4}
                    maxLength={1000}
                    className={cn(styles.input.base, 'resize-none')}
                  />
                  <p className="mt-1 text-xs text-gray-500">{dmMessage.length}/1000 characters</p>
                </div>

                <div className={cn(styles.banner.warning, 'text-sm')}>
                  <p className="font-medium text-yellow-800">Rate Limiting Notice</p>
                  <p className="text-yellow-700 mt-1">
                    Messages will be sent with delays to respect Instagram's rate limits. Large batches
                    may take several minutes to complete.
                  </p>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <Button variant="secondary" onClick={() => setShowDMModal(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => bulkDMMutation.mutate()}
                    loading={bulkDMMutation.isPending}
                    disabled={!dmMessage.trim()}
                  >
                    <Send className="mr-1.5 h-4 w-4" />
                    Send to {selectedContacts.size} contacts
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
