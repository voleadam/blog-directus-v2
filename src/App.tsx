import React, { useState, useMemo } from 'react';
import { PenTool } from 'lucide-react';
import { useBlogPosts } from './hooks/useBlogPosts';
import { BlogGrid } from './components/BlogGrid';
import { SearchBar } from './components/SearchBar';
import { LoadingState } from './components/LoadingState';
import { ErrorState } from './components/ErrorState';

function App() {
  const { posts, loading, error } = useBlogPosts();
  const [searchTerm, setSearchTerm] = useState('');

  const filteredPosts = useMemo(() => {
    if (!searchTerm) return posts;
    
    return posts.filter(post =>
      post.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      post.content?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      post.author?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      post.category?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [posts, searchTerm]);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <PenTool className="text-blue-600" size={32} />
              <h1 className="text-3xl font-bold text-slate-900">Blog</h1>
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl text-slate-600 mb-2">
                Discover insights, tutorials, and stories
              </h2>
              <p className="text-slate-500">
                {posts.length} {posts.length === 1 ? 'article' : 'articles'} available
              </p>
            </div>
            <SearchBar
              value={searchTerm}
              onChange={setSearchTerm}
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} />
        ) : filteredPosts.length === 0 ? (
          <div className="text-center py-12">
            <h3 className="text-xl font-semibold text-slate-900 mb-2">
              {searchTerm ? 'No results found' : 'No blog posts yet'}
            </h3>
            <p className="text-slate-600">
              {searchTerm 
                ? `Try searching for something else or clear your search.`
                : 'Check back later for new content.'
              }
            </p>
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Clear search
              </button>
            )}
          </div>
        ) : (
          <BlogGrid posts={filteredPosts} />
        )}
      </main>
    </div>
  );
}

export default App;