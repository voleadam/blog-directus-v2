import React from 'react';
import { Calendar, User, Tag } from 'lucide-react';
import { BlogPost } from '../types/blog';

interface BlogCardProps {
  post: BlogPost;
}

export const BlogCard: React.FC<BlogCardProps> = ({ post }) => {
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const createExcerpt = (content: string, maxLength: number = 150) => {
    if (!content) return '';
    return content.length > maxLength ? content.substring(0, maxLength) + '...' : content;
  };

  return (
    <article
      className="group bg-white rounded-lg shadow-sm hover:shadow-md transition-all duration-300 hover:-translate-y-1"
    >
      {post.picture?.filename_disk && (
        <div className="aspect-video overflow-hidden rounded-t-lg">
          <img
            src={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/pictures/${post.picture.filename_disk}`}
            alt={post.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        </div>
      )}
      <div className="p-6">
        <div className="flex items-center gap-4 text-sm text-slate-500 mb-3">
          <div className="flex items-center gap-1">
            <User size={14} />
            <span>{post.author || 'Anonymous'}</span>
          </div>
          <div className="flex items-center gap-1">
            <Calendar size={14} />
            <span>{formatDate(post.date_created)}</span>
          </div>
          {post.category && (
            <div className="flex items-center gap-1">
              <Tag size={14} />
              <span>{post.category}</span>
            </div>
          )}
        </div>
        
        <h2 className="text-xl font-semibold text-slate-900 mb-3 group-hover:text-blue-600 transition-colors">
          {post.title || 'Untitled'}
        </h2>
        
        <p className="text-sm text-slate-600 leading-relaxed mb-3">
          {createExcerpt(post.content)}
        </p>
        
        <button className="text-blue-600 font-medium text-sm hover:text-blue-700 transition-colors">
          Read more →
        </button>
      </div>
    </article>
  );
};