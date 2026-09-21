# OrbitFlow domains

All domains use the same Sites project and database. The Worker derives the
surface from the original request URL, overwrites its internal hostname header,
and preserves the platform-provided authenticated identity. No new identity
store or cross-domain credential transfer is introduced.

| Host | Root page | Access |
| --- | --- | --- |
| `www.orbitflow.work` | Marketing and enquiry capture | Public |
| `orbitflow.work` | Redirects marketing pages to `www` | Public |
| `admin.orbitflow.work` | Enquiry inbox; `/portal` opens client operations | Studio owner |
| `app.orbitflow.work` | Client dashboard | Sign-in; data limited by workspace membership |

The existing `/studio` and `/portal` pages remain usable on the marketing and
generated Sites domains while DNS propagates. API paths remain on their
original host and retain owner, membership, intake-key, and origin checks.
Auth start, callback, and sign-out paths remain owned by Sites. A session may
need to be started on each subdomain. Sign-out returns to `/signed-out` on that
host, without immediately reopening a protected dashboard.

Private hosts send `Cache-Control: private, no-store` and `X-Robots-Tag: noindex,
nofollow`; their robots file disallows all routes and their sitemap is empty.
The marketing sitemap and canonical URLs use `www`.

## GoDaddy DNS

Keep the existing apex, `www`, nameserver, and email records. Add the following
records in the `orbitflow.work` zone. TTL may stay at the default (one hour).
Names below are relative to the zone; do not append `orbitflow.work` manually.

| Type | Name | Value |
| --- | --- | --- |
| CNAME | `admin` | `custom-domains.chatgpt.site` |
| CNAME | `app` | `custom-domains.chatgpt.site` |
| TXT | `_openai-site-verification.admin` | `openai-site-verification=4K2JtiHr_W-0EqWeEbnFXznKgOdvKbdKGMcDzE4ifnk` |
| TXT | `_cf-custom-hostname.admin` | `7b8f6217-46bf-4998-8ed3-f62dcffc66a9` |
| TXT | `_openai-site-verification.app` | `openai-site-verification=QVAhV2ndCAjEpbS3peFXiT_gXbhOVxaek2xHKkTt9cQ` |
| TXT | `_cf-custom-hostname.app` | `dcb4cf44-8731-41a1-bfa5-c39f7b26c677` |

These are public DNS verification values, not application secrets. The two
custom hostnames are registered in Sites; activation and TLS remain pending
until the provider validates these records. Refresh each custom domain status
after DNS is saved. No nameserver change is needed.
