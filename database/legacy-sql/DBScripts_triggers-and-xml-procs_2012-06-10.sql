USE [AgileParking]
GO
/****** Object:  Trigger [dbo].[Audit_CreateTrigger]    Script Date: 10/06/2012 9:18:54 AM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
ALTER TRIGGER [dbo].[Audit_CreateTrigger] ON [dbo].[Audit] 
	After Insert  
AS 
update Audit
    set CreatedDate = CONVERT([date],getutcdate()), CreatedTime = CONVERT([time],getutcdate())
	where audit.TxID = (select i.TxId from inserted i)

USE [AgileParking]
GO
/****** Object:  StoredProcedure [dbo].[sp_UpdateParkInfoXML]    Script Date: 10/06/2012 8:45:08 AM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
ALTER PROC [dbo].[sp_UpdateParkInfoXML] @parkInfo nText
AS 
 DECLARE @hDoc int   
 
exec sp_xml_preparedocument @hDoc OUTPUT,@parkInfo   

/**
--This code updates old data.
UPDATE ParkInfo 
 SET 
   ParkInfo.EndDateTime = XMLParkInfo.EndDateTime,
   ParkInfo.LinkedTx = XMLParkInfo.LinkedTx
 FROM OPENXML(@hDoc, 'ParkInfo')   
       WITH (TxID BigInt, EndDateTime varchar(128),  LinkedTx varchar(1000))  XMLParkInfo
WHERE    ParkInfo.TxID = XMLParkInfo.TxID
**/

EXEC sp_xml_removedocument @hDoc


///////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////
USE [AgileParking]
GO
/****** Object:  StoredProcedure [dbo].[sp_InsertUserInfoXML]    Script Date: 10/06/2012 8:32:36 AM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

ALTER PROC [dbo].[sp_InsertUserInfoXML] @Info nText
AS 
 DECLARE @hDoc int   
 
exec sp_xml_preparedocument @hDoc OUTPUT,@Info   

/**
Insert Into UserInfo 
SELECT  * 
	FROM    OPENXML (@hdoc, '/UserInfo',2) with UserInfo
**/

EXEC sp_xml_removedocument @hDoc


--This code updates old data.
 --UPDATE ParkInfo 
 --SET 
 --  Employee.FirstName = XMLEmployee.FirstName,
 --  Employee.LastName = XMLEmployee.LastName
 --FROM OPENXML(@hDoc, 'NewDataSet/Employee')   
 --      WITH (EmployeeId Integer, FirstName varchar(100),  LastName varchar(100))  XMLEmployee
--WHERE    Employee.EmployeeId = XMLEmployee.EmployeeId



/////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////

USE [AgileParking]
GO
/****** Object:  StoredProcedure [dbo].[sp_InsertParkInfoXML]    Script Date: 10/06/2012 8:31:54 AM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
ALTER PROC [dbo].[sp_InsertParkInfoXML] @parkInfo nText
AS 
 DECLARE @hDoc int   
 
exec sp_xml_preparedocument @hDoc OUTPUT,@parkInfo   

/*
Insert Into ParkInfo 
SELECT  * 
	FROM    OPENXML (@hdoc, '/ParkInfo',2) with ParkInfo
*/

EXEC sp_xml_removedocument @hDoc

--This code updates old data.
 --UPDATE ParkInfo 
 --SET 
 --  Employee.FirstName = XMLEmployee.FirstName,
 --  Employee.LastName = XMLEmployee.LastName
 --FROM OPENXML(@hDoc, 'NewDataSet/Employee')   
 --      WITH (EmployeeId Integer, FirstName varchar(100),  LastName varchar(100))  XMLEmployee
--WHERE    Employee.EmployeeId = XMLEmployee.EmployeeId

--This code inserts new data.

--Insert Into Employee 
--SELECT   EmployeeId, FirstName, LastName
--	FROM       OPENXML (@hdoc, '/NewDataSet/Employee',1)
--WITH (EmployeeId Integer, FirstName varchar(100),  LastName varchar(100))  XMLEmployee
--Where XMLEmployee.EmployeeId Not IN (Select EmployeeID from Employee)

--EXEC sp_xml_removedocument @hDoc

///////////////////////////////////////////////////////////////////////
//////////////////////////////////////////////////////////////////////
USE [AgileParking]
GO
/****** Object:  StoredProcedure [dbo].[sp_CompleteParkInfoXML]    Script Date: 10/06/2012 8:30:56 AM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

ALTER PROC [dbo].[sp_CompleteParkInfoXML] @parkInfo nText
AS 
 DECLARE @hDoc int   
 
exec sp_xml_preparedocument @hDoc OUTPUT,@parkInfo   

--This code updates old data.
/**
UPDATE ParkInfo 
 SET 
   ParkInfo.EndDateTime = XMLParkInfo.EndDateTime,
   ParkInfo.LinkedTx = XMLParkInfo.LinkedTx
 FROM OPENXML(@hDoc, 'ParkInfo')   
       WITH (TxID BigInt, EndDateTime varchar(128),  LinkedTx varchar(1000))  XMLParkInfo
WHERE    ParkInfo.TxID = XMLParkInfo.TxID
***/

EXEC sp_xml_removedocument @hDoc

////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////

USE [AgileParking]
GO
/****** Object:  Trigger [dbo].[ParkInfo_CreateTrigger]    Script Date: 10/06/2012 9:22:53 AM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

ALTER TRIGGER [dbo].[ParkInfo_CreateTrigger] ON [dbo].[ParkInfo] 
	After Insert 
AS 
update ParkInfo
    set CreatedDate = CONVERT([date],getutcdate()), CreatedTime = CONVERT([time],getutcdate()), UpdatedDate = CONVERT([date],getutcdate()), UpdatedTime = CONVERT([time],getutcdate())
	where ParkInfo.TxID = (select i.TxId from inserted i)


////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////

USE [AgileParking]
GO
/****** Object:  Trigger [dbo].[ParkInfo_UpdateTrigger]    Script Date: 10/06/2012 9:23:02 AM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
ALTER TRIGGER [dbo].[ParkInfo_UpdateTrigger] ON [dbo].[ParkInfo] 
	After Update 
AS 
update ParkInfo
    set UpdatedDate = CONVERT([date],getutcdate()), UpdatedTime = CONVERT([time],getutcdate())
	where ParkInfo.TxID = (select i.TxId from inserted i)

///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

USE [AgileParking]
GO
/****** Object:  Trigger [dbo].[UserInfo_CreateTrigger]    Script Date: 10/06/2012 9:24:26 AM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO

ALTER TRIGGER [dbo].[UserInfo_CreateTrigger] ON [dbo].[UserInfo] 
	After Insert 
AS 
update UserInfo
    set CreatedDate = CONVERT([date],getutcdate()), CreatedTime = CONVERT([time],getutcdate()), UpdatedDate = CONVERT([date],getutcdate()), UpdatedTime = CONVERT([time],getutcdate())
	where UserInfo.UserID = (select i.UserID from inserted i)


//////////////////////////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////////////

USE [AgileParking]
GO
/****** Object:  Trigger [dbo].[UserInfo_UpdateTrigger]    Script Date: 10/06/2012 9:25:01 AM ******/
SET ANSI_NULLS ON
GO
SET QUOTED_IDENTIFIER ON
GO
ALTER TRIGGER [dbo].[UserInfo_UpdateTrigger] ON [dbo].[UserInfo] 
	After Update  NOT FOR REPLICATION
AS 
update UserInfo
    set UpdatedDate = CONVERT([date],getutcdate()), UpdatedTime = CONVERT([time],getutcdate())
	where UserInfo.UserID = (select i.UserID from inserted i)

