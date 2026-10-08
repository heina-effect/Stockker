import "server-only";

/**
 * Supabase/PostgREST 기본 응답 상한(보통 1,000행)에 걸려 결과가 조용히 잘리는 것을 막기 위한
 * range() 기반 전체 조회 헬퍼.
 *
 * buildQuery는 페이지마다 새로 쿼리를 구성해 넘겨야 한다(같은 쿼리 빌더 재사용 불가 — Supabase
 * 쿼리 빌더는 1회용). 페이지 경계에서 결과가 안정적이려면 buildQuery 안에서 반드시 .order()를
 * 걸어야 한다(정렬 없이 .range()만 쓰면 페이지마다 다른 순서가 나올 수 있어 행이 중복되거나
 * 누락될 수 있다).
 */
export async function fetchAllRows<T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await buildQuery(from, to);
    if (error) throw new Error(error.message);
    const rows = data || [];
    all.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;
  }
  return all;
}
