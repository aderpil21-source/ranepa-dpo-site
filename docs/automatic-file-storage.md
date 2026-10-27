# Automatic Google Drive originals and Russian download copies

Deployed 27 October 2026. Production Apps Script project:
`1dNIituF6QDR8d-QcuUfrs0e17t0SSJDA1Hfm-XQMhqGMG_HYNObA2Aq0`.
The existing `AKfycbxCqcmGgAhHU3dG7ClzCjJZpELqpF-ic9H_Qg49BysA30Ybl4khxnwPOS7Pj9gE3g9I`
deployment is updated in place. Other similarly named Apps Script projects are copies.

## Runtime

* Teacher email attachments still go to the existing Drive folder. A script lock
  serializes code allocation, and codes use `ЛК-` plus eight UUID hex digits,
  checked against existing sheet entries. Old four-digit codes remain valid.
  The message ID, assigned code and notification state are saved after the row
  is committed, before sending the usual reply to the verified teacher address.
* Study-plan uploads still save PDFs on Drive and retain Drive URLs in the sheet,
  preserving existing archive and restore behavior.
* Existing news uploads still save originals on Drive. Public news responses,
  including URLs embedded in rich text, use completed Russian copies.
* PRO media uploads first finish their existing Yandex upload and then enqueue
  a Drive archive using authenticated `siteArchiveMedia`. The queue is stored
  on the server, so closing the browser does not stop an accepted archive job.
  The PRO media panel shows whether the Drive archive is pending or complete.
* `syncRussianFileMirrors` and `syncRussianDriveArchives` run every minute through
  Apps Script time triggers, independently of ChatGPT. Actual invocation timing
  is controlled by Google. Teacher email processing has a separate lock and is
  not blocked by a long file copy.

The public API rewrites URLs using completed-copy records in script properties;
it does not overwrite authoritative Drive URLs. Russian copies are immutable
per Drive file ID. Uploading a replacement through the portal creates a new ID.
Directly overwriting a Drive file under the same ID needs explicit cache renewal.

The Yandex function copies only files found in the current published material,
programme, news or public-settings data. Hidden materials cannot be mirrored
through an arbitrary file-ID request. Google HTML/login/error responses are
rejected. Files stream to Object Storage without buffering the complete file.
The function uses its attached service account's short-lived metadata token;
no static storage credentials are published or copied to the browser.

Service account `ranepa-file-mirror` (`ajeuf1mkfbhtktg9afpd`) has
`storage.uploader` on `ranepa-dpo-materials-20261026` only, with no folder role.
Objects can be downloaded by their unlisted URLs; bucket listing and settings
remain private. The function has a 180-second timeout and 128 MB memory.

## Limits and retries

The automatic archive supports files up to 500 MB and transfers 8 MB chunks.
It checks the Drive upload session before continuing, recovering an ambiguous
completed upload without blindly creating another file. Failed jobs remain in
the server queue and retry with backoff, capped at one hour between attempts.
The existing browser upload limits and study-plan PDF validation still apply.
The bucket currently has a 1 GB quota; storage and account quotas can interrupt
new copies and must be increased before reaching capacity.

Published files remain on Drive as originals. A fresh upload may briefly retain
its Drive URL until its Russian copy is ready. Material lookup attempts to create
a missing copy on demand and returns an explicit temporary error if it cannot.
Google remains a server-side metadata and original-file dependency. No claim is
made about every ISP or provider outage.

## Source maintenance

`apps-script/RussianMirrors.gs` and `apps-script/DriveArchive.gs` contain the
deployed additions. In the existing main Apps Script file, rename the original
`doGet` to `portalDoGetOriginal_`, rename the original `parseIncomingEmails`
to `parseIncomingEmailsOriginal_`, and replace the old code generator with the
one in the additions. At the start of `doPost`, call `russiaHandlePost_` and
return its non-null response before existing handlers.

In the email loop, call `russiaResumeEmail_(message,sender)` after sender
validation and skip a resumed message. After appending the material row, flush
the sheet and save `RU_MAIL_` plus the message ID with `{code,subject,sent:false,at}`;
then call the same resume helper to send the normal reply. Run
`installRussianFileMirrors` once; it adds missing triggers without duplicates.

Build the Yandex package with `scripts/package-material-yandex.py`. The optional
second data argument is a deployment-only URL-hash mapping for migrated legacy
files. Do not commit private code directories, valid codes, file mappings, OAuth
tokens or upload-session URLs.
