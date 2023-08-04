import { OrgLevelParams, SubDivisionLevelParams, UserLevelParams } from 'general/AuthToolkit/interfaces';

export const isOrgLevelParams = (params: unknown): params is OrgLevelParams =>
  Boolean((params as OrgLevelParams).orgId);

export const isSubDivisionLevelParams = (params: unknown): params is SubDivisionLevelParams =>
  Boolean((params as SubDivisionLevelParams).orgId) && Boolean((params as SubDivisionLevelParams).subDivisionId);

export const isUserLevelParams = (params: unknown): params is UserLevelParams =>
  Boolean((params as UserLevelParams).orgId) &&
  Boolean((params as UserLevelParams).subDivisionId) &&
  Boolean((params as UserLevelParams).userId);
