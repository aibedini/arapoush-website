-- User management: profile fields, forced password change, time-limited access, soft delete.
ALTER TABLE principals ADD COLUMN title text;                                   -- job title, shown in the console
ALTER TABLE principals ADD COLUMN notes text NOT NULL DEFAULT '';               -- admin-only note
ALTER TABLE principals ADD COLUMN must_change_password boolean NOT NULL DEFAULT false;  -- temporary password: only self-service until changed
ALTER TABLE principals ADD COLUMN access_expires_at timestamptz;                -- no sign-in and no session after this time (contractors)
ALTER TABLE principals ADD COLUMN deleted_at timestamptz;                       -- soft delete: the row stays for the audit trail and references
