# SharePoint avatar upload

## Behaviour

- **Existing employees:** Run the migration once to upload all base64 avatars to SharePoint and replace them in the DB with SharePoint URLs. Avatars are then loaded from SharePoint when displayed.
- **New/updated avatars:** When an employee is created or their profile avatar is updated (base64 from the client), the server uploads the file to SharePoint and stores only the SharePoint URL in the DB. No base64 is stored.

## .env (your variable names)

```
MS_TENANT_ID=...
MS_CLIENT_ID=...
MS_CLIENT_SECRET=...
SHAREPOINT_SITE_ID=...
SHAREPOINT_DRIVE_ID=...
SHAREPOINT_FOLDER_PATH=HR_DATA
```

(`SHAREPOINT_FOLDER_PATH` is optional; default is `EmployeeAvatars`.)

## Azure app

- **API permissions:** Microsoft Graph → **Application permissions** → **Sites.ReadWrite.All**
- **Grant admin consent** for your tenant so the token includes the role.

## Commands

- `npm run db:test-sharepoint` – check token and drive access
- `npm run db:migrate-avatars-sharepoint` – upload existing base64 avatars to SharePoint and update DB
