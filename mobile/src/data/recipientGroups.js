export const recipientGroups = [
  {
    id: "company",
    label: "Company-wide",
    scope: "all",
    description: "All BPI Connect users",
    allowedRoles: ["Admin", "HR"],
  },
  {
    id: "all-tms",
    label: "All TMs",
    scope: "role",
    description: "All team members",
    allowedRoles: ["Admin", "HR"],
  },
  {
    id: "all-managers",
    label: "All Managers",
    scope: "role",
    description: "Managers and General Managers",
    allowedRoles: ["Admin", "HR"],
  },
  {
    id: "area-north",
    label: "North Area",
    scope: "area",
    description: "Stores assigned to North Area",
    allowedRoles: ["Admin", "HR", "Supervisor", "Coach"],
  },
  {
    id: "store-3001",
    label: "Store 3001",
    scope: "store",
    description: "Store group: managers and TMs",
    allowedRoles: ["Admin", "HR", "Supervisor", "Coach", "General Manager", "Manager"],
  },
  {
    id: "store-3209",
    label: "Store 3209",
    scope: "store",
    description: "Store group: managers and TMs",
    allowedRoles: ["Admin", "HR", "Supervisor", "Coach", "General Manager", "Manager"],
  },
];

export function getVisibleRecipientGroups(user) {
  if (!user) return [];

  if (user.role === "Admin" || user.role === "HR") {
    return recipientGroups;
  }

  if (user.role === "Supervisor" || user.role === "Coach") {
    return recipientGroups.filter((group) =>
      ["area", "store"].includes(group.scope)
    );
  }

  if (user.role === "Manager" || user.role === "General Manager") {
    return recipientGroups.filter((group) => group.id === user.storeGroupId);
  }

  return [];
}

export function canSendBroadcast(user) {
  if (!user) return false;

  return ["Admin", "HR", "Supervisor", "Coach"].includes(user.role);
}
