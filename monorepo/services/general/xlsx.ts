import * as XLSX from 'xlsx';

export interface IError {
  columnIndex?: number;
  columnName?: string;
  columnValue?: string;
  errorDescription?: string;
  [k: string]: unknown;
}

export const bufferToJson = (buffer: any, columns?: string[]): string[][] => {
  const workBook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetData = workBook.Sheets[workBook.SheetNames[0]];
  return XLSX.utils
    .sheet_to_json<string[]>(sheetData, { header: 1, raw: true, blankrows: false, defval: '' })
    .map(row => {
      if (columns) {
        row.length = columns.length;
        return row.reduce<string[]>((acc, cellValue, index) => {
          if (columns[index]) {
            acc.push(cellValue);
          }

          return acc;
        }, []);
      }

      return row;
    });
};

export const isValidXLSXMimetype = (mimetype: string) => {
  return (
    mimetype === 'application/vnd.ms-excel' ||
    mimetype === 'application/wps-office.xlsx' ||
    mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
};
export const isValidCSVMimetype = (mimetype: string) => {
  return mimetype === 'text/csv';
};

export function validateColumnsNames(columns: string[], expectColumns: { [key: string]: string }) {
  if (!columns) {
    return [];
  }
  const errors = [];
  const availableColumnsNames = Object.values(expectColumns);

  for (const column of columns) {
    if (!column) {
      continue;
    }
    const c = column.replace('*', '');

    if (!availableColumnsNames.includes(c)) {
      errors.push({
        strNumber: 0,
        row: columns,
        errors: [
          {
            columnIndex: columns.findIndex(c => c === column),
            columnName: column,
            columnValue: '',
            errorDescription: `Указано недопустимое название столбца '${column}'`,
          },
        ],
      });
    }
  }

  return errors;
}

export function validateLength(column: string | undefined, value: string, length: number): boolean {
  if (!column) {
    return true;
  }

  if (
    (column.match(userFileColumnsNames.name) ||
      column.match(userFileColumnsNames.surname) ||
      column.match(userFileColumnsNames.educationalInstitution) ||
      column.match(userFileColumnsNames.speciality) ||
      column.match(userFileColumnsNames.patronymic) ||
      column.match(staffingFileColumnsNames.subdivision) ||
      column.match(staffingFileColumnsNames.parent) ||
      column.match(staffingFileColumnsNames.position)) &&
    value &&
    value.length > length
  ) {
    return false;
  }

  return true;
}

export const userFileColumnsNames = {
  userType: 'Тип пользователя',
  surname: 'Фамилия',
  name: 'Имя',
  email: 'Электронная почта',
  patronymic: 'Отчество',
  birthDate: 'Дата рождения',
  phone: 'Номер телефона',
  sex: 'Пол',
  startEmploymentDate: 'Дата трудоустройства',
  education: 'Уровень образования',
  educationalInstitution: 'Учебное заведение',
  speciality: 'Специальность',
  messengerTelegram: 'Ник Telegram',
  messengerWhatsapp: 'Ник Whatsapp',
  roles: 'Роль',
};

export const staffingFileColumnsNames = {
  subdivision: 'Подразделение',
  parent: 'Головное подразделение',
  position: 'Должность',
  isLeader: 'Является ли руководителем подразделения',
  email: 'Электронная почта',
};
