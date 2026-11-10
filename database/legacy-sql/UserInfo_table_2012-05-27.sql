USE [AgileParking]
GO

ALTER TABLE [dbo].[UserInfo] DROP CONSTRAINT [DF_UserInfo_UpdatedTime]
GO

ALTER TABLE [dbo].[UserInfo] DROP CONSTRAINT [DF_UserInfo_UpdatedDate]
GO

ALTER TABLE [dbo].[UserInfo] DROP CONSTRAINT [DF_UserInfo_CreatedTime]
GO

ALTER TABLE [dbo].[UserInfo] DROP CONSTRAINT [DF_UserInfo_CreatedDate]
GO

/****** Object:  Table [dbo].[UserInfo]    Script Date: 26/05/2012 3:42:01 PM ******/
DROP TABLE [dbo].[UserInfo]
GO

/****** Object:  Table [dbo].[UserInfo]    Script Date: 26/05/2012 3:42:01 PM ******/
SET ANSI_NULLS ON
GO

SET QUOTED_IDENTIFIER ON
GO

CREATE TABLE [dbo].[UserInfo](
	[UserID] [bigint] NOT NULL,
	[UserEmail] [nvarchar](128) NOT NULL,
	[FullName] [nvarchar](128) NOT NULL,
	[Password] [nvarchar](64) NOT NULL,
	[PrimaryCell] [nchar](16) NOT NULL,
	[AccountID] [bigint] NULL,
	[ResidentAddressID] [bigint] NULL,
	[MailingAddressID] [bigint] NULL,
	[CreatedDate] [date] NOT NULL,
	[CreatedTime] [time](7) NOT NULL,
	[UpdatedDate] [date] NOT NULL,
	[UpdatedTime] [time](7) NOT NULL
) ON [PRIMARY]

GO

ALTER TABLE [dbo].[UserInfo] ADD  CONSTRAINT [DF_UserInfo_CreatedDate]  DEFAULT (CONVERT([date],getutcdate())) FOR [CreatedDate]
GO

ALTER TABLE [dbo].[UserInfo] ADD  CONSTRAINT [DF_UserInfo_CreatedTime]  DEFAULT (CONVERT([time],getutcdate())) FOR [CreatedTime]
GO

ALTER TABLE [dbo].[UserInfo] ADD  CONSTRAINT [DF_UserInfo_UpdatedDate]  DEFAULT (CONVERT([date],getutcdate())) FOR [UpdatedDate]
GO

ALTER TABLE [dbo].[UserInfo] ADD  CONSTRAINT [DF_UserInfo_UpdatedTime]  DEFAULT (CONVERT([time],getutcdate())) FOR [UpdatedTime]
GO

