---
title: Security findings in the 2012 files - read before you git init, push, zip or share anything
severity: high (database credentials in plaintext in 59 files)
last_updated: 2026-11-10
note: I never copied any secret value into these docs. Locations only.
---

# Security findings

## Do this first
1. **Do not put this folder in Git, a cloud drive share, or a zip you send out as it is.** 59 files under `04_legacy-code/` contain a SQL connection string with user and password in plaintext (see "Where" below). Most are build copies (`obj/`, `csx/`), so cleaning one file is not enough.
2. **The 2012 database credentials: checked 2026-11-10.** The cloud database host (`slgd9ulh2b.database.windows.net`) no longer exists in DNS, so the Azure SQL password cannot open anything. The `sa` login belongs to a local SQL Server on a PC named `hp-pc` that is not reachable from outside. The one remaining risk is **password reuse**: the same password appears for both the local and the cloud login. If you ever used it anywhere else, change it there.
3. **Azure publish-settings file: checked and deleted 2026-11-10.** `00_SECRETS-QUARANTINE/azure-msdn-2012.publishsettings` is for a "Windows Azure MSDN - Visual Studio Ultimate" subscription (classic Service Management API). I read only its non-secret metadata locally and never used it to contact Azure. Its management certificate (`CN=Windows Azure Tools`) was valid 22 May 2012 to 22 May 2013, so it **expired more than 13 years ago** and cannot authenticate to anything. The apps it deployed (`parkingwebservices.cloudapp.net`, `parkingenforcementservice.cloudapp.net`) and the vendor host `geo.bwaystechnosolution.com` also no longer resolve. At your request the file was **permanently deleted** the same day, and its quarantine folder removed. To be thorough, you can look in the Azure portal under Subscriptions for one whose ID starts with `1da1dabc`.
4. Any new repo starts clean: new folder, copy only `docs/`, `database/schema.sql`, and the assets you choose. `.gitignore` in the root already excludes `04_legacy-code` and common secret files.

## Where credentials appear (no values shown)
Count: 59 files match a `User ID=...;Password=...` pattern. About 5 of them are a false positive (a sample Microsoft Access connection string inside the log4net documentation XML), so roughly 54 hold real connection strings. By target: local SQL Server `hp-pc` with the `sa` admin login (about 32 files); the Azure SQL server above with login `acube` (about 43 files); and a vendor database `bwCommon` on `bwaystechnosolution.com` (2 files, `GeoServices/web.config` in v5 and v7), which belongs to the outside developer, not to you. Do not use that one.
- `Web.config` in v2, v2b, v3, v4, v5, v6 and v7, plus their `obj/`, `csx/` and `Backup1/` copies (the majority of the 59).
- Fallback connection string hard-coded in `Util.cs` (v2 to v7, including build copies). It uses the SQL `sa` administrator login against a machine named `hp-pc`.
- `StartParking.aspx.cs` and `EndParking.aspx.cs` (v2, v2b): two hard-coded connection strings each.
- `04_legacy-code/v2_.../DevelopingCodeNotesAditya.txt`: Azure SQL server name, user and password, plus a sample registration JSON that includes a password.
- `CSAutoParameterize.parameters.xml` (v2 build output).
The `.html` clients and `Service.cs` only assign a `Password` field from the form to a request object; they do not contain secrets. I checked that after a first, too-broad scan.
Re-run the scan yourself on a private terminal (it prints the values): `rg -i "(User ID|UID)=[^;]+;\s*(Password|Pwd)=" 04_legacy-code`

## Vulnerabilities in the old code (why it should not be reused)
| # | Finding | Where | Impact |
|---|---|---|---|
| 1 | **No authentication or authorisation on any endpoint.** The caller sends its own `UserID`, `AccountID`; nothing checks a token | `Service.cs` | Anyone can start/end anyone's parking, read all areas, create areas |
| 2 | **Plaintext passwords**, compared directly in SQL, stored in `nvarchar(64)` | `UserInfo.cs` | Full account takeover on DB leak |
| 3 | **SQL injection / arbitrary SQL execution.** The client sends coordinates; the server builds `INSERT` statements by string concatenation and passes them to a proc that runs `sp_sqlexec` on the string | `Service.InsertLocationTitleToServer`, `geo_InsertLocationTitle.sql` | A caller can run any SQL as the app login |
| 4 | **Raw SQL helpers** `DataAccessUtil.insert/update/delete/dataset(string sql)` | `DataAccess.cs` | Same class of risk |
| 5 | **Weak, colliding ids**: `DateTime.Now.ToString().GetHashCode()` is used as transaction id and as the user id. Second-level resolution, 32-bit, and `GetHashCode` is not stable across .NET versions | `Service.cs` | Two users in the same second collide; ids are guessable |
| 6 | **CORS `Access-Control-Allow-Origin: *`** and a note to launch Chrome with `--disable-web-security` | `Global.asax.cs`, dev notes | Any site can call the API from a user's browser |
| 7 | **HTTP GET and POST enabled for ASMX** (readme tells you to add `HttpGet`) | `web.config` | Credentials and coordinates can end up in URLs and logs |
| 8 | **Connection string printed to the console** | `Util.cs` | Secret leakage in logs |
| 9 | **Exceptions swallowed**, connections left open, a `finally { if (cmd == null) cmd.Connection.Close(); }` null-dereference bug | `ParkInfo.cs`, `UserInfo.cs` | Silent data loss, connection leaks |
| 10 | **Plain HTTP** to every host; geocoding and geonames called over `http://` | clients, `ServicesBO.cs` | Eavesdropping, tampering |
| 11 | `UserService` update/get-user branches unreachable | `Service.cs` | Logic bug (login via this method cannot work as written) |
| 12 | SQL `Password` and location history stored with no encryption or retention policy | schema | Privacy exposure (location is sensitive personal data) |

## Lessons baked into the new design
- Identity from a verified token, never from a request field. Row-level ownership checks in the database.
- Parameterised queries or an ORM only; no dynamic SQL.
- Password hashing delegated to an auth provider (no password column in the app schema).
- UUIDs generated by the database; client-generated **idempotency keys** for retries.
- Secrets in environment variables / secret manager, never in source or app bundles (a mobile binary is public: anything inside it can be read).
- TLS everywhere; strict CORS allow-list.
- Location data: collect minimum, store with retention limit, support delete/export.
