export const HARD_CODE_UUIDS = {
  MODERATOR: '2ca69e0a-2c3e-494f-87b3-dbe19e1dde20',
  HR_DIRECTOR: '8ff203d6-5253-4b75-bffd-11a041772b09',
  HR_SPECIALIST: '1b8e2730-d7f7-43d6-8f66-a7d0e2e8beb9',
  SUPERVISOR: '2e8defa6-7439-4222-8183-fc880d399852',
  EMPLOYEE: 'f1f04fd2-3797-4e30-8987-d0e3a9c9ad99',
  CANDIDATE: '1d036af9-281d-47de-8a3e-3e45e3fcbdbf',
  ADMIN: '6e2605b6-99be-4af4-bd5e-56b71fca53fc',
} as const;
/**
 * Базовые типы пользователей
 * Модератор
 * HR-директор
 * HR-специалист
 * Руководитель
 * Сотрудник
 * Кандидат
 */

export const USER_TYPES_HARDCODE = [
  { name: 'Администратор', description: '', uuid: HARD_CODE_UUIDS.ADMIN },
  {
    name: 'Модератор',
    description: '',
    uuid: HARD_CODE_UUIDS.MODERATOR,
  },
  {
    name: 'HR-директор',
    description: '',
    uuid: HARD_CODE_UUIDS.HR_DIRECTOR,
  },
  {
    name: 'HR-специалист',
    description: '',
    uuid: HARD_CODE_UUIDS.HR_SPECIALIST,
  },
  {
    name: 'Руководитель',
    description: '',
    uuid: HARD_CODE_UUIDS.SUPERVISOR,
  },
  {
    name: 'Сотрудник',
    description: '',
    uuid: HARD_CODE_UUIDS.EMPLOYEE,
  },
  {
    name: 'Кандидат',
    description: '',
    uuid: HARD_CODE_UUIDS.CANDIDATE,
  },
] as const;
