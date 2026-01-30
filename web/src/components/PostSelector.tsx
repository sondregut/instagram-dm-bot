'use client';

import { useState } from 'react';
import { X, Image, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Post {
  id: string;
  thumbnail?: string;
  caption?: string;
  timestamp?: number;
}

interface PostSelectorProps {
  selectedPostIds: string[];
  onChange: (postIds: string[]) => void;
  posts?: Post[];
  isLoading?: boolean;
  placeholder?: string;
}

export function PostSelector({
  selectedPostIds,
  onChange,
  posts = [],
  isLoading = false,
  placeholder = 'Select posts (optional)',
}: PostSelectorProps) {
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
