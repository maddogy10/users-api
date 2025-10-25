export interface User {
  id?: number;
  firstName: string;
  lastName: string;
  email: string;
  bio: string;
  major: string;
  graduationYear: number;
  profilePicture: string;
  createdAt?: string;
}