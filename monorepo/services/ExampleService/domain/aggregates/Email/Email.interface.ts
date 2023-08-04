export interface CreateNewEmailParam {
  uuid?: string;
  email: string;
}

export interface InitEmail extends CreateNewEmailParam {
  created: Date;
  updated: Date;
}
