# Local updates

Open `/?updates=1&area=camden_town`. The public page has a Local updates link.

The page shows BBC London news and separately checked official links. It records publication time, source check time, and geographic limits. Headlines do not establish incident dates. The BBC feed contains selected recent coverage, not a complete 30-day archive.

A saved sample contains six real headlines fetched on 12 September 2026. The user must select Show fetched news sample. This sample does not establish a successful scheduled run.

## Daily refresh

Vercel calls `/api/public/recent-updates/refresh` daily at 06:00 UTC. Its schedule must be deployed before it can run. Configure CRON_SECRET and RECENT_UPDATES_DATABASE_URL through the deployment owner. DATABASE_URL is a fallback, but its role still needs the explicit updates policy.

Apply the reviewed migration through the database owner. Assign the dedicated updates role to the server login. Keep database credentials and CRON_SECRET server-only. The public endpoint never fetches upstream data or writes storage.

The refresh rejects unauthorized requests before source or database access. It retains earlier headlines when BBC fails. Reads remove entries outside the publication window. Data becomes stale after 36 hours without a successful check.

The source URL is fixed. Redirects, XML entities, oversized responses, and unsafe article URLs fail validation. The parser stores only headlines, links, and dates.

## Manual verification

Run `npx tsx scripts/refresh-recent-updates.ts` with the server database connection configured. Inspect the returned check time and status. Do not publish credentials or raw connection errors.

A successful manual run does not verify the deployed cron. Inspect the scheduled execution and the persisted last-success time separately.

## Research and sharing

The installed last30days engine ran twice but returned no usable dated records. Reddit had TLS failures. Official links came from separate web research. See research.md.

Sharing opens the device share sheet or copies the source link and publication context. The application does not publish social posts. Private reports and unreviewed community allegations are not part of this feed.

## Validation

Backend tests cover parsing, dates, allowlists, response bounds, authentication, stale data, persistence, and concurrency. Browser tests cover source sharing, clipboard failure, area filtering, unavailable storage, saved sample, and entry/exit routing. Screenshots cover widths of 320px, 390px, and 1440px.

Hosted database provisioning and the first scheduled production run remain unverified.

## Source use

BBC's published RSS terms permit adding the news feed with prominent credit and links. The page links to BBC News and each article. It copies no images or article bodies. Business reuse requires a separate licence. This implementation targets the requested non-commercial hackathon demonstration.

Terms reference: https://downloads.bbc.co.uk/usingthebbc/bbc_terms_of_use_31March2022english.pdf, section 15. The current HTML terms page blocked the research crawler. Confirm current publisher terms before commercial use. Technical availability alone does not establish broader reuse rights.
