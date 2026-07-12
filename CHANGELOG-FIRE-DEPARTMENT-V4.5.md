# Blackstone RP v4.5 — Fire Department

## Added

- Fire Department option on `apply.html`.
- Fire department tab and content on the main website.
- Fire Department in shared portal department data.
- Automatic Fire Department availability in Admin member and role department selectors.

## Existing deployment migration

The backend runs a one-time, non-destructive migration named `v4-fire-department`. It adds Fire Department to an existing configured database only when no Fire department already exists. Existing applications, members, roles and custom departments are preserved. Default Civilian and Criminal numbering is moved from 03/04 to 04/05 only when those values have not already been customised.
