import type { AppUser, Assessment } from '../../shared/types';
import type { SqlFilter } from '../common/paging';

/*
 * Who sees an assessment, and everything hanging off it (submissions, grading, analytics, AI suggestions):
 *   - an admin sees all of them;
 *   - a teacher sees the ones they created. Teachers sharing a class still each see only their own tests.
 *   - Assessments from before ownership existed (no owner) stay visible to the teachers of their classes.
 * `scope` is the user's class ids from ClassesService.scopeFor (null for an admin).
 */

export function canSeeAssessment(user: AppUser, scope: string[] | null, item: Pick<Assessment, 'ownerId' | 'classIds'>) {
  if (user.role === 'admin' || scope === null) return true;
  if (item.ownerId) return item.ownerId === user.id;
  return item.classIds.some(id => scope.includes(id));
}

/**
 * The same rule as SQL for assessment rows aliased `alias`; values go into `f` as parameters.
 * Returns '' when everything is visible (admin).
 */
export function visibleAssessmentSql(user: AppUser, scope: string[] | null, f: SqlFilter, alias = 'a') {
  if (user.role === 'admin' || scope === null) return '';
  const me = f.param(user.id);
  const classes = f.param(scope);
  return `(${alias}.owner_id = ${me} OR (${alias}.owner_id IS NULL AND ${alias}.data->'classIds' ?| ${classes}::text[]))`;
}
