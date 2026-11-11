import { BarChart3, BookOpenText, ClipboardCheck, FileText, GraduationCap, Home, School, UserRoundCog, KeyRound } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { AppUser } from '../types';

export interface AppNavItem {
  path: string;
  label: string;
  title: string;
  icon: LucideIcon;
}

export const teacherNav: AppNavItem[] = [
  { path: '/classes', label: 'Lớp học', title: 'Quản lý lớp học', icon: School },
  { path: '/students', label: 'Học sinh', title: 'Quản lý học sinh', icon: GraduationCap },
  { path: '/assessments', label: 'Đề thi & bài tập', title: 'Đề thi & bài tập', icon: FileText },
  { path: '/grading', label: 'Chấm & duyệt bài', title: 'Chấm & duyệt bài', icon: ClipboardCheck },
  { path: '/analytics', label: 'Phân tích', title: 'Phân tích kết quả', icon: BarChart3 },
];

export const adminNav: AppNavItem[] = [
  { path: '/admin/users', label: 'Tài khoản', title: 'Tài khoản & phân quyền', icon: UserRoundCog },
  { path: '/admin/ai-keys', label: 'Khoá API AI', title: 'Khoá API AI', icon: KeyRound },
];

export const studentNav: AppNavItem[] = [
  { path: '/student', label: 'Tổng quan', title: 'Góc học tập của em', icon: Home },
];

export function navigationFor(role: AppUser['role']) {
  return role === 'student' ? studentNav : role === 'admin' ? [...teacherNav, ...adminNav] : teacherNav;
}

/** The menu item for a path, including nested pages such as /classes/:id. */
export function navItemFor(role: AppUser['role'], pathname: string) {
  const items = navigationFor(role);
  // A shared test belongs with the tests.
  const path = pathname.startsWith('/shared/') ? '/assessments' : pathname;
  return items.find(item => path === item.path || path.startsWith(`${item.path}/`)) || items[0];
}

export function homeFor(role: AppUser['role']) {
  return role === 'student' ? '/student' : role === 'admin' ? '/admin/users' : '/classes';
}

export const brandIcon = BookOpenText;
