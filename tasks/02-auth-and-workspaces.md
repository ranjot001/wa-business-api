# Task 02: Auth, users, workspaces, members

Depends on: 01. Roadmap milestone: 2.

## Goal
Register, login, refresh, and create workspaces. Every non-public endpoint requires a JWT and an X-Workspace-Id header and knows the caller's role.

## Schema (add to packages/db)
- users: id, email unique, password_hash, name, avatar_url, email_verified_at, last_login_at, timestamps
- workspaces: id, name, slug unique, timezone, plan text default 'trial', subscription_status text default 'trialing', trial_ends_at, business_hours jsonb, timestamps
- workspace_members: id, workspace_id, user_id, role enum (owner, admin, agent), unique (workspace_id, user_id)
- invitations: id, workspace_id, email, role, token unique, expires_at, accepted_at, invited_by
- refresh_tokens: id, user_id, token_hash, expires_at, revoked_at, user_agent
- audit_logs: id, workspace_id, actor_id, action, target_type, target_id, metadata jsonb, created_at

## Endpoints
```
POST /v1/auth/register        {email, password, name}   -> {user, access_token} + refresh cookie
POST /v1/auth/login           {email, password}         -> {user, access_token} + refresh cookie
POST /v1/auth/refresh         (cookie)                  -> {access_token}, rotates refresh token
POST /v1/auth/logout                                    revokes refresh token
POST /v1/auth/forgot-password {email}                   sends Resend email with token (log to console if no RESEND_API_KEY)
POST /v1/auth/reset-password  {token, password}
GET  /v1/me                                             -> {user, workspaces:[{id,name,slug,role}]}
PATCH /v1/me                  {name, avatar_url}
PATCH /v1/me/password         {current_password, new_password}

POST /v1/workspaces           {name, timezone}          creator becomes owner, trial_ends_at = now + 14d
GET  /v1/workspaces/current
PATCH /v1/workspaces/current  {name, timezone, business_hours}   admin+
DELETE /v1/workspaces/current                           owner, soft delete

GET  /v1/members                                        agent+
PATCH /v1/members/:userId     {role}                    admin+, cannot remove last owner
DELETE /v1/members/:userId                              admin+, cannot remove self if last owner

POST /v1/invitations          {email, role}             admin+
GET  /v1/invitations                                    admin+
DELETE /v1/invitations/:id                              admin+
POST /v1/invitations/accept   {token, name?, password?} public; creates user if email not registered
```

## Implementation notes
- argon2 for passwords. Access JWT 15 min, refresh 30 days in httpOnly secure sameSite=lax cookie.
- WorkspaceGuard: reads X-Workspace-Id, loads membership, attaches req.workspace, req.member, req.role. RolesGuard with @Roles('admin') decorator, hierarchy owner > admin > agent.
- @CurrentUser() and @CurrentWorkspace() param decorators.
- Rate limit auth endpoints: 10 per minute per IP (@nestjs/throttler).
- Audit log on member role change, member removal, workspace delete.
- Seed script: one user (ranjot@example.com / password from env), one workspace "Demo".

## Web
- /register, /login, /forgot-password, /reset-password, /invite/[token] pages with shadcn forms
- Auth provider: stores access token in memory, refreshes on 401 once, redirects to /login on failure
- Workspace switcher in a minimal app shell; persist active workspace id in localStorage (this is the web app, not a Claude artifact, so localStorage is fine here)
- /onboarding step 1: create workspace

## Acceptance
- Register, login, hit GET /v1/me, create a workspace, invite a second email, accept in another browser, second user sees the workspace as agent
- Agent calling PATCH /v1/workspaces/current gets 403 FORBIDDEN
- Access token expires after 15 minutes and the web app silently refreshes
- Supertest tests for register, login, guard rejection, role rejection

## Ranjot reviews
- WorkspaceGuard end to end. Every future endpoint relies on it.
- The refresh rotation logic and why the old token is revoked
