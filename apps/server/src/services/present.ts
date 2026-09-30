import type { Role } from '@bnhs/core';
import { iso } from '../util';

interface UserRow {
  id: number;
  username: string;
  fullName: string;
  role: string;
  email?: string | null;
  employeeNo?: string | null;
  active?: boolean;
  mustChangePassword: boolean;
  learnerId: number | null;
  lastLoginAt?: Date | null;
}

/** The parts of a user that are safe to send to a browser. */
export function publicUser(u: UserRow) {
  return {
    id: u.id,
    username: u.username,
    fullName: u.fullName,
    role: u.role as Role,
    email: u.email ?? null,
    employeeNo: u.employeeNo ?? null,
    active: u.active ?? true,
    mustChangePassword: u.mustChangePassword,
    learnerId: u.learnerId,
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
  };
}

interface LearnerRow {
  id: number;
  lrn: string;
  lastName: string;
  firstName: string;
  middleName: string | null;
  extName: string | null;
  sex: string;
  birthDate: Date;
  birthPlace: string | null;
  address: string | null;
  religion: string | null;
  motherTongue: string | null;
  ipGroup: string | null;
  guardianName: string | null;
  guardianRelation: string | null;
  guardianContact: string | null;
  previousSchool: string | null;
  status: string;
}

export function presentLearner(l: LearnerRow) {
  return { ...l, birthDate: iso(l.birthDate) as string };
}

export function briefLearner(l: Pick<LearnerRow, 'id' | 'lrn' | 'lastName' | 'firstName' | 'middleName' | 'extName' | 'sex'>) {
  return {
    id: l.id,
    lrn: l.lrn,
    lastName: l.lastName,
    firstName: l.firstName,
    middleName: l.middleName,
    extName: l.extName,
    sex: l.sex,
  };
}
