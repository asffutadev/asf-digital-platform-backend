export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  department: string | null;
  departmentId: string | null;
  gender: string | null;
  academicLevel: string;
  accountStatus: string;
  mustChangePassword: boolean;
  roles: string[];
}