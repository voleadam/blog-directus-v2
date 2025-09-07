import React from 'react';
import { AlertCircle } from 'lucide-react';

interface ErrorStateProps {
  message: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({ message }) => {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <AlertCircle className="text-red-500 mb-4" size={48} />
      <h3 className="text-xl font-semibold text-slate-900 mb-2">
        Something went wrong
      </h3>
      <p className="text-slate-600 max-w-md">
        {message}
      </p>
    </div>
  );
};