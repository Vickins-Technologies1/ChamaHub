"use client";

import { useUser } from "@clerk/nextjs";

/** Compatibility view used by existing client-side navigation components. */
export const authClient = {
  useSession() {
    const { isLoaded, isSignedIn, user } = useUser();
    const role = user?.publicMetadata.role;
    return {
      isPending: !isLoaded,
      data:
        isLoaded && isSignedIn && user
          ? {
              user: {
                id: user.externalId || user.id,
                email: user.primaryEmailAddress?.emailAddress ?? null,
                name: [user.firstName, user.lastName].filter(Boolean).join(" "),
                role: typeof role === "string" ? role : "member",
              },
            }
          : null,
    };
  },
};
