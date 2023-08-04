import { User } from 'core/domain/aggregates/User';
import { pbkdf2, randomBytes, randomUUID } from 'crypto';
import type { Configurator } from 'general/Configurator';
import type { Credentials, Hash } from 'general/interfaces';
import { TYPES } from 'general/inversify.config';
import { inject, injectable } from 'inversify';
import * as jsonwebtoken from 'jsonwebtoken';
import { promisify } from 'util';

export type Auth = {
  token: string;
  refreshToken: string;
  expired: number;
};

export interface IGenerateAuthResult {
  refreshKey: string;
  auth: Auth;
}

export interface AuthToolkitInterface {
  getAuthInfo(user: User): IGenerateAuthResult;

  verifyJwtToken(token: string): Promise<Credentials>;

  getHash(password: string): Promise<Hash>;

  compare(password: string, hash: Hash): Promise<boolean>;
}

@injectable()
export class AuthToolkit<USER extends User = User> {
  private readonly iterations = 10000;
  private readonly keylen = 256;
  private readonly hashAlgorithm = 'sha256';
  private readonly jwtAlgorithm = 'HS256';
  private readonly saltLength = 32;
  private JWT_TOKEN_SECRET: string;
  private JWT_TOKEN_TTL_IN_SECOND: number;
  private REFRESH_TOKEN_TTL_IN_SECOND: number;
  private _getHash = promisify(pbkdf2);
  private lowercase = 'abcdefghijklmnopqrstuvwxyz';
  private uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  private numbers = '0123456789';
  private symbols = '$%#&@*';

  constructor(@inject(TYPES.Configurator) configurator: Configurator) {
    this.JWT_TOKEN_SECRET = configurator.getSettingFromEnv('JWT_TOKEN_SECRET');
    this.JWT_TOKEN_TTL_IN_SECOND = configurator.castToNumber(configurator.getSettingFromEnv('JWT_TOKEN_TTL_IN_SECOND'));
    this.REFRESH_TOKEN_TTL_IN_SECOND = configurator.castToNumber(
      configurator.getSettingFromEnv('REFRESH_TOKEN_TTL_IN_SECOND'),
    );
  }

  public getAuthInfo(user: USER) {
    const userView = user.getView();
    const { uuid, email } = user.getView();
    const userTypes = userView.userTypes.map(e => e.uuid);
    const userLinks = userView.positions.map(({ orgId, subDivisionId }) => ({ orgId, subDivisionId, userId: uuid }));

    const token = jsonwebtoken.sign({ uuid, email, userTypes, userLinks }, this.JWT_TOKEN_SECRET, {
      algorithm: this.jwtAlgorithm,
      expiresIn: this.JWT_TOKEN_TTL_IN_SECOND,
    });
    const refreshKey = randomUUID();
    const expired = new Date();
    expired.setSeconds(expired.getSeconds() + this.JWT_TOKEN_TTL_IN_SECOND);
    return {
      refreshKey,
      auth: {
        token,
        refreshToken: jsonwebtoken.sign({ refreshKey, userTypes, userLinks }, this.JWT_TOKEN_SECRET, {
          algorithm: this.jwtAlgorithm,
          expiresIn: this.REFRESH_TOKEN_TTL_IN_SECOND,
        }),
        expired: +expired,
      },
    };
  }

  public async verifyJwtToken(token: string) {
    return new Promise<Credentials>((resolve, reject) => {
      jsonwebtoken.verify(token, this.JWT_TOKEN_SECRET, (error: Error | null, payload: Credentials | any) => {
        if (error || !payload || typeof payload === 'string' || !payload.exp) {
          return reject();
        }

        const expired = payload.exp * 1000 < Date.now();
        if (expired) {
          return reject();
        }
        resolve(payload as Credentials);
      });
    });
  }

  public async compare(password: string, { hash, salt }: Hash) {
    const hashedPassword = await this._getHash(password, salt, this.iterations, this.keylen, this.hashAlgorithm);
    return this.getString(hashedPassword) === hash;
  }

  public async getHash(password: string) {
    const salt = this.getString(randomBytes(this.saltLength));
    const hash = await this._getHash(password, salt, this.iterations, this.keylen, this.hashAlgorithm);
    return { hash: this.getString(hash), salt };
  }

  public genPassword(len: number) {
    let password = '';

    password += this.numbers.charAt(Math.floor(Math.random() * this.numbers.length));
    password += this.symbols.charAt(Math.floor(Math.random() * this.symbols.length));
    password += this.uppercase.charAt(Math.floor(Math.random() * this.uppercase.length));
    for (let i = 0; i < len - 3; i++) {
      password += this.lowercase.charAt(Math.floor(Math.random() * this.lowercase.length));
    }

    return password.split('').sort().join('');
  }

  public generateVerificationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private getString(value: Buffer) {
    return value.toString('hex');
  }
}
