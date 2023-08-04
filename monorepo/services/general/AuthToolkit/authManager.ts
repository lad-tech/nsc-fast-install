import { isOrgLevelParams, isSubDivisionLevelParams, isUserLevelParams } from 'general/AuthToolkit/guard';
import {
  AllStageOptions,
  OrgLevelParams,
  Permission,
  StageOptions,
  SubDivisionLevelParams,
  UserLevelParams,
  UserLink,
  UserTypeLikeObject,
} from 'general/AuthToolkit/interfaces';
import { injectable } from 'inversify';

@injectable()
export class AuthManager<T extends UserTypeLikeObject[] = UserTypeLikeObject[]> {
  public permissionsSet: Array<{ uuid: string; name: string; permissions: Array<Permission> }> = [];
  private errors = { UNKNOWN_USERTYPE: 'Неизвестный тип пользователя' };

  /* Проверяет наличие наборов прав и возвращает view */
  public checkUserTypesExists(userTypes: { uuid: string }[]) {
    const userTypesIds = userTypes.map(({ uuid }) => uuid);
    const userTypesList = this.permissionsSet.filter(e => userTypesIds.includes(e.uuid));
    if (userTypesList.length !== userTypes.length) throw new Error(this.errors.UNKNOWN_USERTYPE);
    return userTypesList.map(({ uuid, name }) => ({ uuid, name }));
  }

  /* Получить массив типов пользователей */
  public getUserTypes() {
    return this.permissionsSet.map(e => ({ uuid: e.uuid, name: e.name }));
  }

  public checkAccess(payload: {
    userTypes: string[];
    userLinks: UserLink[];
    routeOptions: {
      params: unknown;
      path: string;
      method: string;
    };
  }) {
    const { userTypes, userLinks, routeOptions } = payload;

    const { method, path, params } = routeOptions;
    const key = this.getKeyFromData({ method, path });
    const permissions = this.getPermissionsByUserTypesUq(userTypes);

    if (this.isOrgLevelPath(path) && isOrgLevelParams(params)) {
      const stageOptions = { routeParams: params, permissions, key, userLinks };
      return this.checkAllLevelStage(stageOptions) || this.checkOrgLevelStage(stageOptions);
    } else if (this.isSubDivisionLevelPath(path) && isSubDivisionLevelParams(params)) {
      const stageOptions = { routeParams: params, permissions, key, userLinks };
      return (
        this.checkAllLevelStage(stageOptions) ||
        this.checkOrgLevelStage(stageOptions) ||
        this.checkSubDivisionLevelStage(stageOptions)
      );
    } else if (this.isUserLevelPath(path) && isUserLevelParams(params)) {
      const stageOptions = { routeParams: params, permissions, key, userLinks };
      return (
        this.checkAllLevelStage(stageOptions) ||
        this.checkOrgLevelStage(stageOptions) ||
        this.checkSubDivisionLevelStage(stageOptions) ||
        this.checkUserLevelStage(stageOptions)
      );
    } else {
      const stageOptions = { permissions, key };
      return this.checkAllLevelStage(stageOptions);
    }
  }

  private isOrgLevelPath(path: string) {
    return path.match(/^\/v\d+\/:orgId(?!\/:subDivisionId)(\/[a-zA-Z:-]+)*$/gm);
  }

  private isSubDivisionLevelPath(path: string) {
    return path.match(/^\/v\d+\/:orgId\/:subDivisionId(?!\/:userId)(\/[a-zA-Z:-]+)*$/gm);
  }

  private isUserLevelPath(path: string) {
    return path.match(/^\/v\d+\/:orgId\/:subDivisionId\/:userId(\/[a-zA-Z:-]+)*$/gm);
  }

  // Доступ по ключу с уровнем 'all'
  private checkAllLevelStage(options: AllStageOptions) {
    const { permissions, key } = options;
    const allLevelPermissions = this.getPermissionsByKeyAndLevel({ permissions, key, level: 'all' });
    return !!allLevelPermissions.length;
  }

  // Доступ по ключу с уровнем 'org'
  private checkOrgLevelStage(options: StageOptions<OrgLevelParams>) {
    const { routeParams, permissions, key, userLinks } = options;
    const orgLevelPermissions = this.getPermissionsByKeyAndLevel({ permissions, key, level: 'org' });
    const isUserLinked = userLinks.some(link => link.orgId === routeParams.orgId);
    const orgPermissionsWithoutValue = orgLevelPermissions.filter(e => !e.value);
    const isLinkAccess = !!orgPermissionsWithoutValue.length && isUserLinked;
    const isValueAccess = orgLevelPermissions.some(e => e.value === routeParams.orgId);
    return isLinkAccess || isValueAccess;
  }

  // Доступ по ключу с уровнем 'subdivision'
  private checkSubDivisionLevelStage(options: StageOptions<SubDivisionLevelParams>) {
    const { routeParams, permissions, key, userLinks } = options;
    const subDivisionLevelPermissions = this.getPermissionsByKeyAndLevel({ permissions, key, level: 'subdivision' });
    const isUserLinked = userLinks.some(
      link => link.orgId === routeParams.orgId && link.subDivisionId === routeParams.subDivisionId,
    );
    const subDivisionPermissionsWithoutValue = subDivisionLevelPermissions.filter(e => !e.value);
    const isLinkAccess = !!subDivisionPermissionsWithoutValue.length && isUserLinked;
    const isValueAccess = subDivisionLevelPermissions.some(e => e.value === routeParams.subDivisionId);
    return isLinkAccess || isValueAccess;
  }

  // Доступ по ключу с уровнем 'user'
  private checkUserLevelStage(options: StageOptions<UserLevelParams>) {
    const { routeParams, permissions, key, userLinks } = options;
    const userLevelPermissions = this.getPermissionsByKeyAndLevel({ permissions, key, level: 'user' });
    const isUserLinked = userLinks.some(
      link =>
        link.orgId === routeParams.orgId &&
        link.subDivisionId === routeParams.subDivisionId &&
        link.userId === routeParams.userId,
    );
    const userLevelPermissionsWithoutValue = userLevelPermissions.filter(e => !e.value);
    const isLinkAccess = !!userLevelPermissionsWithoutValue.length && isUserLinked;
    const isValueAccess = userLevelPermissions.some(e => e.value === routeParams.userId);
    return isLinkAccess || isValueAccess;
  }

  private getPermissionsByKeyAndLevel(payload: { permissions: Permission[]; key: string; level: Permission['level'] }) {
    const { permissions, level, key } = payload;
    return permissions.filter(e => e.key === key && e.level === level);
  }

  private getPermissionsByUserTypesUq(userTypes: string[]) {
    const { permissionsSet } = this;
    const permissions = permissionsSet
      .filter(({ uuid }) => userTypes.includes(uuid))
      .map(e => e.permissions)
      .flat();

    return [...new Set(permissions)];
  }

  private getKeyFromData(data: { method: string; path: string }) {
    const { path, method } = data;
    return `${method}>${path}`;
  }
}
