export type UserTypeLikeObject = { uuid: string; permissions: string[] };
export type OrgLevelParams = { orgId: string };
export type SubDivisionLevelParams = OrgLevelParams & { subDivisionId: string };
export type UserLevelParams = SubDivisionLevelParams & { userId: string };
export type UserLink = { orgId: string; subDivisionId: string; userId: string };
export type Permission = {
  key: string;
  level: 'org' | 'subdivision' | 'user' | 'all';
  value?: string;
  description: string;
  options: { nested: boolean };
};
export type AllStageOptions = { permissions: Permission[]; key: string };
export type StageOptions<RouteParams = OrgLevelParams | SubDivisionLevelParams | UserLevelParams> = AllStageOptions & {
  routeParams: RouteParams;
  userLinks: UserLink[];
};
