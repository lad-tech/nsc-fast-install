export interface Hash {
  hash: string;
  salt: string;
}

export type Auth = {
  token: string;
  refreshToken: string;
  expired: number;
};

export interface Credentials {
  uuid: string;
  email: string;
  userTypes: string[];
  // TODO: под вопросом, возможно объект будет выглядеть по другому
  userLinks: { orgId: string; subDivisionId: string; userId: string }[];
}

export interface RefreshTokenCredentioals {
  role: string;

  refreshKey: string;
}
