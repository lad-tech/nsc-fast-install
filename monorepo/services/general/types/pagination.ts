/**
 * Пагинация ответа
 * @interface
 */
export interface IPaginationResponse<D> {
  data: D;
  totalCount: number;
  totalPages: number;
  size: number;
  page: number;
}
/**
 * Параметры пагинации
 * @interface
 */
export interface IPaginationParam {
  size?: number;
  page?: number;
}
/**
 * Пагинация запроса
 * @interface
 */
export declare type IPaginationRequest<D> = D & IPaginationParam;

/**
 * Расчет пагинации
 * @param  params   страница и размер страницы
 * @returns {{size: number, from: number, page: number}}
 * @constructor
 */
export function getPagination(params: { page?: number; size?: number }): { from: number; size: number; page: number } {
  const size = params.size || 24;
  const page = params.page || 1;
  const from = (page - 1) * size;
  return { from, size, page };
}
