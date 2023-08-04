import type { EventStreamHandler, Emitter } from '@lad-tech/nsc-toolkit';

/**
 * Данный файл сгенерирован автоматически. Для модификации интерфейсов исправьте схему сервиса
 */
export interface GetEmailsRequest {
  [k: string]: unknown | undefined;
}

export type GetEmailsResponse = {
  uuid?: string;
  email?: string;
  [k: string]: unknown | undefined;
}[];

export interface AddEmailsRequest {
  emails: string[];
  [k: string]: unknown | undefined;
}

export interface AddEmailsResponse {
  error?: string;
  list: {
    uuid: string;
    email: string;
    [k: string]: unknown | undefined;
  }[];
  [k: string]: unknown | undefined;
}

export interface DeleteEmailsRequest {
  uuid: string;
  [k: string]: unknown | undefined;
}

export type DeleteEmailsResponse = {
  uuid?: string;
  email?: string;
  [k: string]: unknown | undefined;
}[];

export type StaffListNewReport = {
  name: string;
  subdivision: string;
  parent: string;
  position: string;
  isLeader: string;
  employeeFullName: string;
  userUuid: string;
}[];

export interface StaffingCreatedWithEmailsEvent {
  emails: string[];
  authorName: string;
  orgName: string;
  startDate: string;
  goToStaffingLink: string;
  staffList: StaffListNewReport;
}

export interface EmitterSettings {
  StaffingCreatedWithEmails: (params: StaffingCreatedWithEmailsEvent) => void;

  [eventName: string]: (params: any) => void;
}

export interface EmitterSettingsExternal extends Emitter {
  StaffingCreatedWithEmails: EventStreamHandler<StaffingCreatedWithEmailsEvent>;
}
