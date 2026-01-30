'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import FlowEditorClient from './FlowEditorClient';

function FlowEditorContent() {
  const searchParams = useSearchParams();
  const flowId = searchParams.get('id');

  return <FlowEditorClient flowId={flowId} />;
}

export default function FlowEditorPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    }>
      <FlowEditorContent />
    </Suspense>
  );
}
