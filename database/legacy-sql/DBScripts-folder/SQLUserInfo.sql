USE [AgileParking]
GO

INSERT INTO [dbo].[UserInfo]
           ([UserID]
           ,[UserEmail]
           ,[FullName]
           ,[Password]
           ,[CellNumber]
           ,[UserType]
           ,[AccountID]
           ,[ResidentAddressID]
           ,[MailingAddressID]
           ,[Status]
           ,[DefaultLicensePlate]
           ,[LicensePlatesSeparatedBySemiColon]
     VALUES
           (<UserID, bigint,>
           ,<UserEmail, nvarchar(128),>
           ,<FullName, nvarchar(128),>
           ,<Password, nvarchar(64),>
           ,<CellNumber, nchar(16),>
           ,<UserType, char(1),>
           ,<AccountID, bigint,>
           ,<ResidentAddressID, bigint,>
           ,<MailingAddressID, bigint,>
           ,<Status, nvarchar(128),>
           ,<DefaultLicensePlate, nvarchar(16),>
           ,<LicensePlatesSeparatedBySemiColon, nvarchar(256),>
GO


