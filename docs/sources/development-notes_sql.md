---
title: Development Notes (SQL design decisions, 2012)
source_file: 04_legacy-code/_dev-notes/Development-Notes_sql-and-design.docx
converted: 2026-11-10
conversion: automated text extraction, content unchanged (formatting only)
---

# Development Notes (SQL design decisions, 2012)

Development Notes

SQL Database

- SQL 2012 not supported in VS 2010

- Use Date and Time datatype as they are aligned to industry standard and don’t use datetime

- No-out of box function to get current Date or CurrentTime

- Use call

select CONVERT (date, GETUTCDATE());

select CONVERT (time, GETUTCDATE());

- Wrote a simple scalar function

- CREATE FUNCTION CurrentUTCDate ()

- RETURNS date

- AS

- BEGIN

- -- Return the result of the function

- RETURN CONVERT (date, GETUTCDATE());

- END

- GO

- -- select dbo.CurrentUTCDate();

SQL Server Management studio list don’t refresh – Confused me what happened to the function I wrote as it was failing as I executed select CurrentUTCDate();  without dbo. I was under the impression as I didn’t had dbo in creating CurrentUTCDate() – I don’t need to put it in. It will take the default – Too much to assume – It is not idot proof

SQL Table

Parkinfo – Started with the idea that I want to use the specific data types such as decimal, date, time and so on. Spent couple of hours doing this but then came to conclusion that it will be better to keep in string as insert will be faster. The only time we need to compare or search by value is for parking validation by the inspector which hopefully is much smaller sample. With smart design of using createdTime and updatedTime fields in the table which will be computed from current time.

