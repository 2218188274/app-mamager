# SQLite components

ChatQ uses the official NuGet package Microsoft.Data.Sqlite 10.0.14 and its pinned minimum dependencies SQLitePCLRaw 2.1.13. No source or binary from the user-supplied WeChat exporter is redistributed.

- Microsoft.Data.Sqlite / Microsoft.Data.Sqlite.Core: MIT; copyright Microsoft Corporation and .NET Foundation contributors. See Microsoft-Data-Sqlite-MIT.txt and https://github.com/dotnet/efcore .
- SQLitePCLRaw core, provider.e_sqlite3, bundle_e_sqlite3 and lib.e_sqlite3: Apache-2.0; Copyright 2014-2024 SourceGear, LLC. See SQLitePCLRaw-Apache-2.0.txt and https://github.com/ericsink/SQLitePCL.raw .
- SQLite engine: public domain, https://www.sqlite.org/copyright.html .

The native runtime is bundled with the self-contained assistant; the app does not replace any Windows system library or use the reference exporter's executables or key tools. The explicit --check-export-runtime diagnostic uses an in-memory database only and does not initialize the normal app, vault, messaging or GUI.
