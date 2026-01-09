import "next-auth";

import "next-auth/adapters";

declare module "next-auth" {
  interface Session {
    user?: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      roles?: string | null;
      member?: boolean;
    };
  }
}

declare module "next-auth/adapters" {
  interface AdapterUser {
    roles?: string | null;
    member?: boolean;
  }
}
