'use client';

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Image, Check, ChevronDown, Play, Grid3X3, Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { cloudFunctions, InstagramPost } from '@/lib/firebase';

// Simplified Post interface for backwards compatibility
interface Post {
  id: string;
  thumbnail?: string;
  caption?: string;
  timestamp?: number;
}

type PostSelectionMode = 'specific' | 'any' | 'next';

interface PostSelectorProps {
  selectedPostIds: string[];
  onChange: (postIds: string[]) => void;
  posts?: Post[];
  isLoading?: boolean;
  placeholder?: string;
  accountId?: string;
  // New ManyChat-style props
  mode?: PostSelectionMode;
  onModeChange?: (mode: PostSelectionMode) => void;
  keywords?: string[];
  onKeywordsChange?: (keywords: string[]) => void;
  replyToComments?: boolean;
  onReplyToCommentsChange?: (reply: boolean) => void;
  showPreview?: boolean;
  showKeywordFilter?: boolean;
  showReplyToggle?: boolean;
}

export function PostSelector({
  selectedPostIds,
  onChange,
  posts: externalPosts,
  isLoading: externalLoading = false,
  placeholder = 'Select posts (optional)',
  accountId,
  mode = selectedPostIds.length > 0 ? 'specific' : 'any',
  onModeChange,
  keywords = [],
  onKeywordsChange,
  replyToComments = false,
  onReplyToCommentsChange,
  showPreview = true,
  showKeywordFilter = true,
  showReplyToggle = true,
}: PostSelectorProps) {
  const [showAllPosts, setShowAllPosts] = useState(false);
  const [keywordInput, setKeywordInput] = useState(keywords.join(', '));
  const [keywordMode, setKeywordMode] = useState<'specific' | 'any'>(keywords.length > 0 ? 'specific' : 'any');
  const [internalMode, setInternalMode] = useState<PostSelectionMode>(mode);

  // Fetch posts from API if accountId is provided and no external posts
  const { data: fetchedPosts, isLoading: fetchingPosts } = useQuery({
    queryKey: ['instagram-posts', accountId],
    queryFn: async () => {
      if (!accountId) return [];
      const result = await cloudFunctions.getUserInstagramPosts({ accountId, limit: 25 });
      return result.data.posts.map((post: InstagramPost) => ({
        id: post.id,
        thumbnail: post.thumbnailUrl || post.mediaUrl,
        caption: post.caption,
        timestamp: new Date(post.timestamp).getTime(),
        mediaType: post.mediaType,
        permalink: post.permalink,
      }));
    },
    enabled: !!accountId && !externalPosts?.length,
  });

  const posts = externalPosts?.length ? externalPosts : (fetchedPosts || []);
  const isLoading = externalLoading || fetchingPosts;
  const currentMode = onModeChange ? mode : internalMode;
  const selectedPost = selectedPostIds.length > 0 ? posts.find(p => p.id === selectedPostIds[0]) : null;

  // Update internal mode when prop changes
  useEffect(() => {
    if (mode !== internalMode) {
      setInternalMode(mode);
    }
  }, [mode, internalMode]);

  const handleModeChange = (newMode: PostSelectionMode) => {
    if (onModeChange) {
      onModeChange(newMode);
    } else {
      setInternalMode(newMode);
    }

    if (newMode !== 'specific') {
      onChange([]);
    }
  };

  const handleToggle = (postId: string) => {
    if (selectedPostIds.includes(postId)) {
      onChange(selectedPostIds.filter((id) => id !== postId));
    } else {
      onChange([...selectedPostIds, postId]);
    }
  };

  const handleKeywordInputBlur = () => {
    if (onKeywordsChange) {
      const newKeywords = keywordInput
        .split(',')
        .map(k => k.trim())
        .filter(k => k.length > 0);
      onKeywordsChange(newKeywords);
    }
  };

  const visiblePosts = showAllPosts ? posts : posts.slice(0, 6);

  return (
    <div className="space-y-6">
      {/* Main content area with two columns */}
      <div className={cn("grid gap-6", showPreview ? "grid-cols-1 lg:grid-cols-5" : "grid-cols-1")}>
        {/* Left column - Selection options */}
        <div className={cn("space-y-4", showPreview ? "lg:col-span-3" : "")}>
          {/* Post Selection Section */}
          <div className="space-y-3">
            <label className="block text-sm font-medium text-gray-700">
              When someone comments on
            </label>

            <div className="space-y-2 bg-gray-50 rounded-lg p-4">
              {/* Specific post option */}
              <div className="flex items-start gap-3">
                <input
                  type="radio"
                  id="postSelection-specific"
                  name="postSelectionMode"
                  checked={currentMode === 'specific'}
                  onChange={() => handleModeChange('specific')}
                  className="mt-1 h-4 w-4 text-accent border-gray-300 focus:ring-accent cursor-pointer"
                />
                <div className="flex-1">
                  <label htmlFor="postSelection-specific" className="text-sm font-medium text-gray-900 cursor-pointer">
                    a specific post or reel
                  </label>

                  {currentMode === 'specific' && (
                    <div className="mt-3 space-y-3">
                      {/* Thumbnail grid */}
                      {isLoading ? (
                        <div className="flex items-center gap-2 text-sm text-gray-500">
                          <span className="animate-spin h-4 w-4 border-2 border-gray-300 border-t-accent rounded-full" />
                          Loading posts...
                        </div>
                      ) : posts.length === 0 ? (
                        <div className="text-sm text-gray-500">
                          <Image className="h-6 w-6 text-gray-300 mb-1" />
                          No posts found
                        </div>
                      ) : (
                        <>
                          <div className="grid grid-cols-6 gap-2">
                            {visiblePosts.map((post) => {
                              const isSelected = selectedPostIds.includes(post.id);
                              return (
                                <button
                                  key={post.id}
                                  type="button"
                                  onClick={() => handleToggle(post.id)}
                                  className={cn(
                                    'relative aspect-square rounded-lg overflow-hidden border-2 transition-all',
                                    isSelected
                                      ? 'border-accent ring-2 ring-accent/20'
                                      : 'border-transparent hover:border-gray-300'
                                  )}
                                >
                                  {post.thumbnail ? (
                                    <img
                                      src={post.thumbnail}
                                      alt=""
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                                      <Image className="w-4 h-4 text-gray-400" />
                                    </div>
                                  )}
                                  {isSelected && (
                                    <div className="absolute inset-0 bg-accent/20 flex items-center justify-center">
                                      <div className="bg-accent rounded-full p-1">
                                        <Check className="w-3 h-3 text-white" />
                                      </div>
                                    </div>
                                  )}
                                </button>
                              );
                            })}
                          </div>

                          {posts.length > 6 && (
                            <button
                              type="button"
                              onClick={() => setShowAllPosts(!showAllPosts)}
                              className="text-sm text-accent hover:text-accent-secondary font-medium flex items-center gap-1"
                            >
                              <Grid3X3 className="w-4 h-4" />
                              {showAllPosts ? 'Show Less' : `Show All (${posts.length})`}
                            </button>
                          )}

                          {selectedPostIds.length > 0 && (
                            <p className="text-xs text-gray-500">
                              {selectedPostIds.length} post{selectedPostIds.length > 1 ? 's' : ''} selected
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Any post option */}
              <div className="flex items-start gap-3">
                <input
                  type="radio"
                  id="postSelection-any"
                  name="postSelectionMode"
                  checked={currentMode === 'any'}
                  onChange={() => handleModeChange('any')}
                  className="mt-1 h-4 w-4 text-accent border-gray-300 focus:ring-accent cursor-pointer"
                />
                <div>
                  <label htmlFor="postSelection-any" className="text-sm font-medium text-gray-900 cursor-pointer">
                    any post or reel
                  </label>
                  <p className="text-xs text-gray-500">Trigger on all current and future posts</p>
                </div>
              </div>

              {/* Next post option */}
              <div className="flex items-start gap-3">
                <input
                  type="radio"
                  id="postSelection-next"
                  name="postSelectionMode"
                  checked={currentMode === 'next'}
                  onChange={() => handleModeChange('next')}
                  className="mt-1 h-4 w-4 text-accent border-gray-300 focus:ring-accent cursor-pointer"
                />
                <div>
                  <label htmlFor="postSelection-next" className="text-sm font-medium text-gray-900 cursor-pointer">
                    next post or reel
                  </label>
                  <p className="text-xs text-gray-500">Trigger on your next published post only</p>
                </div>
              </div>
            </div>
          </div>

          {/* Keyword Filter Section */}
          {showKeywordFilter && (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">
                And this comment has
              </label>

              <div className="space-y-2 bg-gray-50 rounded-lg p-4">
                {/* Specific keywords option */}
                <div className="flex items-start gap-3">
                  <input
                    type="radio"
                    id="keywordMode-specific"
                    name="keywordMode"
                    checked={keywordMode === 'specific'}
                    onChange={() => setKeywordMode('specific')}
                    className="mt-1 h-4 w-4 text-accent border-gray-300 focus:ring-accent cursor-pointer"
                  />
                  <div className="flex-1">
                    <label htmlFor="keywordMode-specific" className="text-sm font-medium text-gray-900 cursor-pointer">
                      a specific word or words
                    </label>

                    {keywordMode === 'specific' && (
                      <div className="mt-2 space-y-2">
                        <input
                          type="text"
                          value={keywordInput}
                          onChange={(e) => setKeywordInput(e.target.value)}
                          onBlur={handleKeywordInputBlur}
                          placeholder="Enter keywords separated by commas"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                        />
                        <p className="text-xs text-gray-500">
                          Examples: <span className="font-medium">Price</span>, <span className="font-medium">Link</span>, <span className="font-medium">Info</span>
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Any word option */}
                <div className="flex items-start gap-3">
                  <input
                    type="radio"
                    id="keywordMode-any"
                    name="keywordMode"
                    checked={keywordMode === 'any'}
                    onChange={() => {
                      setKeywordMode('any');
                      setKeywordInput('');
                      onKeywordsChange?.([]);
                    }}
                    className="mt-1 h-4 w-4 text-accent border-gray-300 focus:ring-accent cursor-pointer"
                  />
                  <div>
                    <label htmlFor="keywordMode-any" className="text-sm font-medium text-gray-900 cursor-pointer">
                      any word
                    </label>
                    <p className="text-xs text-gray-500">Trigger on any comment</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Reply to Comments Toggle */}
          {showReplyToggle && (
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={replyToComments}
                onChange={(e) => onReplyToCommentsChange?.(e.target.checked)}
                className="h-4 w-4 text-accent border-gray-300 rounded focus:ring-accent"
              />
              <span className="text-sm text-gray-700">
                Reply to their comments under the post
              </span>
            </label>
          )}
        </div>

        {/* Right column - Preview */}
        {showPreview && (
          <div className="lg:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Preview
            </label>
            <div className="bg-gray-100 rounded-2xl p-4 flex items-center justify-center min-h-[300px]">
              <div className="bg-white rounded-3xl shadow-lg w-full max-w-[200px] overflow-hidden border border-gray-200">
                {/* Phone frame */}
                <div className="bg-gray-900 h-6 flex items-center justify-center">
                  <div className="w-16 h-1 bg-gray-700 rounded-full" />
                </div>

                {/* Content */}
                <div className="p-2">
                  {selectedPost ? (
                    <div>
                      {/* Post header */}
                      <div className="flex items-center gap-2 p-2">
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-accent to-accent-secondary" />
                        <span className="text-xs font-semibold">your_account</span>
                      </div>

                      {/* Post image */}
                      <div className="aspect-square bg-gray-100 rounded overflow-hidden">
                        {selectedPost.thumbnail ? (
                          <img
                            src={selectedPost.thumbnail}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Image className="w-8 h-8 text-gray-300" />
                          </div>
                        )}
                      </div>

                      {/* Post caption */}
                      <div className="p-2">
                        <p className="text-[10px] text-gray-600 line-clamp-2">
                          {selectedPost.caption || 'No caption'}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="h-48 flex flex-col items-center justify-center text-gray-400">
                      <Smartphone className="w-8 h-8 mb-2" />
                      <p className="text-xs text-center">
                        Select a post to<br />see preview
                      </p>
                    </div>
                  )}
                </div>

                {/* Phone bottom bar */}
                <div className="bg-gray-100 h-4 flex items-center justify-center">
                  <div className="w-12 h-1 bg-gray-300 rounded-full" />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Legacy export for backwards compatibility
export function LegacyPostSelector({
  selectedPostIds,
  onChange,
  posts = [],
  isLoading = false,
  placeholder = 'Select posts (optional)',
}: {
  selectedPostIds: string[];
  onChange: (postIds: string[]) => void;
  posts?: Post[];
  isLoading?: boolean;
  placeholder?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const handleToggle = (postId: string) => {
    if (selectedPostIds.includes(postId)) {
      onChange(selectedPostIds.filter((id) => id !== postId));
    } else {
      onChange([...selectedPostIds, postId]);
    }
  };

  const handleRemove = (postId: string) => {
    onChange(selectedPostIds.filter((id) => id !== postId));
  };

  const handleClearAll = () => {
    onChange([]);
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">
        Specific Posts
      </label>

      {/* Selected posts chips */}
      {selectedPostIds.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {selectedPostIds.map((postId) => {
            const post = posts.find((p) => p.id === postId);
            return (
              <div
                key={postId}
                className="flex items-center gap-1.5 px-2 py-1 bg-gray-100 rounded-lg text-sm"
              >
                {post?.thumbnail ? (
                  <img
                    src={post.thumbnail}
                    alt=""
                    className="w-5 h-5 rounded object-cover"
                  />
                ) : (
                  <Image className="w-4 h-4 text-gray-400" />
                )}
                <span className="text-gray-700 max-w-[100px] truncate">
                  {post?.caption?.substring(0, 20) || `Post ${postId.substring(0, 8)}...`}
                </span>
                <button
                  onClick={() => handleRemove(postId)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
          {selectedPostIds.length > 1 && (
            <button
              onClick={handleClearAll}
              className="text-xs text-gray-500 hover:text-gray-700 underline"
            >
              Clear all
            </button>
          )}
        </div>
      )}

      {/* Dropdown trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full text-left px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-500 hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
      >
        {selectedPostIds.length === 0
          ? placeholder
          : `${selectedPostIds.length} post${selectedPostIds.length > 1 ? 's' : ''} selected`}
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="border border-gray-200 rounded-lg shadow-lg bg-white max-h-64 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 text-center text-gray-500 text-sm">
              Loading posts...
            </div>
          ) : posts.length === 0 ? (
            <div className="p-4 text-center text-gray-500 text-sm">
              <Image className="h-8 w-8 mx-auto mb-2 text-gray-300" />
              <p>No posts found</p>
              <p className="text-xs mt-1">Posts will appear here once available</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {/* All posts option */}
              <button
                type="button"
                onClick={() => {
                  onChange([]);
                  setIsOpen(false);
                }}
                className={cn(
                  'w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50',
                  selectedPostIds.length === 0 && 'bg-accent/5'
                )}
              >
                <div className="w-12 h-12 rounded bg-gray-100 flex items-center justify-center">
                  <Image className="w-6 h-6 text-gray-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">All posts</p>
                  <p className="text-xs text-gray-500">Trigger on any post</p>
                </div>
                {selectedPostIds.length === 0 && (
                  <Check className="w-5 h-5 text-accent" />
                )}
              </button>

              {/* Individual posts */}
              {posts.map((post) => {
                const isSelected = selectedPostIds.includes(post.id);
                return (
                  <button
                    key={post.id}
                    type="button"
                    onClick={() => handleToggle(post.id)}
                    className={cn(
                      'w-full flex items-center gap-3 p-3 text-left hover:bg-gray-50',
                      isSelected && 'bg-accent/5'
                    )}
                  >
                    {post.thumbnail ? (
                      <img
                        src={post.thumbnail}
                        alt=""
                        className="w-12 h-12 rounded object-cover"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded bg-gray-100 flex items-center justify-center">
                        <Image className="w-6 h-6 text-gray-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 truncate">
                        {post.caption?.substring(0, 50) || 'No caption'}
                      </p>
                      {post.timestamp && (
                        <p className="text-xs text-gray-500">
                          {new Date(post.timestamp).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    {isSelected && (
                      <Check className="w-5 h-5 text-accent" />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Close button */}
          <div className="p-2 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="w-full px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded"
            >
              Done
            </button>
          </div>
        </div>
      )}

      <p className="text-xs text-gray-500">
        Leave empty to trigger on all posts, or select specific posts
      </p>
    </div>
  );
}
