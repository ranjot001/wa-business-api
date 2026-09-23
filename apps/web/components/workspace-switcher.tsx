'use client';

import * as React from 'react';
import { useAuth } from './auth-provider';

/**
 * Switches the active workspace. The choice is what every later request sends
 * as X-Workspace-Id, and it is remembered in localStorage by AuthProvider.
 */
export function WorkspaceSwitcher(): React.JSX.Element | null {
  const { workspaces, activeWorkspace, setActiveWorkspace } = useAuth();

  if (workspaces.length === 0) {
    return null;
  }

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="sr-only">Active workspace</span>
      <select
        className="h-9 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        value={activeWorkspace?.id ?? ''}
        onChange={(event) => {
          setActiveWorkspace(event.target.value);
        }}
      >
        {workspaces.map((workspace) => (
          <option key={workspace.id} value={workspace.id}>
            {workspace.name}
          </option>
        ))}
      </select>
      {activeWorkspace ? (
        <span className="rounded bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
          {activeWorkspace.role}
        </span>
      ) : null}
    </label>
  );
}
